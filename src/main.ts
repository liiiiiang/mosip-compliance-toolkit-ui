import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

// Early URL cleanup for Android app mode to prevent duplicate code exchange
if (environment.isAndroidAppMode === 'yes') {
  const isProcessing = sessionStorage.getItem('keycloak_auth_processing');
  if (isProcessing && (window.location.search || window.location.hash)) {
    console.log('[MAIN DEBUG] Early URL cleanup - processing flag detected', {
      url: window.location.href,
      hasSearch: !!window.location.search,
      hasHash: !!window.location.hash
    });
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    console.log('[MAIN DEBUG] URL cleaned to:', cleanUrl);
  }
}

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
