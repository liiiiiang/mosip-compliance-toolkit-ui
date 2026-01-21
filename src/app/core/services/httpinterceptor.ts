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

  showHomePage = async (isAndroidAppMode: boolean) => {
    sessionStorage.clear();
    localStorage.clear();
    this.cookieService.deleteAll();
    if (!isAndroidAppMode) {
      this.redirectService.redirect(window.location.href);
    } else {
      // Extract domain from SERVICES_BASE_URL for Cookie deletion
      let cookieUrl = environment.SERVICES_BASE_URL;
      try {
        const urlObj = new URL(environment.SERVICES_BASE_URL);
        cookieUrl = `${urlObj.protocol}//${urlObj.host}`;
      } catch (e) {
        console.warn('Failed to parse SERVICES_BASE_URL for cookie domain:', e);
      }
      await CapacitorCookies.deleteCookie({
        url: cookieUrl,
        key: appConstants.AUTHORIZATION
      });
      await this.androidKeycloakService.getInstance().login();
    }
  }

  addCookieForAndroid = async () => {
    const accessToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
    if (accessToken) {
      // Extract domain from SERVICES_BASE_URL for Cookie setting
      // CapacitorCookies.setCookie requires only the domain part, not the full URL
      let cookieUrl = environment.SERVICES_BASE_URL;
      try {
        const urlObj = new URL(environment.SERVICES_BASE_URL);
        cookieUrl = `${urlObj.protocol}//${urlObj.host}`;
        console.log('Setting cookie for domain:', cookieUrl);
      } catch (e) {
        // If URL parsing fails, use the original URL
        console.warn('Failed to parse SERVICES_BASE_URL for cookie domain:', e);
      }
      try {
        await CapacitorCookies.setCookie({
          url: cookieUrl,
          key: appConstants.AUTHORIZATION,
          value: accessToken ? accessToken : '',
        });
        console.log('Cookie set successfully for:', cookieUrl);
        console.log('Token length:', accessToken ? accessToken.length : 0);
        // Verify cookie was set by trying to get it
        try {
          const cookiesResult = await CapacitorCookies.getCookies({ url: cookieUrl });
          const cookieList = (cookiesResult as any)['cookies'] || (cookiesResult as any).cookies;
          if (Array.isArray(cookieList)) {
            const authCookie = cookieList.find((c: any) => c.name === appConstants.AUTHORIZATION);
            if (authCookie) {
              console.log('Cookie verified - found Authorization cookie:', authCookie.name);
            } else {
              console.warn('Cookie verification failed - Authorization cookie not found. Available cookies:', cookieList.map((c: any) => c.name));
            }
          } else {
            console.log('Cookie set completed (verification skipped due to type mismatch)');
          }
        } catch (verifyError) {
          console.warn('Could not verify cookie:', verifyError);
        }
      } catch (error) {
        console.error('Failed to set cookie:', error);
      }
    } else {
      console.warn('No access token found in localStorage');
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
                const langCode = this.decoded['locale'];
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
                this.showHomePage(isAndroidAppMode)
                  .catch((error) => {
                    console.log(error);
                  });
              }
            }
          }
        },
        (err) => {
          if (err instanceof HttpErrorResponse) {
            if (!isLocalUrl) {
              // CRITICAL FIX: Prevent infinite loop by checking if we're in the middle of token exchange
              // Don't trigger re-login if:
              // 1. Token exchange is in progress
              // 2. Auth just failed recently (within 30 seconds)
              // 3. We're processing a callback
              const isTokenExchangeInProgress = sessionStorage.getItem('keycloak_auth_processing') === 'true';
              const authFailed = sessionStorage.getItem('keycloak_auth_failed');
              const authFailedTime = authFailed ? parseInt(sessionStorage.getItem('keycloak_auth_failed_time') || '0') : 0;
              const recentlyFailed = authFailed && (Date.now() - authFailedTime < 30000); // 30 seconds cooldown
              const hasCodeInUrl = window.location.search.includes('code=');
              
              // Check if this is a validateToken or configs request that failed
              // These are the ones that trigger the loop
              const isAuthCheckRequest = err.url && (
                err.url.includes('validateToken') || 
                err.url.includes('/configs')
              );
              
              if (isAuthCheckRequest && (isTokenExchangeInProgress || recentlyFailed || hasCodeInUrl)) {
                console.log('[HTTP-INTERCEPTOR] Skipping re-login trigger', {
                  reason: isTokenExchangeInProgress ? 'token_exchange_in_progress' : 
                          recentlyFailed ? 'recent_auth_failure' : 
                          hasCodeInUrl ? 'callback_in_progress' : 'unknown',
                  status: err.status,
                  url: err.url,
                  isTokenExchangeInProgress: isTokenExchangeInProgress,
                  recentlyFailed: recentlyFailed,
                  hasCodeInUrl: hasCodeInUrl
                });
                
                // If token exchange is in progress, wait a bit and check again
                if (isTokenExchangeInProgress) {
                  setTimeout(() => {
                    const tokenNow = !!localStorage.getItem(appConstants.ACCESS_TOKEN);
                    if (!tokenNow) {
                      console.warn('[HTTP-INTERCEPTOR] Token exchange completed but no token found, will retry auth check');
                      // Token exchange completed but failed, allow retry after a delay
                      setTimeout(() => {
                        if (!localStorage.getItem(appConstants.ACCESS_TOKEN)) {
                          console.log('[HTTP-INTERCEPTOR] Still no token after delay, triggering re-login');
                          this.showHomePage(isAndroidAppMode).catch((error) => {
                            console.log(error);
                          });
                        }
                      }, 2000);
                    }
                  }, 3000); // Wait 3 seconds for token exchange to complete
                }
                return; // Don't trigger re-login immediately
              }
              
              // For other errors or if conditions are met, proceed with re-login
              this.showHomePage(isAndroidAppMode)
                .catch((error) => {
                  console.log(error);
                });
            }
          }
        }
      )
    );
  }
}