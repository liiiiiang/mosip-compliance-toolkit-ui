import * as Keycloak from 'src/app/lib/keycloak';
import * as appConstants from 'src/app/app.constants';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AndroidKeycloakService {

  private androidKeycloak: Keycloak.KeycloakInstance;
  private isLoggingIn: boolean = false;
  private isInitialized: boolean = false;
  private readonly LOGIN_COMPLETED_FLAG = 'android_keycloak_login_completed';
  private readonly LOGIN_COMPLETED_TIMESTAMP = 'android_keycloak_login_timestamp';

  constructor(
  ) {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    if (isAndroidAppMode) {
      this.setUp();
    }
  }

  public setUp() {
    console.log('[DEBUG] AndroidKeycloakService: Setting up Keycloak');
    console.log('[DEBUG] IAM_URL:', environment.IAM_URL);
    console.log('[DEBUG] IAM_REALM:', environment.IAM_REALM);
    console.log('[DEBUG] IAM_CLIENT_ID:', environment.IAM_CLIENT_ID);
    console.log('[DEBUG] redirectUri:', environment.redirectUri);
    console.log('[DEBUG] Current localStorage ACCESS_TOKEN:', localStorage.getItem(appConstants.ACCESS_TOKEN) ? 'EXISTS' : 'NOT_EXISTS');
    console.log('[DEBUG] Current isLoggingIn state:', this.isLoggingIn);
    console.log('[DEBUG] Current isInitialized state:', this.isInitialized);
    
    // Check for login completion flag (to prevent loop after reload)
    const loginCompleted = localStorage.getItem(this.LOGIN_COMPLETED_FLAG);
    const loginTimestamp = localStorage.getItem(this.LOGIN_COMPLETED_TIMESTAMP);
    console.log('[DEBUG] Login completion flag:', loginCompleted);
    console.log('[DEBUG] Login completion timestamp:', loginTimestamp);
    
    if (loginCompleted === 'true') {
      const timestamp = loginTimestamp ? parseInt(loginTimestamp) : 0;
      const elapsed = Date.now() - timestamp;
      console.log('[DEBUG] Login was recently completed, elapsed time (ms):', elapsed);
      
      // Clear flag after 5 seconds to allow normal operation
      if (elapsed > 5000) {
        console.log('[DEBUG] Clearing login completion flag (more than 5 seconds elapsed)');
        localStorage.removeItem(this.LOGIN_COMPLETED_FLAG);
        localStorage.removeItem(this.LOGIN_COMPLETED_TIMESTAMP);
      } else {
        console.log('[DEBUG] Login completion flag active - this is a fresh reload after login');
      }
    }

    this.androidKeycloak = Keycloak({
      clientId: environment.IAM_CLIENT_ID,
      realm: environment.IAM_REALM,
      url: environment.IAM_URL,
    });

    this.androidKeycloak.onAuthSuccess = () => {
      console.log('[DEBUG] ====== AndroidKeycloakService: onAuthSuccess CALLED ======');
      console.log('[DEBUG] Timestamp:', new Date().toISOString());
      console.log('[DEBUG] isLoggingIn before:', this.isLoggingIn);
      
      // save tokens to device storage
      const accessToken = this.androidKeycloak.token;
      const tokenLength = accessToken ? accessToken.length : 0;
      const tokenPreview = accessToken ? accessToken.substring(0, 20) + '...' : 'null';
      
      console.log('[DEBUG] Access token received:', accessToken ? 'Yes' : 'No');
      console.log('[DEBUG] Access token length:', tokenLength);
      console.log('[DEBUG] Access token preview:', tokenPreview);
      console.log('[DEBUG] androidKeycloak.authenticated:', this.androidKeycloak.authenticated);
      
      if (accessToken) {
        try {
          // Check if token already exists
          const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
          console.log('[DEBUG] Existing token in localStorage:', existingToken ? 'EXISTS (length: ' + existingToken.length + ')' : 'NOT_EXISTS');
          
          localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
          const savedToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
          console.log('[DEBUG] Token saved to localStorage, verification:', savedToken === accessToken ? 'SUCCESS' : 'FAILED');
          console.log('[DEBUG] Saved token length:', savedToken ? savedToken.length : 0);
          
          // Set flag to prevent login loop after reload
          localStorage.setItem(this.LOGIN_COMPLETED_FLAG, 'true');
          localStorage.setItem(this.LOGIN_COMPLETED_TIMESTAMP, Date.now().toString());
          console.log('[DEBUG] Login completion flag set to prevent loop');
          
          this.isLoggingIn = false;
          console.log('[DEBUG] isLoggingIn set to false');
          
          // Use setTimeout to ensure token is saved and processed before reload
          console.log('[DEBUG] Scheduling page reload in 500ms... (increased delay to ensure token persistence)');
          setTimeout(() => {
            console.log('[DEBUG] ====== EXECUTING PAGE RELOAD ======');
            console.log('[DEBUG] Token in localStorage before reload:', localStorage.getItem(appConstants.ACCESS_TOKEN) ? 'EXISTS' : 'NOT_EXISTS');
            console.log('[DEBUG] Login flag before reload:', localStorage.getItem(this.LOGIN_COMPLETED_FLAG));
            console.log('[DEBUG] Current URL:', window.location.href);
            window.location.reload();
          }, 500);
        } catch (error) {
          console.error('[DEBUG] ERROR saving token:', error);
          this.isLoggingIn = false;
        }
      } else {
        console.warn('[DEBUG] WARNING: No access token received in onAuthSuccess');
        this.isLoggingIn = false;
      }
      console.log('[DEBUG] ====== onAuthSuccess COMPLETE ======');
    };

    this.androidKeycloak.onAuthError = (errorData: any) => {
      console.error('[DEBUG] ====== AndroidKeycloakService: onAuthError CALLED ======');
      console.error('[DEBUG] Error data:', JSON.stringify(errorData));
      console.error('[DEBUG] Timestamp:', new Date().toISOString());
      console.error('[DEBUG] isLoggingIn before:', this.isLoggingIn);
      this.isLoggingIn = false;
      console.error('[DEBUG] isLoggingIn after:', this.isLoggingIn);
      console.error('[DEBUG] ====== onAuthError COMPLETE ======');
    };

    this.androidKeycloak.onReady = (authenticated: boolean) => {
      console.log('[DEBUG] ====== AndroidKeycloakService: onReady CALLED ======');
      console.log('[DEBUG] authenticated parameter:', authenticated);
      console.log('[DEBUG] androidKeycloak.authenticated:', this.androidKeycloak.authenticated);
      console.log('[DEBUG] Timestamp:', new Date().toISOString());
      
      if (authenticated) {
        const accessToken = this.androidKeycloak.token;
        console.log('[DEBUG] Access token in onReady:', accessToken ? 'EXISTS (length: ' + accessToken.length + ')' : 'NOT_EXISTS');
        if (accessToken) {
          console.log('[DEBUG] Already authenticated, saving token to localStorage');
          const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
          console.log('[DEBUG] Existing token before save:', existingToken ? 'EXISTS' : 'NOT_EXISTS');
          localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
          const savedToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
          console.log('[DEBUG] Token saved, verification:', savedToken === accessToken ? 'SUCCESS' : 'FAILED');
        }
      } else {
        console.log('[DEBUG] Not authenticated in onReady');
      }
      console.log('[DEBUG] ====== onReady COMPLETE ======');
    };

    this.androidKeycloak.init({
      adapter: 'capacitor-native',
      responseMode: 'query',
      enableLogging: true,
      useNonce: false,
      redirectUri: environment.redirectUri,
      onLoad: 'check-sso', // Check if already authenticated
      checkLoginIframe: false // Disable iframe check for mobile
    }).then((authenticated) => {
      this.isInitialized = true;
      console.log('[DEBUG] ====== AndroidKeycloakService: init() RESOLVED ======');
      console.log('[DEBUG] authenticated result:', authenticated);
      console.log('[DEBUG] androidKeycloak.authenticated:', this.androidKeycloak.authenticated);
      console.log('[DEBUG] Timestamp:', new Date().toISOString());
      
      if (authenticated) {
        const accessToken = this.androidKeycloak.token;
        console.log('[DEBUG] Token after init:', accessToken ? 'EXISTS (length: ' + accessToken.length + ')' : 'NOT_EXISTS');
        if (accessToken) {
          console.log('[DEBUG] Token found after init, saving to localStorage');
          const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
          console.log('[DEBUG] Existing token before save:', existingToken ? 'EXISTS' : 'NOT_EXISTS');
          localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
          const savedToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
          console.log('[DEBUG] Token saved after init, verification:', savedToken === accessToken ? 'SUCCESS' : 'FAILED');
        }
      } else {
        console.log('[DEBUG] Not authenticated after init');
        const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
        console.log('[DEBUG] Existing token in localStorage:', existingToken ? 'EXISTS (may be stale)' : 'NOT_EXISTS');
      }
      console.log('[DEBUG] ====== init() COMPLETE ======');
    }).catch((error) => {
      this.isInitialized = true;
      console.error('[DEBUG] ====== AndroidKeycloakService: init() ERROR ======');
      console.error('[DEBUG] Error:', error);
      console.error('[DEBUG] Error stack:', error?.stack);
      console.error('[DEBUG] Timestamp:', new Date().toISOString());
      console.error('[DEBUG] ====== init() ERROR COMPLETE ======');
    });
  }

  getInstance() {
    return this.androidKeycloak;
  }

  isLoginInProgress(): boolean {
    const result = this.isLoggingIn;
    console.log('[DEBUG] AndroidKeycloakService.isLoginInProgress() called, returning:', result);
    return result;
  }

  async login(): Promise<void> {
    console.log('[DEBUG] ====== AndroidKeycloakService: login() CALLED ======');
    console.log('[DEBUG] Timestamp:', new Date().toISOString());
    console.log('[DEBUG] Current isLoggingIn state:', this.isLoggingIn);
    console.log('[DEBUG] Current isInitialized state:', this.isInitialized);
    console.log('[DEBUG] Current localStorage ACCESS_TOKEN:', localStorage.getItem(appConstants.ACCESS_TOKEN) ? 'EXISTS' : 'NOT_EXISTS');
    
    if (this.isLoggingIn) {
      console.log('[DEBUG] WARNING: Login already in progress, skipping');
      console.log('[DEBUG] ====== login() ABORTED (already in progress) ======');
      return;
    }

    if (!this.isInitialized) {
      console.log('[DEBUG] Keycloak not initialized yet, waiting...');
      // Wait for initialization
      let attempts = 0;
      while (!this.isInitialized && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (attempts % 10 === 0) {
          console.log('[DEBUG] Still waiting for initialization, attempt:', attempts);
        }
      }
      if (!this.isInitialized) {
        console.error('[DEBUG] ERROR: Keycloak initialization timeout after', attempts, 'attempts');
        console.log('[DEBUG] ====== login() ABORTED (timeout) ======');
        return;
      }
      console.log('[DEBUG] Initialization completed after', attempts, 'attempts');
    }

    // Check if already authenticated
    console.log('[DEBUG] Checking authentication status...');
    console.log('[DEBUG] androidKeycloak.authenticated:', this.androidKeycloak.authenticated);
    
    if (this.androidKeycloak.authenticated) {
      const accessToken = this.androidKeycloak.token;
      console.log('[DEBUG] Already authenticated, token:', accessToken ? 'EXISTS' : 'NOT_EXISTS');
      if (accessToken) {
        console.log('[DEBUG] Using existing token, saving to localStorage');
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        console.log('[DEBUG] ====== login() COMPLETE (already authenticated) ======');
        return;
      }
    }

    console.log('[DEBUG] Starting login process...');
    console.log('[DEBUG] Setting isLoggingIn to true');
    this.isLoggingIn = true;
    console.log('[DEBUG] Calling androidKeycloak.login()...');
    
    try {
      await this.androidKeycloak.login();
      console.log('[DEBUG] androidKeycloak.login() promise resolved');
      console.log('[DEBUG] After login - authenticated:', this.androidKeycloak.authenticated);
      console.log('[DEBUG] After login - token exists:', this.androidKeycloak.token ? 'YES' : 'NO');
      console.log('[DEBUG] ====== login() COMPLETE (success) ======');
    } catch (error) {
      this.isLoggingIn = false;
      console.error('[DEBUG] ====== login() ERROR ======');
      console.error('[DEBUG] Error:', error);
      console.error('[DEBUG] Error stack:', error?.stack);
      console.error('[DEBUG] isLoggingIn set to false');
      console.error('[DEBUG] ====== login() ERROR COMPLETE ======');
      throw error;
    }
  }
}
