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
    
    this.androidKeycloak = Keycloak({
      clientId: environment.IAM_CLIENT_ID,
      realm: environment.IAM_REALM,
      url: environment.IAM_URL,
    });
    
    let isReloading = false; // Flag to prevent duplicate reloads
    this.androidKeycloak.onAuthSuccess = () => {
      // Prevent duplicate processing
      if (isReloading) {
        return;
      }
      
      // save tokens to device storage
      const accessToken = this.androidKeycloak.token;
      if (accessToken) {
        localStorage.setItem(appConstants.ACCESS_TOKEN, accessToken);
        isReloading = true;
        
        // Clear URL parameters before reloading to prevent duplicate code exchange
        // This prevents the second CODE_TO_TOKEN attempt with an already-used authorization code
        const urlWithoutParams = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, urlWithoutParams);
        
        // Use setTimeout to ensure URL is cleared before reload
        setTimeout(() => {
          window.location.reload();
        }, 100);
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