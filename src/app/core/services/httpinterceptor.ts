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
    console.log('[DEBUG] ====== AuthInterceptor.showHomePage() CALLED ======');
    console.log('[DEBUG] Timestamp:', new Date().toISOString());
    console.log('[DEBUG] isAndroidAppMode:', isAndroidAppMode);
    console.log('[DEBUG] isHandlingAuthError before check:', this.isHandlingAuthError);
    
    // Prevent multiple simultaneous auth error handling
    if (this.isHandlingAuthError) {
      console.log('[DEBUG] WARNING: Auth error handling already in progress, skipping');
      console.log('[DEBUG] ====== showHomePage() ABORTED (already handling) ======');
      return;
    }

    // For Android, check if login is already in progress
    if (isAndroidAppMode) {
      const isLoginInProgress = this.androidKeycloakService.isLoginInProgress();
      console.log('[DEBUG] Android mode - isLoginInProgress:', isLoginInProgress);
      
      if (isLoginInProgress) {
        console.log('[DEBUG] WARNING: Login already in progress, skipping redirect');
        console.log('[DEBUG] ====== showHomePage() ABORTED (login in progress) ======');
        return;
      }
    }

    console.log('[DEBUG] Proceeding with showHomePage...');
    console.log('[DEBUG] Setting isHandlingAuthError to true');
    this.isHandlingAuthError = true;
    
      try {
      // Check token before clearing
      const tokenBeforeClear = localStorage.getItem(appConstants.ACCESS_TOKEN);
      console.log('[DEBUG] Token in localStorage before clear:', tokenBeforeClear ? 'EXISTS (length: ' + tokenBeforeClear.length + ')' : 'NOT_EXISTS');
      
      // Preserve login completion flag if it exists (to prevent clearing it)
      const loginCompletedFlag = localStorage.getItem('android_keycloak_login_completed');
      const loginTimestamp = localStorage.getItem('android_keycloak_login_timestamp');
      
      console.log('[DEBUG] Clearing sessionStorage, localStorage, and cookies...');
      sessionStorage.clear();
      localStorage.clear();
      this.cookieService.deleteAll();
      
      // Restore login completion flag if it was set (to prevent loop)
      if (loginCompletedFlag === 'true' && loginTimestamp) {
        localStorage.setItem('android_keycloak_login_completed', loginCompletedFlag);
        localStorage.setItem('android_keycloak_login_timestamp', loginTimestamp);
        console.log('[DEBUG] Preserved login completion flag to prevent loop');
      }
      
      // Verify token was cleared
      const tokenAfterClear = localStorage.getItem(appConstants.ACCESS_TOKEN);
      console.log('[DEBUG] Token in localStorage after clear:', tokenAfterClear ? 'EXISTS (should be cleared!)' : 'NOT_EXISTS (OK)');
      
      if (!isAndroidAppMode) {
        console.log('[DEBUG] Web mode - redirecting to login URL');
        this.redirectService.redirect(window.location.href);
      } else {
        console.log('[DEBUG] Android mode - clearing cookies and initiating login');
        console.log('[DEBUG] SERVICES_BASE_URL:', environment.SERVICES_BASE_URL);
        console.log('[DEBUG] AUTHORIZATION cookie key:', appConstants.AUTHORIZATION);
        
        await CapacitorCookies.deleteCookie({
          url: encodeURI(environment.SERVICES_BASE_URL),
          key: appConstants.AUTHORIZATION
        });
        console.log('[DEBUG] Cookie deleted, calling androidKeycloakService.login()...');
        
        await this.androidKeycloakService.login();
        console.log('[DEBUG] androidKeycloakService.login() completed');
      }
    } catch (error) {
      console.error('[DEBUG] ====== showHomePage() ERROR ======');
      console.error('[DEBUG] Error:', error);
      console.error('[DEBUG] Error stack:', error instanceof Error ? error.stack : 'N/A');
      console.error('[DEBUG] ====== showHomePage() ERROR COMPLETE ======');
    } finally {
      // Reset flag after a delay to allow for normal flow
      console.log('[DEBUG] Scheduling reset of isHandlingAuthError in 3000ms...');
      setTimeout(() => {
        this.isHandlingAuthError = false;
        console.log('[DEBUG] isHandlingAuthError reset to false');
      }, 3000);
    }
    console.log('[DEBUG] ====== showHomePage() COMPLETE ======');
  }

  addCookieForAndroid = async () => {
    console.log('[DEBUG] ====== AuthInterceptor.addCookieForAndroid() CALLED ======');
    const accessToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
    console.log('[DEBUG] Access token from localStorage:', accessToken ? 'EXISTS (length: ' + accessToken.length + ')' : 'NOT_EXISTS');
    console.log('[DEBUG] SERVICES_BASE_URL:', environment.SERVICES_BASE_URL);
    console.log('[DEBUG] AUTHORIZATION cookie key:', appConstants.AUTHORIZATION);
    
    if (accessToken) {
      try {
        // Set cookie with Bearer prefix (if not already present)
        const cookieValue = accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}`;
        console.log('[DEBUG] Cookie value preview:', cookieValue.substring(0, 50) + '...');
        
        await CapacitorCookies.setCookie({
          url: encodeURI(environment.SERVICES_BASE_URL),
          key: appConstants.AUTHORIZATION,
          value: cookieValue,
        });
        console.log('[DEBUG] Cookie set successfully with Bearer prefix');
      } catch (error) {
        console.error('[DEBUG] ERROR setting cookie:', error);
        console.error('[DEBUG] Error details:', error instanceof Error ? error.message : 'Unknown error');
      }
    } else {
      console.log('[DEBUG] WARNING: No access token available, cookie not set');
    }
    console.log('[DEBUG] ====== addCookieForAndroid() COMPLETE ======');
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
        // Android mode: Use only accessToken header to avoid CORS preflight issues
        // This approach avoids triggering CORS preflight requests by not using
        // 'authorization' or 'Authorization' headers, and not using withCredentials
        console.log('[DEBUG] AuthInterceptor: Android mode - preparing request for:', request.url);
        
        let accessToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
        console.log('[DEBUG] Token for headers:', accessToken ? 'EXISTS (length: ' + accessToken.length + ')' : 'NOT_EXISTS');
        
        if (accessToken) {
          // Only use accessToken header to avoid CORS preflight
          // This is a simple header that typically doesn't trigger preflight
          request = request.clone({
            setHeaders: { 
              'accessToken': accessToken  // Only use this header to avoid CORS preflight
            },
          });
          console.log('[DEBUG] Request headers set - accessToken: SET (CORS-safe approach)');
          console.log('[DEBUG] NOT setting authorization/Authorization headers to avoid CORS preflight');
          console.log('[DEBUG] NOT using withCredentials to avoid CORS conflicts');
        } else {
          console.log('[DEBUG] WARNING: No token available, headers not set');
        }
        
        // Explicitly set withCredentials to false to avoid CORS conflicts
        // When withCredentials is true, Access-Control-Allow-Origin cannot be '*'
        request = request.clone({ withCredentials: false });
        console.log('[DEBUG] withCredentials set to false to avoid CORS conflicts');
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
              console.log('[DEBUG] ====== AuthInterceptor: validateToken RESPONSE ======');
              console.log('[DEBUG] Status:', event.status);
              console.log('[DEBUG] URL:', event.url);
              console.log('[DEBUG] Timestamp:', new Date().toISOString());
              console.log('[DEBUG] Response body:', JSON.stringify(event.body));
              
              if (event.body.response) {
                console.log('[DEBUG] validateToken SUCCESS - has response object');
                console.log('[DEBUG] Token in response:', event.body.response.token ? 'EXISTS' : 'NOT_EXISTS');
                
                this.decoded = jwt_decode(event.body.response.token);
                this.userProfileService.setDisplayUserName(
                  this.decoded['name']
                );
                this.userProfileService.setUsername(event.body.response.userId);
                this.userProfileService.setRoles(event.body.response.role);
                
                console.log('[DEBUG] User info decoded - name:', this.decoded['name']);
                console.log('[DEBUG] User info decoded - userId:', event.body.response.userId);
                
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
                    console.error('[DEBUG] Error checking language file:', error);
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
                
                console.log('[DEBUG] ====== validateToken SUCCESS COMPLETE ======');
              }
              
              if (
                event.body.errors !== null &&
                event.body.errors.length > 0
              ) {
                console.log('[DEBUG] ====== validateToken ERROR RESPONSE ======');
                console.log('[DEBUG] Errors array:', JSON.stringify(event.body.errors));
                console.log('[DEBUG] First error:', event.body.errors[0]);
                console.log('[DEBUG] First error code:', event.body.errors[0]?.['errorCode']);
                console.log('[DEBUG] AUTH_ERROR_CODE constants:', appConstants.AUTH_ERROR_CODE);
                
                const isAuthError = (
                  event.body.errors[0]['errorCode'] === appConstants.AUTH_ERROR_CODE[0] ||
                  event.body.errors[0]['errorCode'] === appConstants.AUTH_ERROR_CODE[1]
                );
                console.log('[DEBUG] Is authentication error:', isAuthError);
                
                if (isAuthError) {
                  console.log('[DEBUG] Authentication error in validateToken response');
                  // For Android, only trigger login if not already logging in
                  if (isAndroidAppMode) {
                    const isLoginInProgress = this.androidKeycloakService.isLoginInProgress();
                    console.log('[DEBUG] Android mode - isLoginInProgress:', isLoginInProgress);
                    
                    if (!isLoginInProgress) {
                      console.log('[DEBUG] Triggering showHomePage due to validateToken auth error...');
                      this.showHomePage(isAndroidAppMode)
                        .catch((error) => {
                          console.error('[DEBUG] ERROR in showHomePage:', error);
                        });
                    } else {
                      console.log('[DEBUG] Login in progress, skipping error handling');
                    }
                  } else {
                    console.log('[DEBUG] Triggering showHomePage (Web mode)...');
                    this.showHomePage(isAndroidAppMode)
                      .catch((error) => {
                        console.error('[DEBUG] ERROR in showHomePage:', error);
                      });
                  }
                }
                console.log('[DEBUG] ====== validateToken ERROR HANDLING COMPLETE ======');
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
            
            console.log('[DEBUG] ====== AuthInterceptor: HTTP ERROR ======');
            console.log('[DEBUG] Status:', status);
            console.log('[DEBUG] URL:', err.url);
            console.log('[DEBUG] isLocalUrl:', isLocalUrl);
            console.log('[DEBUG] isAuthError:', isAuthError);
            console.log('[DEBUG] isAndroidAppMode:', isAndroidAppMode);
            console.log('[DEBUG] Timestamp:', new Date().toISOString());
            
            // Check token state at error time
            const tokenAtError = localStorage.getItem(appConstants.ACCESS_TOKEN);
            console.log('[DEBUG] Token in localStorage at error time:', tokenAtError ? 'EXISTS (length: ' + tokenAtError.length + ')' : 'NOT_EXISTS');
            
            if (err.url) {
              const isValidateToken = err.url.includes('validateToken');
              console.log('[DEBUG] Is validateToken request:', isValidateToken);
            }

            if (isAuthError && !isLocalUrl) {
              console.log('[DEBUG] Auth error detected, checking if should trigger login...');
              
              // For Android, check if login was just completed (to prevent loop)
              if (isAndroidAppMode) {
                const loginCompletedFlag = localStorage.getItem('android_keycloak_login_completed');
                const loginTimestamp = localStorage.getItem('android_keycloak_login_timestamp');
                console.log('[DEBUG] Login completion flag:', loginCompletedFlag);
                console.log('[DEBUG] Login timestamp:', loginTimestamp);
                
                if (loginCompletedFlag === 'true') {
                  const timestamp = loginTimestamp ? parseInt(loginTimestamp) : 0;
                  const elapsed = Date.now() - timestamp;
                  console.log('[DEBUG] Login was recently completed, elapsed time (ms):', elapsed);
                  
                  if (elapsed < 10000) { // Within 10 seconds
                    console.log('[DEBUG] WARNING: Auth error detected but login was just completed!');
                    console.log('[DEBUG] This might be a token sync issue - NOT triggering login to prevent loop');
                    console.log('[DEBUG] Token in localStorage:', localStorage.getItem(appConstants.ACCESS_TOKEN) ? 'EXISTS' : 'NOT_EXISTS');
                    console.log('[DEBUG] ====== HTTP ERROR HANDLING COMPLETE (loop prevention) ======');
                    return; // Don't trigger login to prevent loop
                  } else {
                    console.log('[DEBUG] Login completion flag is stale (more than 10 seconds), proceeding with normal flow');
                    localStorage.removeItem('android_keycloak_login_completed');
                    localStorage.removeItem('android_keycloak_login_timestamp');
                  }
                }
                
                const isLoginInProgress = this.androidKeycloakService.isLoginInProgress();
                console.log('[DEBUG] Android mode - isLoginInProgress:', isLoginInProgress);
                
                if (!isLoginInProgress) {
                  console.log('[DEBUG] Triggering showHomePage (Android mode)...');
                  this.showHomePage(isAndroidAppMode)
                    .catch((error) => {
                      console.error('[DEBUG] ERROR in showHomePage:', error);
                    });
                } else {
                  console.log('[DEBUG] Login in progress, skipping error handling');
                }
              } else {
                // For web, always trigger redirect
                console.log('[DEBUG] Triggering showHomePage (Web mode)...');
                this.showHomePage(isAndroidAppMode)
                  .catch((error) => {
                    console.error('[DEBUG] ERROR in showHomePage:', error);
                  });
              }
            } else if (!isLocalUrl && (status === 0 || status >= 500)) {
              // Network errors or server errors - don't trigger login
              console.log('[DEBUG] Network or server error, not triggering login');
            } else {
              console.log('[DEBUG] Error condition not met for login trigger');
            }
            console.log('[DEBUG] ====== HTTP ERROR HANDLING COMPLETE ======');
          }
        }
      )
    );
  }
}
