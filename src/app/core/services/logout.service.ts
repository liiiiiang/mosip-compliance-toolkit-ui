import { Injectable } from '@angular/core';
import { AppConfigService } from 'src/app/app-config.service';
import { AndroidKeycloakService } from './android-keycloak';
import { environment } from 'src/environments/environment';
import * as appConstants from 'src/app/app.constants';
import { CapacitorCookies } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class LogoutService {
  constructor(
    private androidKeycloakService: AndroidKeycloakService,
    private appService: AppConfigService
  ) { }

  async logout(): Promise<any> {
    const isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
    if (isAndroidAppMode) {
      const keycloakInstance = this.androidKeycloakService.getInstance();
      if (keycloakInstance) {
        try {
          await keycloakInstance.logout();
          keycloakInstance.clearToken();
        } catch (error) {
          console.error('Error during Keycloak logout:', error);
        }
      } else {
        console.warn('Keycloak instance is not initialized, proceeding with local cleanup');
      }
      // Always clear local storage and session storage for proper logout
      localStorage.removeItem(appConstants.ACCESS_TOKEN);
      sessionStorage.clear();
      // Extract domain from SERVICES_BASE_URL for Cookie deletion
      let cookieUrl = environment.SERVICES_BASE_URL;
      try {
        const urlObj = new URL(environment.SERVICES_BASE_URL);
        cookieUrl = `${urlObj.protocol}//${urlObj.host}`;
      } catch (e) {
        console.warn('Failed to parse SERVICES_BASE_URL for cookie domain:', e);
      }
      try {
        await CapacitorCookies.deleteCookie({
          url: cookieUrl,
          key: appConstants.AUTHORIZATION
        });
      } catch (error) {
        console.warn('Error deleting cookie:', error);
      }
      return true;
    } else {
      let url = `${this.appService.getConfig().SERVICES_BASE_URL}${this.appService.getConfig().logout}?redirecturi=${btoa(window.location.href)}`
      console.log('logout url ' + url);
      window.location.href = url;
    }
    //let adminUrl = this.appService.getConfig().toolkitUiUrl;
    /*
        this.http
          .get(
            `${this.appService.getConfig().SERVICES_BASE_URL}${
              this.appService.getConfig().logout
            }?redirecturi=`+btoa(window.location.href),
            {
              observe: 'response',
              responseType: "json",
            }
          )
          .subscribe(
            (res: any) => {
              console.log(res.body.response);
              this.cookieService.deleteAll();
              if (res && res.body && res.body.response) {
                if (res.body.response.status === 'Success') {
                  sessionStorage.clear();
                  localStorage.clear();
                  this.cookieService.deleteAll();
                  this.redirectService.redirect(window.location.origin + adminUrl);
                } else {
                  window.alert(res.body.response.message);
                }
              } else {
                window.alert('Unable to process logout request');
              }
            },
            (error: HttpErrorResponse) => {
              window.alert(error.message);
            }
          );*/
  }
}
