import * as Keycloak from 'src/app/lib/keycloak';
import * as appConstants from 'src/app/app.constants';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { App } from '@capacitor/app';

@Injectable({
  providedIn: 'root',
})
export class AndroidKeycloakService {

  private androidKeycloak: Keycloak.KeycloakInstance;
  private urlListener: any = null;

  constructor(
  ) {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    if (isAndroidAppMode) {
      // Register global deep link listener BEFORE setUp to catch redirects immediately
      this.registerGlobalDeepLinkListener();
      this.setUp();
    }
  }

  /**
   * Register a global deep link listener to catch Keycloak redirects
   * This must be registered before Keycloak init to ensure we catch the redirect
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
        console.log('[ANDROID-KEYCLOAK] Deep link received:', data.url);
        
        // Check if this is a Keycloak callback (contains code parameter)
        if (data.url && (data.url.includes('code=') || data.url.includes('android://mosip-compliance-toolkit-ui'))) {
          console.log('[ANDROID-KEYCLOAK] Keycloak callback detected, processing...');
          
          // If Keycloak is already initialized, let it handle the callback
          if (this.androidKeycloak) {
            // Parse the callback URL
            const url = new URL(data.url);
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            
            if (code) {
              console.log('[ANDROID-KEYCLOAK] Found authorization code in deep link');
              // The Keycloak adapter should handle this, but we ensure it's processed
              // by checking if the current URL matches
              if (window.location.href !== data.url) {
                // Update window location to trigger Keycloak's callback handler
                window.location.href = data.url;
              }
            }
          } else {
            console.warn('[ANDROID-KEYCLOAK] Keycloak not initialized yet, storing URL for later processing');
            // Store the URL to process after Keycloak is initialized
            sessionStorage.setItem('pending_keycloak_callback', data.url);
          }
        }
      });

      console.log('[ANDROID-KEYCLOAK] Global deep link listener registered');
    } else {
      console.warn('[ANDROID-KEYCLOAK] Capacitor not available, cannot register deep link listener');
    }
  }

  public setUp() {
    // Check for pending callback from before initialization
    const pendingCallback = sessionStorage.getItem('pending_keycloak_callback');
    if (pendingCallback) {
      console.log('[ANDROID-KEYCLOAK] Found pending callback, processing...');
      sessionStorage.removeItem('pending_keycloak_callback');
      // Process the callback after a short delay to ensure Keycloak is ready
      setTimeout(() => {
        window.location.href = pendingCallback;
      }, 100);
    }

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
        window.location.reload();
      }
    };
    this.androidKeycloak.init({
      adapter: 'capacitor-native',
      responseMode: 'query',
      enableLogging: true,
      useNonce: false,
      redirectUri: environment.redirectUri
    }).catch((error) => {
      console.log(error);
    });
  }
  
  getInstance() {
    return this.androidKeycloak;
  }
}