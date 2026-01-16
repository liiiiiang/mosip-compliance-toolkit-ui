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
    this.androidKeycloak = Keycloak({
      clientId: environment.IAM_CLIENT_ID,
      realm: environment.IAM_REALM,
      url: environment.IAM_URL,
    });
    this.androidKeycloak.onAuthSuccess = () => {
      // save tokens to device storage
      const accessToken = this.androidKeycloak.token;
      if (accessToken) {
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        this.isLoggingIn = false;
        // Use setTimeout to ensure token is saved before reload
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    };
    this.androidKeycloak.onAuthError = () => {
      this.isLoggingIn = false;
      console.log('Keycloak authentication error');
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
      if (authenticated) {
        const accessToken = this.androidKeycloak.token;
        if (accessToken) {
          localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        }
      }
    }).catch((error) => {
      this.isInitialized = true;
      console.log('Keycloak initialization error:', error);
    });
  }

  getInstance() {
    return this.androidKeycloak;
  }

  isLoginInProgress(): boolean {
    return this.isLoggingIn;
  }

  async login(): Promise<void> {
    if (this.isLoggingIn || !this.isInitialized) {
      console.log('Login already in progress or Keycloak not initialized');
      return;
    }
    // Check if already authenticated
    if (this.androidKeycloak.authenticated) {
      const accessToken = this.androidKeycloak.token;
      if (accessToken) {
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        return;
      }
    }
    this.isLoggingIn = true;
    try {
      await this.androidKeycloak.login();
    } catch (error) {
      this.isLoggingIn = false;
      console.log('Login error:', error);
      throw error;
    }
  }
}
