import { Injectable } from '@angular/core';
import { tap } from 'rxjs/operators';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpResponse,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { LoginRedirectService } from './loginredirect.service';
import { AppConfigService } from 'src/app/app-config.service';
import { UserProfileService } from 'src/app/core/services/user-profile.service';
import jwt_decode from 'jwt-decode';
import { CookieService } from 'ngx-cookie-service';
import * as appConstants from 'src/app/app.constants';
import { environment } from 'src/environments/environment';
import { AndroidKeycloakService } from './android-keycloak';
import { CapacitorCookies } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class AuthInterceptor implements HttpInterceptor {
  errorMessages: any;
  decoded: any;

  private isHandlingAuthError: boolean = false;

  showHomePage = async (isAndroidAppMode: boolean) => {
    // Prevent multiple simultaneous auth error handling
    if (this.isHandlingAuthError) {
      console.log('AuthInterceptor: Auth error handling already in progress, skipping');
      return;
    }

    // For Android, check if login is already in progress
    if (isAndroidAppMode && this.androidKeycloakService.isLoginInProgress()) {
      console.log('AuthInterceptor: Login already in progress, skipping redirect');
      return;
    }

    console.log('AuthInterceptor: showHomePage called, isAndroidAppMode:', isAndroidAppMode);
    this.isHandlingAuthError = true;
    
    try {
      sessionStorage.clear();
      localStorage.clear();
      this.cookieService.deleteAll();
      
      if (!isAndroidAppMode) {
        this.redirectService.redirect(window.location.href);
      } else {
        console.log('AuthInterceptor: Clearing cookies and initiating login');
        await CapacitorCookies.deleteCookie({
          url: encodeURI(environment.SERVICES_BASE_URL),
          key: appConstants.AUTHORIZATION
        });
        await this.androidKeycloakService.login();
      }
    } catch (error) {
      console.error('AuthInterceptor: Error in showHomePage:', error);
    } finally {
      // Reset flag after a delay to allow for normal flow
      setTimeout(() => {
        this.isHandlingAuthError = false;
      }, 3000);
    }
  }

  addCookieForAndroid = async () => {
    const accessToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
    if (accessToken) {
      await CapacitorCookies.setCookie({
        url: encodeURI(environment.SERVICES_BASE_URL),
        key: appConstants.AUTHORIZATION,
        value: accessToken ? accessToken : '',
      });
    }
  }
  constructor(
    private redirectService: LoginRedirectService,
    private appConfigService: AppConfigService,
    private cookieService: CookieService,
    private userProfileService: UserProfileService,
    private androidKeycloakService: AndroidKeycloakService
  ) { }
  // function which will be called for all http calls
  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    let isLocalUrl = false;
    if (this.appConfigService.getConfig() && !isAndroidAppMode) {
      const sbiUrl = this.appConfigService.getConfig()['SBI_BASE_URL'];
      const sdkUrl = localStorage.getItem(appConstants.SDK_PROJECT_URL);
      if (request.url.includes(sbiUrl)) {
        isLocalUrl = true;
      }
      if (sdkUrl && request.url.includes(sdkUrl)) {
        isLocalUrl = true;
      }
    }
    if (!isLocalUrl) {
      if (!isAndroidAppMode) {
        //for web application
        request = request.clone({ withCredentials: true });
        request = request.clone({
          setHeaders: { 'X-XSRF-TOKEN': this.cookieService.get('XSRF-TOKEN') },
        });
      } else {
        //for android 9,10,11 the Capacitor Cookies will set
        //the cookie header with token and 'withCredentials' work
        this.addCookieForAndroid().catch((error) => {
          console.log(error);
        });
        request = request.clone({ withCredentials: true });
        //for android 12+, the Capacitor Cookies and 'withCredentials' do not work
        //hence setting token as a new header 'accessToken'
        //this should be mapped to cookie header in nginx conf
        let accessToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
        request = request.clone({
          setHeaders: { 'accessToken': accessToken ? accessToken : "" },
        });
      }
    }
    if (request.url.includes('i18n')) {
      isLocalUrl = true;
    }
    return next.handle(request).pipe(
      tap(
        (event) => {
          if (event instanceof HttpResponse) {
            if (event.url && event.url.split('/').includes('validateToken')) {
              if (event.body.response) {
                this.decoded = jwt_decode(event.body.response.token);
                this.userProfileService.setDisplayUserName(
                  this.decoded['name']
                );
                this.userProfileService.setUsername(event.body.response.userId);
                this.userProfileService.setRoles(event.body.response.role);
                //Set all attributes required for selected language
                let langCode = this.decoded['locale'];
                if (!langCode) {
                  langCode = 'eng';
                }
                // Set user preferred language
                const fileUrl = `./assets/i18n/${langCode}.json`;
                fetch(fileUrl, { method: 'HEAD' })
                  .then(response => {
                    if (response.ok) {
                      // The file exists
                      this.userProfileService.setUserPreferredLanguage(langCode);
                    } else {
                      // The file does not exist
                      this.userProfileService.setUserPreferredLanguage('eng');
                    }
                  })
                  .catch(error => {
                    console.log(error);
                  });
                //Set if language is RTL or LTR
                const rtlLanguages = this.appConfigService.getConfig()['rtlLanguages']
                  ? this.appConfigService.getConfig()['rtlLanguages'].split(',')
                  : [];
                let isRtl = false;
                if (rtlLanguages.includes(langCode)) {
                  isRtl = true;
                }
                if (isRtl) {
                  this.userProfileService.setTextDirection('rtl');
                } else {
                  this.userProfileService.setTextDirection('ltr');
                }
              }
              if (
                event.body.errors !== null &&
                event.body.errors.length > 0 &&
                (event.body.errors[0]['errorCode'] ===
                  appConstants.AUTH_ERROR_CODE[0] ||
                  event.body.errors[0]['errorCode'] ===
                  appConstants.AUTH_ERROR_CODE[1])
              ) {
                console.log('AuthInterceptor: Authentication error in validateToken response');
                // For Android, only trigger login if not already logging in
                if (isAndroidAppMode) {
                  if (!this.androidKeycloakService.isLoginInProgress()) {
                    this.showHomePage(isAndroidAppMode)
                      .catch((error) => {
                        console.error('AuthInterceptor: Error in showHomePage:', error);
                      });
                  } else {
                    console.log('AuthInterceptor: Login in progress, skipping error handling');
                  }
                } else {
                  this.showHomePage(isAndroidAppMode)
                    .catch((error) => {
                      console.error('AuthInterceptor: Error in showHomePage:', error);
                    });
                }
              }
            }
          }
        },
        (err) => {
          if (err instanceof HttpErrorResponse) {
            // Only trigger login for authentication-related errors
            // Skip for network errors, timeouts, or other non-auth errors
            const status = err.status;
            const isAuthError = status === 401 || status === 403;
            
            console.log('AuthInterceptor: HTTP error:', {
              status,
              url: err.url,
              isLocalUrl,
              isAuthError
            });

            if (isAuthError && !isLocalUrl) {
              // For Android, only trigger login if not already logging in
              if (isAndroidAppMode) {
                if (!this.androidKeycloakService.isLoginInProgress()) {
                  this.showHomePage(isAndroidAppMode)
                    .catch((error) => {
                      console.error('AuthInterceptor: Error in showHomePage:', error);
                    });
                } else {
                  console.log('AuthInterceptor: Login in progress, skipping error handling');
                }
              } else {
                // For web, always trigger redirect
                this.showHomePage(isAndroidAppMode)
                  .catch((error) => {
                    console.error('AuthInterceptor: Error in showHomePage:', error);
                  });
              }
            } else if (!isLocalUrl && (status === 0 || status >= 500)) {
              // Network errors or server errors - don't trigger login
              console.log('AuthInterceptor: Network or server error, not triggering login');
            }
          }
        }
      )
    );
  }
}
