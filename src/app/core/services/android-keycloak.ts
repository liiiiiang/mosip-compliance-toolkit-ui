import * as Keycloak from 'src/app/lib/keycloak';
import * as appConstants from 'src/app/app.constants';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { CapacitorCookies } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class AndroidKeycloakService {

  private androidKeycloak: Keycloak.KeycloakInstance;

  private urlListener: any = null;
  
  // Track processed deep links to prevent duplicate processing
  private processedDeepLinks: Set<string> = new Set();
  
  // Flag to prevent concurrent deep link processing
  private isProcessingDeepLink: boolean = false;

  constructor(
  ) {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    if (isAndroidAppMode) {
      // Register global deep link listener BEFORE setUp to catch redirects immediately
      // This is critical to prevent browser from handling the deep link
      this.registerGlobalDeepLinkListener();
      this.setUp();
    }
  }

  /**
   * Register a global deep link listener to catch Keycloak redirects
   * This must be registered before Keycloak init to ensure we catch the redirect
   * and prevent browser from handling it (which causes infinite loop)
   */
  private registerGlobalDeepLinkListener() {
    // Check if Capacitor is available
    if (typeof window !== 'undefined' && (window as any).Capacitor && (window as any).Capacitor.Plugins) {
      // Remove existing listener if any
      if (this.urlListener) {
        this.urlListener.remove();
      }

      // Register global listener for deep links
      this.urlListener = (window as any).Capacitor.Plugins.App.addListener('appUrlOpen', (data: any) => {
        console.log('[ANDROID-KEYCLOAK] Deep link received:', {
          url: data.url,
          timestamp: new Date().toISOString(),
          isProcessing: this.isProcessingDeepLink,
          alreadyProcessed: this.processedDeepLinks.has(data.url)
        });
        
        // Check if this is a Keycloak callback (contains code parameter or our redirect URI)
        if (data.url && (data.url.includes('code=') || data.url.includes('android://mosip-compliance-toolkit-ui'))) {
          // Prevent duplicate processing
          if (this.processedDeepLinks.has(data.url)) {
            console.log('[ANDROID-KEYCLOAK] Deep link already processed, ignoring duplicate', {
              url: data.url
            });
            return;
          }
          
          // Prevent concurrent processing
          if (this.isProcessingDeepLink) {
            console.log('[ANDROID-KEYCLOAK] Already processing a deep link, ignoring concurrent request', {
              url: data.url
            });
            return;
          }
          
          // Check if URL already has code parameter (prevent unnecessary navigation)
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.has('code')) {
            console.log('[ANDROID-KEYCLOAK] URL already has code parameter, ignoring deep link', {
              deepLink: data.url,
              currentUrl: window.location.href
            });
            // Mark as processed to prevent future processing
            this.processedDeepLinks.add(data.url);
            return;
          }
          
          console.log('[ANDROID-KEYCLOAK] Keycloak callback detected, processing...', {
            url: data.url,
            hasKeycloakInstance: !!this.androidKeycloak
          });
          
          // Mark as processing to prevent concurrent handling
          this.isProcessingDeepLink = true;
          this.processedDeepLinks.add(data.url);
          
          // Prevent browser from handling the deep link by ensuring we process it
          // If Keycloak is already initialized, update window location to trigger its callback handler
          // This will cause processInit to parse the callback and processCallback to handle it
          if (this.androidKeycloak) {
            console.log('[ANDROID-KEYCLOAK] Keycloak initialized, updating window location to trigger callback handler');
            
            // Extract query parameters from deep link URL (android://mosip-compliance-toolkit-ui?code=xxx&state=xxx)
            let queryString = '';
            if (data.url.includes('?')) {
              queryString = data.url.substring(data.url.indexOf('?') + 1);
            }
            
            if (queryString) {
              // Extract state parameter to restore Keycloak callback storage
              const urlParams = new URLSearchParams(queryString);
              const state = urlParams.get('state');
              
              // Try to restore cookies from sessionStorage if available
              // This helps when Chrome cookies don't transfer to WebView
              if (state) {
                console.log('[ANDROID-KEYCLOAK] Attempting to restore OAuth state cookies', {
                  state: state.substring(0, 20) + '...'
                });
                
                // Check if we have state stored in sessionStorage (backup mechanism)
                const storedState = sessionStorage.getItem(`kc-state-backup-${state}`);
                if (storedState) {
                  console.log('[ANDROID-KEYCLOAK] Found backup state in sessionStorage, restoring cookie');
                  
                  // Restore the cookie using document.cookie directly
                  // This must happen BEFORE Keycloak processes the callback
                  try {
                    const expires = new Date(Date.now() + 60 * 60 * 1000).toUTCString(); // 1 hour
                    document.cookie = `kc-callback-${state}=${storedState}; expires=${expires}; path=/`;
                    console.log('[ANDROID-KEYCLOAK] Cookie restored via document.cookie successfully');
                    
                    // Also try CapacitorCookies as a backup
                    CapacitorCookies.setCookie({
                      url: 'http://localhost',
                      key: `kc-callback-${state}`,
                      value: storedState,
                      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                      path: '/'
                    }).then(() => {
                      console.log('[ANDROID-KEYCLOAK] Cookie also set via CapacitorCookies');
                    }).catch((error) => {
                      console.warn('[ANDROID-KEYCLOAK] Failed to set cookie via CapacitorCookies (non-critical):', error);
                    });
                  } catch (e) {
                    console.warn('[ANDROID-KEYCLOAK] Failed to restore cookie:', e);
                  }
                } else {
                  console.log('[ANDROID-KEYCLOAK] No backup state found in sessionStorage - this may cause "No OAuth state found" error');
                }
              }
              
              // Update window.location with query parameters to trigger Keycloak's callback handler
              const newUrl = window.location.origin + window.location.pathname + '?' + queryString;
              console.log('[ANDROID-KEYCLOAK] Converting deep link to window location:', {
                deepLink: data.url,
                newUrl: newUrl,
                currentUrl: window.location.href
              });
              
              // Only update if URL is different
              if (window.location.href !== newUrl && !currentUrl.searchParams.has('code')) {
                // Reset processing flag after navigation (will be set again on new page load)
                setTimeout(() => {
                  this.isProcessingDeepLink = false;
                }, 1000);
                window.location.href = newUrl;
              } else {
                console.log('[ANDROID-KEYCLOAK] URL already has code parameter or matches, skipping navigation');
                this.isProcessingDeepLink = false;
              }
            } else {
              console.warn('[ANDROID-KEYCLOAK] Deep link URL has no query parameters');
              this.isProcessingDeepLink = false;
            }
          } else {
            console.warn('[ANDROID-KEYCLOAK] Keycloak not initialized yet, storing URL for later processing');
            // Store the URL to process after Keycloak is initialized
            sessionStorage.setItem('pending_keycloak_callback', data.url);
            this.isProcessingDeepLink = false;
          }
        } else {
          console.log('[ANDROID-KEYCLOAK] Deep link is not a Keycloak callback, ignoring');
        }
      });

      console.log('[ANDROID-KEYCLOAK] Global deep link listener registered');
    } else {
      console.warn('[ANDROID-KEYCLOAK] Capacitor not available, cannot register deep link listener');
    }
  }

  /**
   * Monitor document.cookie changes to backup Keycloak callback cookies to sessionStorage
   * Uses MutationObserver as a fallback when direct property redefinition fails
   */
  private setupCookieBackup() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      console.warn('[ANDROID-KEYCLOAK] Document/window not available, skipping cookie backup setup');
      return;
    }
    
    // Try to intercept cookie setting using a wrapper around document.cookie
    // Since direct redefinition may fail, we'll use a polling approach instead
    let lastCookieValue = document.cookie;
    
    // Poll for cookie changes (less intrusive than property redefinition)
    const cookieCheckInterval = setInterval(() => {
      const currentCookies = document.cookie;
      if (currentCookies !== lastCookieValue) {
        // Check for new Keycloak callback cookies
        const cookies = currentCookies.split(';');
        cookies.forEach(cookie => {
          const trimmed = cookie.trim();
          if (trimmed.startsWith('kc-callback-')) {
            try {
              const match = trimmed.match(/^kc-callback-([^=]+)=(.+)$/);
              if (match && match[1] && match[2]) {
                const state = match[1];
                const cookieValue = match[2];
                const backupKey = `kc-state-backup-${state}`;
                
                // Only backup if not already backed up
                if (!sessionStorage.getItem(backupKey)) {
                  console.log('[ANDROID-KEYCLOAK] Backing up Keycloak callback cookie to sessionStorage', {
                    state: state.substring(0, 20) + '...',
                    valueLength: cookieValue.length
                  });
                  sessionStorage.setItem(backupKey, cookieValue);
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }
        });
        lastCookieValue = currentCookies;
      }
    }, 100); // Check every 100ms
    
    // Store interval ID so we can clear it if needed
    (window as any).__keycloakCookieBackupInterval = cookieCheckInterval;
    
    console.log('[ANDROID-KEYCLOAK] Cookie backup mechanism enabled (polling mode)');
  }

  public setUp() {
    console.log('[ANDROID-KEYCLOAK DEBUG] setUp called', {
      hasInstance: !!this.androidKeycloak,
      url: window.location.href,
      hasSearch: !!window.location.search,
      hasHash: !!window.location.hash
    });
    
    // Prevent duplicate setup
    if (this.androidKeycloak) {
      console.log('[ANDROID-KEYCLOAK DEBUG] Instance already exists, skipping setup');
      return;
    }
    
    // Setup cookie backup mechanism BEFORE Keycloak init
    // This ensures we capture Keycloak's cookie writes
    this.setupCookieBackup();
    
    // Clear processed deep links on page reload (but keep them during the same session)
    // This allows retry after a failed attempt, but prevents infinite loops
    // Only clear if we have a token or if we're not in the middle of processing
    const hasToken = !!localStorage.getItem(appConstants.ACCESS_TOKEN);
    const isProcessingFlag = sessionStorage.getItem('keycloak_auth_processing');
    if (hasToken && !isProcessingFlag) {
      console.log('[ANDROID-KEYCLOAK DEBUG] Clearing processed deep links after successful auth');
      this.processedDeepLinks.clear();
    }
    
    // Check for pending callback from deep link listener (before Keycloak init)
    const pendingCallback = sessionStorage.getItem('pending_keycloak_callback');
    if (pendingCallback) {
      console.log('[ANDROID-KEYCLOAK DEBUG] Found pending callback from deep link listener:', pendingCallback);
      sessionStorage.removeItem('pending_keycloak_callback');
      
      // Extract query parameters from deep link URL
      let queryString = '';
      if (pendingCallback.includes('?')) {
        queryString = pendingCallback.substring(pendingCallback.indexOf('?') + 1);
      }
      
      if (queryString) {
        // Process the callback after Keycloak is initialized
        // Use a longer delay to ensure Keycloak is fully ready
        setTimeout(() => {
          console.log('[ANDROID-KEYCLOAK DEBUG] Processing pending callback');
          const callbackUrl = window.location.origin + window.location.pathname + '?' + queryString;
          window.location.href = callbackUrl;
        }, 500);
      }
    }
    
    // Check if we're in the middle of processing (after reload)
    // This happens when onAuthSuccess triggered reload but URL still has code params
    // Clean URL immediately before keycloak init parses it
    const isProcessing = sessionStorage.getItem('keycloak_auth_processing');
    const existingTokenCheck = localStorage.getItem(appConstants.ACCESS_TOKEN);
    console.log('[ANDROID-KEYCLOAK DEBUG] Processing flag check', {
      isProcessing: isProcessing,
      hasSearch: !!window.location.search,
      hasHash: !!window.location.hash,
      hasToken: !!existingTokenCheck
    });
    
    if (isProcessing) {
      console.log('[ANDROID-KEYCLOAK DEBUG] Detected post-auth reload, cleaning URL to prevent duplicate code exchange');
      const cleanUrl = window.location.origin + window.location.pathname;
      // Force clear ALL URL parameters and fragments immediately
      if (window.location.search || window.location.hash) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Cleaning URL from', window.location.href, 'to', cleanUrl);
        window.history.replaceState({}, document.title, cleanUrl);
      }
      // Clear the flag after cleaning URL
      sessionStorage.removeItem('keycloak_auth_processing');
      // Reset processing flag
      this.isProcessingDeepLink = false;
      // If we already have a token, we don't need to process the callback again
      if (existingTokenCheck) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Token already exists, skipping callback processing', {
          tokenLength: existingTokenCheck.length
        });
        return; // Early return if we have a token
      }
    }
    
    // Check if URL has code parameter but no token - this might indicate a failed exchange
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has('code') && !existingTokenCheck) {
      console.log('[ANDROID-KEYCLOAK DEBUG] URL has code parameter but no token, might be from failed exchange');
      // Extract and mark the code as processed to prevent infinite loop
      const code = currentUrl.searchParams.get('code');
      if (code) {
        const codeProcessedKey = `keycloak_code_processed_${code.substring(0, 20)}`;
        sessionStorage.setItem(codeProcessedKey, 'true');
        console.log('[ANDROID-KEYCLOAK DEBUG] Marked code as processed to prevent duplicate exchange');
      }
    }
    
    this.androidKeycloak = Keycloak({
      clientId: environment.IAM_CLIENT_ID,
      realm: environment.IAM_REALM,
      url: environment.IAM_URL,
    });
    
    let isReloading = false; // Flag to prevent duplicate reloads
    this.androidKeycloak.onAuthSuccess = () => {
      console.log('[ANDROID-KEYCLOAK DEBUG] onAuthSuccess called', {
        isReloading: isReloading,
        hasToken: !!this.androidKeycloak.token,
        tokenLength: this.androidKeycloak.token ? this.androidKeycloak.token.length : 0,
        url: window.location.href
      });
      
      // Prevent duplicate processing
      if (isReloading) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Already processing, skipping');
        return;
      }
      
      // Check if we already have a token (prevent duplicate processing after reload)
      const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
      if (existingToken && this.androidKeycloak.token === existingToken) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Token already exists and matches, skipping reload');
        return;
      }
      
      // save tokens to device storage
      const accessToken = this.androidKeycloak.token;
      if (accessToken) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Saving token and preparing reload', {
          tokenLength: accessToken.length,
          currentUrl: window.location.href
        });
        
        // Save token first
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        
        // Verify token was saved
        const savedToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
        if (!savedToken || savedToken !== accessToken) {
          console.error('[ANDROID-KEYCLOAK DEBUG] Failed to save token, aborting reload');
          return;
        }
        
        console.log('[ANDROID-KEYCLOAK DEBUG] Token saved successfully');
        
        // Mark that we're processing to prevent duplicate calls
        sessionStorage.setItem('keycloak_auth_processing', 'true');
        // Mark that we successfully authenticated to prevent re-login after reload
        sessionStorage.setItem('keycloak_auth_success', 'true');
        isReloading = true;
        
        // Clear processing flag
        this.isProcessingDeepLink = false;
        
        // Clear ALL URL parameters and fragments before reloading
        // This prevents the second CODE_TO_TOKEN attempt with an already-used authorization code
        const cleanUrl = window.location.origin + window.location.pathname;
        console.log('[ANDROID-KEYCLOAK DEBUG] Clearing URL before reload', {
          from: window.location.href,
          to: cleanUrl
        });
        window.history.replaceState({}, document.title, cleanUrl);
        
        // Force clear any remaining query params by navigating to clean URL
        // Use a longer timeout to ensure URL is fully cleared
        setTimeout(() => {
          // Double-check URL is clean
          if (window.location.search || window.location.hash) {
            console.log('[ANDROID-KEYCLOAK DEBUG] URL still has params, cleaning again', {
              search: window.location.search,
              hash: window.location.hash
            });
            window.history.replaceState({}, document.title, cleanUrl);
          }
          console.log('[ANDROID-KEYCLOAK DEBUG] Reloading page');
          // Keep the flag during reload - it will be cleared after init checks
          window.location.reload();
        }, 200);
      } else {
        console.warn('[ANDROID-KEYCLOAK DEBUG] onAuthSuccess called but no access token');
        // Reset processing flag if no token
        this.isProcessingDeepLink = false;
      }
    };
    
    // Handle authentication errors to prevent infinite loops
    this.androidKeycloak.onAuthError = (errorData: any) => {
      console.error('[ANDROID-KEYCLOAK DEBUG] onAuthError called', {
        error: errorData,
        url: window.location.href
      });
      
      // Mark that auth failed to prevent immediate re-login attempts
      sessionStorage.setItem('keycloak_auth_failed', 'true');
      sessionStorage.setItem('keycloak_auth_failed_time', Date.now().toString());
      
      // Don't automatically retry - let user try again manually
      // Reset processing flag
      this.isProcessingDeepLink = false;
    };
    
    // Handle token expiration
    this.androidKeycloak.onTokenExpired = () => {
      console.log('[ANDROID-KEYCLOAK DEBUG] onTokenExpired called');
      // Token expired - will trigger re-authentication
      // But don't prevent the normal flow
    };
    
    console.log('[ANDROID-KEYCLOAK DEBUG] Calling keycloak.init', {
      adapter: 'capacitor-native',
      responseMode: 'query',
      redirectUri: environment.redirectUri,
      currentUrl: window.location.href
    });
    
    // Check if user is already authenticated
    const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
    const hasCodeInUrl = window.location.search.includes('code=');
    const authSuccess = sessionStorage.getItem('keycloak_auth_success');
    const authFailed = sessionStorage.getItem('keycloak_auth_failed');
    const authFailedTime = authFailed ? parseInt(sessionStorage.getItem('keycloak_auth_failed_time') || '0') : 0;
    
    // If auth recently failed (within last 5 seconds), don't immediately retry
    const recentlyFailed = authFailed && (Date.now() - authFailedTime < 5000);
    
    // Determine onLoad behavior:
    // - If URL has code parameter, we're in callback - don't trigger login (use check-sso)
    // - If auth just succeeded, use check-sso to verify without triggering login
    // - If auth recently failed, use check-sso to avoid immediate retry
    // - If no token and no code and no recent failure, trigger login
    let onLoad: 'check-sso' | 'login-required' = 'check-sso';
    if (hasCodeInUrl) {
      onLoad = 'check-sso'; // Don't trigger login during callback
    } else if (authSuccess) {
      onLoad = 'check-sso'; // Don't trigger login if we just succeeded
    } else if (recentlyFailed) {
      onLoad = 'check-sso'; // Don't retry immediately after failure
      console.log('[ANDROID-KEYCLOAK DEBUG] Auth recently failed, using check-sso to avoid immediate retry');
    } else if (!existingToken) {
      onLoad = 'login-required'; // Trigger login if no token
    }
    
    console.log('[ANDROID-KEYCLOAK DEBUG] Keycloak init options', {
      adapter: 'capacitor-native',
      responseMode: 'query',
      redirectUri: environment.redirectUri,
      onLoad: onLoad,
      hasToken: !!existingToken,
      hasCode: hasCodeInUrl,
      authSuccess: !!authSuccess,
      authFailed: !!authFailed,
      recentlyFailed: recentlyFailed
    });
    
    this.androidKeycloak.init({
      adapter: 'capacitor-native',
      responseMode: 'query',
      enableLogging: true,
      useNonce: false,
      redirectUri: environment.redirectUri,
      onLoad: onLoad as any, // Type assertion needed for Keycloak compatibility
      checkLoginIframe: false // Disable iframe check for mobile
    }).then((authenticated) => {
      console.log('[ANDROID-KEYCLOAK DEBUG] keycloak.init completed successfully', {
        authenticated: authenticated,
        hasToken: !!this.androidKeycloak.token,
        tokenFromInit: !!this.androidKeycloak.token
      });
      
      // Clear auth success flag if we successfully authenticated
      if (authenticated && this.androidKeycloak.token) {
        sessionStorage.removeItem('keycloak_auth_failed');
        sessionStorage.removeItem('keycloak_auth_failed_time');
      }
      
      // Clear auth success flag after checking (it was just used to prevent re-login)
      if (authSuccess) {
        sessionStorage.removeItem('keycloak_auth_success');
      }
      
      // Only trigger login if:
      // 1. Not authenticated
      // 2. No code in URL (not in callback)
      // 3. No token
      // 4. Auth didn't recently fail
      if (!authenticated && !hasCodeInUrl && !this.androidKeycloak.token && !recentlyFailed && !existingToken) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Not authenticated and conditions met, triggering login');
        this.androidKeycloak.login();
      } else if (recentlyFailed) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login due to recent auth failure');
      } else if (hasCodeInUrl) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login - processing callback');
      } else if (existingToken || this.androidKeycloak.token) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login - token exists');
      }
    }).catch((error) => {
      console.error('[ANDROID-KEYCLOAK DEBUG] Keycloak init error:', error);
      // Mark auth as failed to prevent immediate retry
      sessionStorage.setItem('keycloak_auth_failed', 'true');
      sessionStorage.setItem('keycloak_auth_failed_time', Date.now().toString());
    });
  }
  getInstance() {
    return this.androidKeycloak;
  }
}