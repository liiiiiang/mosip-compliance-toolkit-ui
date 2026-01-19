import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
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
      console.log('[DEBUG] ====== AuthService.isAuthenticated() CALLED ======');
      const url = `${this.appService.getConfig().SERVICES_BASE_URL}authorize/admin/validateToken`;
      console.log('[DEBUG] validateToken URL:', url);
      console.log('[DEBUG] Timestamp:', new Date().toISOString());
      
      return this.http
      .get(
        url,
        { observe: 'response' }
      )
      .pipe(
        map((res) => {
          const isAuthenticated = res.status === 200;
          console.log('[DEBUG] AuthService.isAuthenticated() - Response status:', res.status);
          console.log('[DEBUG] AuthService.isAuthenticated() - Result:', isAuthenticated);
          console.log('[DEBUG] ====== AuthService.isAuthenticated() SUCCESS ======');
          return isAuthenticated;
        }),
        catchError((error) => {
          console.error('[DEBUG] ====== AuthService.isAuthenticated() ERROR ======');
          console.error('[DEBUG] Error:', error);
          if (error instanceof HttpErrorResponse) {
            console.error('[DEBUG] Error status:', error.status);
            console.error('[DEBUG] Error message:', error.message);
            console.error('[DEBUG] Error URL:', error.url);
          } else {
            console.error('[DEBUG] Error status: N/A (not HttpErrorResponse)');
            console.error('[DEBUG] Error message:', error instanceof Error ? error.message : 'N/A');
            console.error('[DEBUG] Error URL: N/A');
          }
          console.error('[DEBUG] Returning false');
          console.error('[DEBUG] ====== AuthService.isAuthenticated() ERROR COMPLETE ======');
          return of(false);
        })
      );
  }

  isLanguagesSet() {
    return true;
  }
}
