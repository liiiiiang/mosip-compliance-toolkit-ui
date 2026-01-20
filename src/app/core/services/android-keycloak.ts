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
    // Prevent duplicate setup
    if (this.androidKeycloak) {
      return;
    }
    
    // Check if we're in the middle of processing (after reload)
    // This happens when onAuthSuccess triggered reload but URL still has code params
    // Clean URL immediately before keycloak init parses it
    const isProcessing = sessionStorage.getItem('keycloak_auth_processing');
    if (isProcessing) {
      console.log('Keycloak setUp: Detected post-auth reload, cleaning URL to prevent duplicate code exchange');
      const cleanUrl = window.location.origin + window.location.pathname;
      // Force clear ALL URL parameters and fragments immediately
      if (window.location.search || window.location.hash) {
        window.history.replaceState({}, document.title, cleanUrl);
      }
      // Clear the flag after cleaning URL
      sessionStorage.removeItem('keycloak_auth_processing');
      // If we already have a token, we don't need to process the callback again
      const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
      if (existingToken) {
        console.log('Keycloak setUp: Token already exists, skipping callback processing');
      }
    }
    
    this.androidKeycloak = Keycloak({
      clientId: environment.IAM_CLIENT_ID,
      realm: environment.IAM_REALM,
      url: environment.IAM_URL,
    });
    
    let isReloading = false; // Flag to prevent duplicate reloads
    this.androidKeycloak.onAuthSuccess = () => {
      // Prevent duplicate processing
      if (isReloading) {
        console.log('onAuthSuccess: Already processing, skipping');
        return;
      }
      
      // Check if we already have a token (prevent duplicate processing after reload)
      const existingToken = localStorage.getItem(appConstants.ACCESS_TOKEN);
      if (existingToken && this.androidKeycloak.token === existingToken) {
        console.log('onAuthSuccess: Token already exists and matches, skipping reload');
        return;
      }
      
      // save tokens to device storage
      const accessToken = this.androidKeycloak.token;
      if (accessToken) {
        console.log('onAuthSuccess: Saving token and preparing reload');
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        
        // Mark that we're processing to prevent duplicate calls
        sessionStorage.setItem('keycloak_auth_processing', 'true');
        isReloading = true;
        
        // Clear ALL URL parameters and fragments before reloading
        // This prevents the second CODE_TO_TOKEN attempt with an already-used authorization code
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        
        // Force clear any remaining query params by navigating to clean URL
        // Use a longer timeout to ensure URL is fully cleared
        setTimeout(() => {
          // Double-check URL is clean
          if (window.location.search || window.location.hash) {
            window.history.replaceState({}, document.title, cleanUrl);
          }
          // Keep the flag during reload - it will be cleared after init checks
          window.location.reload();
        }, 200);
      }
    };
    
    this.androidKeycloak.init({
      adapter: 'capacitor-native',
      responseMode: 'query',
      enableLogging: true,
      useNonce: false,
      redirectUri: environment.redirectUri
    }).catch((error) => {
      console.log('Keycloak init error:', error);
    });
  }
  getInstance() {
    return this.androidKeycloak;
  }
}