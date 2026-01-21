import * as Keycloak from 'src/app/lib/keycloak';
import * as appConstants from 'src/app/app.constants';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AndroidKeycloakService {

  private androidKeycloak: Keycloak.KeycloakInstance;

  constructor(
  ) {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    if (isAndroidAppMode) {
      this.setUp();
    }
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
    
    // Check if we're in the middle of processing (after reload)
    // This happens when onAuthSuccess triggered reload but URL still has code params
    // Clean URL immediately before keycloak init parses it
    const isProcessing = sessionStorage.getItem('keycloak_auth_processing');
    console.log('[ANDROID-KEYCLOAK DEBUG] Processing flag check', {
      isProcessing: isProcessing,
      hasSearch: !!window.location.search,
      hasHash: !!window.location.hash
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
      // If we already have a token, we don't need to process the callback again
      const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
      if (existingToken) {
        console.log('[ANDROID-KEYCLOAK DEBUG] Token already exists, skipping callback processing', {
          tokenLength: existingToken.length
        });
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
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        
        // Mark that we're processing to prevent duplicate calls
        sessionStorage.setItem('keycloak_auth_processing', 'true');
        isReloading = true;
        
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
      }
    };
    
    console.log('[ANDROID-KEYCLOAK DEBUG] Calling keycloak.init', {
      adapter: 'capacitor-native',
      responseMode: 'query',
      redirectUri: environment.redirectUri,
      currentUrl: window.location.href
    });
    
    this.androidKeycloak.init({
      adapter: 'capacitor-native',
      responseMode: 'query',
      enableLogging: true,
      useNonce: false,
      redirectUri: environment.redirectUri
    }).then(() => {
      console.log('[ANDROID-KEYCLOAK DEBUG] keycloak.init completed successfully');
    }).catch((error) => {
      console.error('[ANDROID-KEYCLOAK DEBUG] Keycloak init error:', error);
    });
  }
  getInstance() {
    return this.androidKeycloak;
  }
}