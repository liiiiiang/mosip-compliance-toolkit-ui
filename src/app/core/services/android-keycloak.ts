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
  
  // Flag to prevent repeated login attempts
  private isLoginInProgress: boolean = false;
  private lastLoginAttemptTime: number = 0;

  constructor(
  ) {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    if (isAndroidAppMode) {
      // Register global deep link listener BEFORE setUp to catch redirects immediately
      // This is critical to prevent browser from handling the deep link
      this.registerGlobalDeepLinkListener();
      this.setUp();
      
      // Intercept XMLHttpRequest to log all network requests (for debugging)
      this.setupNetworkInterceptor();
    }
  }
  
  /**
   * Intercept XMLHttpRequest to log network requests for debugging
   */
  private setupNetworkInterceptor() {
    if (typeof XMLHttpRequest === 'undefined') {
      return;
    }
    
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
      const requestUrl = url.toString();
      const xhr = this as any;
      xhr._requestMethod = method;
      xhr._requestUrl = requestUrl;
      xhr._requestTimestamp = Date.now();
      
      // Log Keycloak token exchange requests
      if (requestUrl.includes('/protocol/openid-connect/token')) {
        console.log('[NETWORK DEBUG] Token exchange request initiated', {
          method: method,
          url: requestUrl,
          timestamp: new Date().toISOString()
        });
        
        // Add error listeners
        this.addEventListener('error', function(event: any) {
          console.error('[NETWORK DEBUG] Token exchange request error event', {
            type: event.type,
            url: requestUrl,
            readyState: this.readyState,
            status: this.status,
            statusText: this.statusText,
            timestamp: new Date().toISOString()
          });
        });
        
        this.addEventListener('timeout', function(event: any) {
          console.error('[NETWORK DEBUG] Token exchange request timeout event', {
            type: event.type,
            url: requestUrl,
            timestamp: new Date().toISOString()
          });
        });
        
        this.addEventListener('abort', function(event: any) {
          console.error('[NETWORK DEBUG] Token exchange request abort event', {
            type: event.type,
            url: requestUrl,
            timestamp: new Date().toISOString()
          });
        });
      }
      
      return originalOpen.call(this, method, url, async !== undefined ? async : true, username, password);
    };
    
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as any;
      const requestUrl = xhr._requestUrl;
      const requestMethod = xhr._requestMethod;
      
      if (requestUrl && requestUrl.includes('/protocol/openid-connect/token')) {
        const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
        console.log('[NETWORK DEBUG] Token exchange request sent', {
          method: requestMethod,
          url: requestUrl,
          bodyLength: bodyStr.length,
          bodyPreview: bodyStr.substring(0, 200),
          timestamp: new Date().toISOString()
        });
        
        // Monitor response
        const originalOnReadyStateChange = this.onreadystatechange;
        const self = this;
        this.onreadystatechange = function(event: Event) {
          if (self.readyState === 4) {
            console.log('[NETWORK DEBUG] Token exchange response received', {
              status: self.status,
              statusText: self.statusText,
              responseLength: self.responseText ? self.responseText.length : 0,
              responsePreview: self.responseText ? self.responseText.substring(0, 500) : 'no response',
              responseHeaders: self.getAllResponseHeaders ? self.getAllResponseHeaders() : 'not available',
              url: requestUrl,
              timestamp: new Date().toISOString()
            });
          }
          if (originalOnReadyStateChange) {
            return originalOnReadyStateChange.call(self, event);
          }
        };
      }
      
      return originalSend.call(this, body);
    };
    
    console.log('[ANDROID-KEYCLOAK] Network interceptor enabled for debugging');
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
        console.log('[OIDC-FLOW-DEBUG] ========== Deep Link Received ==========');
        console.log('[OIDC-FLOW-DEBUG] This is the callback from Keycloak after user login');
        console.log('[OIDC-FLOW-DEBUG] Deep Link URL:', data.url);
        console.log('[ANDROID-KEYCLOAK] Deep link received:', {
          url: data.url,
          timestamp: new Date().toISOString(),
          isProcessing: this.isProcessingDeepLink,
          alreadyProcessed: this.processedDeepLinks.has(data.url)
        });
        
        // Check if this is a Keycloak callback (contains code parameter or our redirect URI)
        if (data.url && (data.url.includes('code=') || data.url.includes('android://mosip-compliance-toolkit-ui'))) {
          console.log('[OIDC-FLOW-DEBUG] This IS a Keycloak callback (has code parameter)');
          // Prevent duplicate processing
          if (this.processedDeepLinks.has(data.url)) {
            console.log('[OIDC-FLOW-DEBUG] Deep link already processed, IGNORING duplicate');
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
          
          // CRITICAL FIX: Check if token exchange is in progress
          // If we're already processing a callback or token exchange, don't interrupt it
          const isTokenExchangeInProgress = sessionStorage.getItem('keycloak_auth_processing') === 'true';
          const hasExistingToken = !!localStorage.getItem(appConstants.ACCESS_TOKEN);
          
          console.log('[OIDC-FLOW-DEBUG] Token exchange status check:', {
            isTokenExchangeInProgress: isTokenExchangeInProgress,
            hasExistingToken: hasExistingToken
          });
          
          if (isTokenExchangeInProgress && !hasExistingToken) {
            console.log('[OIDC-FLOW-DEBUG] ========== WAITING for token exchange ==========');
            console.log('[OIDC-FLOW-DEBUG] Another token exchange is in progress, will wait for it to complete');
            console.log('[ANDROID-KEYCLOAK] Token exchange already in progress, waiting for completion before processing new deep link', {
              deepLink: data.url,
              currentUrl: window.location.href
            });
            // Wait for token exchange to complete (max 10 seconds)
            let waitCount = 0;
            const checkInterval = setInterval(() => {
              waitCount++;
              const stillProcessing = sessionStorage.getItem('keycloak_auth_processing') === 'true';
              const tokenNow = !!localStorage.getItem(appConstants.ACCESS_TOKEN);
              
              if (!stillProcessing || tokenNow || waitCount > 100) { // 10 seconds max wait
                clearInterval(checkInterval);
                if (tokenNow) {
                  console.log('[ANDROID-KEYCLOAK] Token exchange completed, token found, ignoring duplicate deep link');
                  this.processedDeepLinks.add(data.url);
                } else if (waitCount > 100) {
                  console.warn('[ANDROID-KEYCLOAK] Token exchange timeout, processing deep link anyway');
                  // Continue with processing after timeout
                  this.processDeepLinkCallback(data);
                }
              }
            }, 100);
            return;
          }
          
          console.log('[ANDROID-KEYCLOAK] Keycloak callback detected, processing...', {
            url: data.url,
            hasKeycloakInstance: !!this.androidKeycloak,
            isTokenExchangeInProgress: isTokenExchangeInProgress,
            hasExistingToken: hasExistingToken
          });
          
          // Process the deep link
          this.processDeepLinkCallback(data);
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
   * Process deep link callback - extracted to separate method for reuse
   */
  private processDeepLinkCallback(data: any) {
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
        const currentUrl = new URL(window.location.href);
        const newUrl = window.location.origin + window.location.pathname + '?' + queryString;
        console.log('[ANDROID-KEYCLOAK] Converting deep link to window location:', {
          deepLink: data.url,
          newUrl: newUrl,
          currentUrl: window.location.href
        });
        
        // Only update if URL is different and doesn't already have code parameter
        if (window.location.href !== newUrl && !currentUrl.searchParams.has('code')) {
          console.log('[OIDC-FLOW-DEBUG] ========== Updating URL with authorization code ==========');
          console.log('[OIDC-FLOW-DEBUG] Using history.replaceState (NOT window.location.href)');
          console.log('[OIDC-FLOW-DEBUG] This should NOT cancel ongoing XHR requests');
          console.log('[OIDC-FLOW-DEBUG] From:', window.location.href);
          console.log('[OIDC-FLOW-DEBUG] To:', newUrl);
          
          // Use history.replaceState instead of href to avoid full page reload
          // This prevents canceling ongoing XHR requests
          console.log('[ANDROID-KEYCLOAK] Updating URL using history.replaceState to avoid canceling requests');
          window.history.replaceState({}, document.title, newUrl);
          
          console.log('[OIDC-FLOW-DEBUG] URL updated. Keycloak init should now detect the code parameter and exchange it for token');
          
          // Trigger Keycloak's callback handler manually by calling init again
          // But first, check if we should wait a bit for any ongoing requests
          setTimeout(() => {
            // Keycloak should detect the URL change and process the callback
            // If it doesn't, we'll let the normal init flow handle it
            console.log('[ANDROID-KEYCLOAK] URL updated, Keycloak should process callback');
            this.isProcessingDeepLink = false;
          }, 500);
        } else {
          console.log('[OIDC-FLOW-DEBUG] URL already has code or matches, skipping update');
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
    
    // Add comprehensive debugging for OIDC flow
    console.log('[OIDC-FLOW-DEBUG] ========== Keycloak Instance Created ==========');
    console.log('[OIDC-FLOW-DEBUG] Client ID:', environment.IAM_CLIENT_ID);
    console.log('[OIDC-FLOW-DEBUG] Realm:', environment.IAM_REALM);
    console.log('[OIDC-FLOW-DEBUG] URL:', environment.IAM_URL);
    console.log('[OIDC-FLOW-DEBUG] Redirect URI:', environment.redirectUri);
    console.log('[OIDC-FLOW-DEBUG] Current window URL:', window.location.href);
    console.log('[OIDC-FLOW-DEBUG] ================================================');
    
    let isReloading = false; // Flag to prevent duplicate reloads
    this.androidKeycloak.onAuthSuccess = () => {
      console.log('[OIDC-FLOW-DEBUG] ========== onAuthSuccess Triggered ==========');
      console.log('[OIDC-FLOW-DEBUG] This means token exchange was SUCCESSFUL');
      console.log('[OIDC-FLOW-DEBUG] Current URL:', window.location.href);
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
        
        // Clear processing flags
        this.isProcessingDeepLink = false;
        this.isLoginInProgress = false; // Reset login flag on success
        
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
      console.error('[OIDC-FLOW-DEBUG] ========== onAuthError Triggered ==========');
      console.error('[OIDC-FLOW-DEBUG] This means authentication or token exchange FAILED');
      console.error('[OIDC-FLOW-DEBUG] Current URL:', window.location.href);
      console.error('[ANDROID-KEYCLOAK DEBUG] onAuthError called', {
        error: errorData,
        errorType: errorData?.error || 'unknown',
        errorDescription: errorData?.error_description || 'no description',
        status: errorData?.status,
        statusText: errorData?.statusText,
        url: window.location.href,
        hasCode: window.location.search.includes('code='),
        hasState: window.location.search.includes('state='),
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        cookies: document.cookie,
        sessionStorage: {
          authFailed: sessionStorage.getItem('keycloak_auth_failed'),
          authFailedTime: sessionStorage.getItem('keycloak_auth_failed_time'),
          authProcessing: sessionStorage.getItem('keycloak_auth_processing'),
          authSuccess: sessionStorage.getItem('keycloak_auth_success')
        }
      });
      
      // Log detailed error information for debugging
      if (errorData?.error === 'network_error' || errorData?.error === 'timeout' || errorData?.error === 'aborted') {
        console.error('[ANDROID-KEYCLOAK DEBUG] Network-level error detected', {
          error: errorData.error,
          description: errorData.error_description,
          suggestion: 'Check network connectivity, CORS configuration, and Keycloak server availability'
        });
      } else if (errorData?.status === 400 || errorData?.status === 401 || errorData?.status === 403) {
        console.error('[ANDROID-KEYCLOAK DEBUG] HTTP error response from Keycloak', {
          status: errorData.status,
          error: errorData.error,
          description: errorData.error_description,
          suggestion: 'Check redirect_uri, client_id, and authorization code validity'
        });
      }
      
      // Mark that auth failed to prevent immediate re-login attempts
      // Use 30 second cooldown to prevent rapid retries
      sessionStorage.setItem('keycloak_auth_failed', 'true');
      sessionStorage.setItem('keycloak_auth_failed_time', Date.now().toString());
      sessionStorage.setItem('keycloak_auth_error_details', JSON.stringify({
        error: errorData?.error || 'unknown',
        error_description: errorData?.error_description || 'no description',
        status: errorData?.status,
        timestamp: Date.now()
      }));
      
      // Reset login progress flags
      this.isLoginInProgress = false;
      this.isProcessingDeepLink = false;
      
      console.log('[ANDROID-KEYCLOAK DEBUG] Auth error - will wait 30 seconds before allowing retry');
    };
    
    // Handle token expiration
    this.androidKeycloak.onTokenExpired = () => {
      console.log('[ANDROID-KEYCLOAK DEBUG] onTokenExpired called');
      // Token expired - will trigger re-authentication
      // But don't prevent the normal flow
    };
    
    console.log('[OIDC-FLOW-DEBUG] ========== About to call keycloak.init ==========');
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
    
    // If auth recently failed (within last 30 seconds), don't immediately retry
    // Also check if login is already in progress
    const recentlyFailed = authFailed && (Date.now() - authFailedTime < 30000);
    const loginInProgress = this.isLoginInProgress || (Date.now() - this.lastLoginAttemptTime < 5000);
    
    // Determine onLoad behavior:
    // - Always use check-sso to prevent automatic login
    // - We'll manually trigger login only if needed and safe to do so
    // - This prevents Keycloak adapter from automatically opening browser
    let onLoad: 'check-sso' | 'login-required' = 'check-sso';
    
    // Only use login-required if:
    // 1. No code in URL (not processing callback)
    // 2. No token exists
    // 3. Auth didn't recently fail
    // 4. Login is not already in progress
    // 5. Auth didn't just succeed
    if (!hasCodeInUrl && !existingToken && !recentlyFailed && !loginInProgress && !authSuccess) {
      // Still use check-sso, we'll manually trigger login after init if needed
      onLoad = 'check-sso';
      console.log('[ANDROID-KEYCLOAK DEBUG] Will check if login needed after init');
    } else {
      onLoad = 'check-sso';
      if (hasCodeInUrl) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Using check-sso - processing callback');
      } else if (authSuccess) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Using check-sso - auth just succeeded');
      } else if (recentlyFailed) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Using check-sso - auth recently failed (waiting 30s)');
      } else if (loginInProgress) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Using check-sso - login already in progress');
      } else if (existingToken) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Using check-sso - token exists');
      }
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
      console.log('[OIDC-FLOW-DEBUG] ========== keycloak.init COMPLETED ==========');
      console.log('[OIDC-FLOW-DEBUG] Authenticated:', authenticated);
      console.log('[OIDC-FLOW-DEBUG] Has Token:', !!this.androidKeycloak.token);
      console.log('[OIDC-FLOW-DEBUG] Token (first 50 chars):', this.androidKeycloak.token ? this.androidKeycloak.token.substring(0, 50) + '...' : 'NONE');
      console.log('[OIDC-FLOW-DEBUG] Current URL after init:', window.location.href);
      console.log('[OIDC-FLOW-DEBUG] ================================================');
      console.log('[ANDROID-KEYCLOAK DEBUG] keycloak.init completed successfully', {
        authenticated: authenticated,
        hasToken: !!this.androidKeycloak.token,
        tokenFromInit: !!this.androidKeycloak.token
      });
      
      // Clear auth success flag if we successfully authenticated
      if (authenticated && this.androidKeycloak.token) {
        sessionStorage.removeItem('keycloak_auth_failed');
        sessionStorage.removeItem('keycloak_auth_failed_time');
        // Reset login progress flags on success
        this.isLoginInProgress = false;
        this.lastLoginAttemptTime = 0;
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
      // 5. Login is not already in progress
      // 6. Auth didn't just succeed
      if (!authenticated && !hasCodeInUrl && !this.androidKeycloak.token && !recentlyFailed && !existingToken && !loginInProgress && !authSuccess) {
        console.log('[OIDC-FLOW-DEBUG] ========== Triggering Login Flow ==========');
        console.log('[OIDC-FLOW-DEBUG] This will open browser for authentication');
        console.log('[ANDROID-KEYCLOAK DEBUG] Not authenticated and conditions met, triggering login');
        this.isLoginInProgress = true;
        this.lastLoginAttemptTime = Date.now();
        this.androidKeycloak.login().then(() => {
          console.log('[OIDC-FLOW-DEBUG] ========== Login Promise Resolved ==========');
          console.log('[OIDC-FLOW-DEBUG] Browser should have opened for login');
        }).catch((error) => {
          console.error('[ANDROID-KEYCLOAK DEBUG] Login error:', error);
          this.isLoginInProgress = false;
          // Mark auth as failed to prevent immediate retry
          sessionStorage.setItem('keycloak_auth_failed', 'true');
          sessionStorage.setItem('keycloak_auth_failed_time', Date.now().toString());
        });
      } else {
        if (recentlyFailed) {
          console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login due to recent auth failure (waiting 30s)');
        } else if (loginInProgress) {
          console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login - login already in progress');
        } else if (hasCodeInUrl) {
          console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login - processing callback');
        } else if (existingToken || this.androidKeycloak.token) {
          console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login - token exists');
        } else if (authSuccess) {
          console.log('[ANDROID-KEYCLOAK DEBUG] Skipping login - auth just succeeded');
        }
      }
    }).catch((error) => {
      console.error('[ANDROID-KEYCLOAK DEBUG] Keycloak init error:', error);
      // Mark auth as failed to prevent immediate retry
      sessionStorage.setItem('keycloak_auth_failed', 'true');
      sessionStorage.setItem('keycloak_auth_failed_time', Date.now().toString());
      // Reset login progress flags
      this.isLoginInProgress = false;
    });
  }
  getInstance() {
    return this.androidKeycloak;
  }
}