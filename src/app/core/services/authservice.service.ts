import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AppConfigService } from 'src/app/app-config.service';

@Injectable()
export class AuthService {
  constructor(
    private http: HttpClient,
    private appService: AppConfigService
  ) { }

  isAuthenticated(): Observable<boolean> {
      console.log('[OIDC-FLOW-DEBUG] ========== authService.isAuthenticated() ==========');
      console.log('[OIDC-FLOW-DEBUG] Calling validateToken API');
      console.log('[OIDC-FLOW-DEBUG] Current localStorage token:', localStorage.getItem('accessToken') ? 'EXISTS' : 'NONE');
      
      return this.http
      .get(
        `${
          this.appService.getConfig().SERVICES_BASE_URL
        }authorize/admin/validateToken`,
        { observe: 'response' }
      )
      .pipe(
        map((res) => {
          console.log('[OIDC-FLOW-DEBUG] validateToken API returned:', res.status);
          return res.status === 200;
        }),
        catchError((error) => {
          console.error('[OIDC-FLOW-DEBUG] validateToken API ERROR:', error.status);
          console.error('[OIDC-FLOW-DEBUG] HTTP interceptor will now trigger re-login');
          console.log(error);
          return of(false);
        })
      );
  }

  isLanguagesSet() {
    return true;
  }
}
