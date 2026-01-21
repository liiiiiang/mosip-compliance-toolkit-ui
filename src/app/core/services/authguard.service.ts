import { AuthService } from './authservice.service';
import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  CanActivateChild,
} from '@angular/router';
import { Observable } from 'rxjs';

@Injectable()
export class AuthguardService implements CanActivate, CanActivateChild {
  constructor(private authService: AuthService) {}
  isActive: Observable<boolean>;
  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | Observable<boolean> {
    console.log('[OIDC-FLOW-DEBUG] ========== AuthGuard.canActivate() ==========');
    console.log('[OIDC-FLOW-DEBUG] Route:', state.url);
    console.log('[OIDC-FLOW-DEBUG] Will call authService.isAuthenticated() which calls validateToken API');
    console.log('[OIDC-FLOW-DEBUG] If validateToken returns 401, HTTP interceptor will trigger re-login');
    //console.log('canActivate');
    return this.authService.isAuthenticated();
  }

  canActivateChild(
    childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | Observable<boolean> {
    return this.canActivate(childRoute, state);
  }
}
