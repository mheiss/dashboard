import { MsalGuardConfiguration, MsalInterceptorConfiguration } from '@azure/msal-angular';
import { BrowserAuthOptions, BrowserCacheLocation, Configuration, InteractionType } from '@azure/msal-browser';
import { config } from '../../config';

/**
 * The MSAL configuration
 */
export const AUTH_OPTIONS: BrowserAuthOptions = {
  clientId: config.msalConfig.auth.clientId,
  authority: config.msalConfig.auth.authority,
  redirectUri: '/',
};
export const AUTH_CONFIG: Configuration = {
  auth: AUTH_OPTIONS,
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
  },
};

/**
 * The MSAL Guard Config
 */
export const GUARD_CONFIG: MsalGuardConfiguration = {
  interactionType: InteractionType.Redirect,
  authRequest: {
    scopes: config.msalConfig.authRequest.scope,
  },
};

export const INTERCEPTOR_CONFIG: MsalInterceptorConfiguration = {
  interactionType: InteractionType.Redirect,
  protectedResourceMap: new Map([[config.graphUrl, config.msalConfig.authRequest.scope]]),
};
