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

  constructor(
  ) {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    if (isAndroidAppMode) {
      this.setUp();
    }
  }

  public setUp() {
    console.log('AndroidKeycloakService: Setting up Keycloak');
    console.log('IAM_URL:', environment.IAM_URL);
    console.log('IAM_REALM:', environment.IAM_REALM);
    console.log('IAM_CLIENT_ID:', environment.IAM_CLIENT_ID);
    console.log('redirectUri:', environment.redirectUri);

    this.androidKeycloak = Keycloak({
      clientId: environment.IAM_CLIENT_ID,
      realm: environment.IAM_REALM,
      url: environment.IAM_URL,
    });

    this.androidKeycloak.onAuthSuccess = () => {
      console.log('AndroidKeycloakService: onAuthSuccess called');
      // save tokens to device storage
      const accessToken = this.androidKeycloak.token;
      console.log('AndroidKeycloakService: Access token received:', accessToken ? 'Yes' : 'No');
      
      if (accessToken) {
        try {
          localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
          console.log('AndroidKeycloakService: Token saved to localStorage');
          this.isLoggingIn = false;
          
          // Use setTimeout to ensure token is saved and processed before reload
          setTimeout(() => {
            console.log('AndroidKeycloakService: Reloading page after successful authentication');
            window.location.reload();
          }, 200);
        } catch (error) {
          console.error('AndroidKeycloakService: Error saving token:', error);
          this.isLoggingIn = false;
        }
      } else {
        console.warn('AndroidKeycloakService: No access token received in onAuthSuccess');
        this.isLoggingIn = false;
      }
    };

    this.androidKeycloak.onAuthError = (errorData: any) => {
      console.error('AndroidKeycloakService: onAuthError called', errorData);
      this.isLoggingIn = false;
    };

    this.androidKeycloak.onReady = (authenticated: boolean) => {
      console.log('AndroidKeycloakService: onReady called, authenticated:', authenticated);
      this.isInitialized = true; // Mark as initialized when onReady is called
      if (authenticated) {
        const accessToken = this.androidKeycloak.token;
        if (accessToken) {
          console.log('AndroidKeycloakService: Already authenticated, saving token');
          localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        }
      }
    };

    console.log('AndroidKeycloakService: Starting init()...');
    this.androidKeycloak.init({
      adapter: 'capacitor-native',
      responseMode: 'query',
      enableLogging: true,
      useNonce: false,
      redirectUri: environment.redirectUri,
      onLoad: 'check-sso', // Check if already authenticated
      checkLoginIframe: false // Disable iframe check for mobile
    }).then((authenticated) => {
      console.log('AndroidKeycloakService: init() Promise resolved, authenticated:', authenticated);
      this.isInitialized = true;
      console.log('AndroidKeycloakService: Initialization complete, authenticated:', authenticated);
      if (authenticated) {
        const accessToken = this.androidKeycloak.token;
        if (accessToken) {
          console.log('AndroidKeycloakService: Token found after init, saving to localStorage');
          localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        }
      }
    }).catch((error) => {
      console.error('AndroidKeycloakService: init() Promise rejected with error:', error);
      this.isInitialized = true; // Mark as initialized even on error to prevent infinite waiting
      console.error('AndroidKeycloakService: Initialization error:', error);
    });

    // Add a timeout fallback in case init() never resolves or rejects
    setTimeout(() => {
      if (!this.isInitialized) {
        console.warn('AndroidKeycloakService: Init timeout fallback triggered - marking as initialized');
        this.isInitialized = true;
      }
    }, 10000); // 10 second timeout
  }

  getInstance() {
    return this.androidKeycloak;
  }

  isLoginInProgress(): boolean {
    return this.isLoggingIn;
  }

  async login(): Promise<void> {
    if (this.isLoggingIn) {
      console.log('AndroidKeycloakService: Login already in progress, skipping');
      return;
    }

    if (!this.isInitialized) {
      console.log('AndroidKeycloakService: Keycloak not initialized yet, waiting...');
      // Wait for initialization with longer timeout (10 seconds)
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds total
      while (!this.isInitialized && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (attempts % 10 === 0) {
          console.log(`AndroidKeycloakService: Still waiting for initialization... (${attempts * 100}ms)`);
        }
      }
      if (!this.isInitialized) {
        console.error('AndroidKeycloakService: Keycloak initialization timeout after 10 seconds');
        console.error('AndroidKeycloakService: Attempting login anyway...');
        // Continue anyway - sometimes init() completes but flag isn't set
      } else {
        console.log('AndroidKeycloakService: Initialization completed, proceeding with login');
      }
    }

    // Check if already authenticated
    if (this.androidKeycloak.authenticated) {
      const accessToken = this.androidKeycloak.token;
      if (accessToken) {
        console.log('AndroidKeycloakService: Already authenticated, using existing token');
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        return;
      }
    }

    console.log('AndroidKeycloakService: Starting login process');
    this.isLoggingIn = true;
    try {
      await this.androidKeycloak.login();
      console.log('AndroidKeycloakService: Login call completed');
    } catch (error) {
      this.isLoggingIn = false;
      console.error('AndroidKeycloakService: Login error:', error);
      throw error;
    }
  }
}
