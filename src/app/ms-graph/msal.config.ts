import { MsalGuardConfiguration, MsalInterceptorConfiguration } from '@azure/msal-angular';
import { BrowserCacheLocation, InteractionType } from '@azure/msal-browser';
import { AppConfig, MsalConfig } from '../feature-config/config.model';

/**
 * The MSAL authentication config
 */
export const getAuthConfig = (config: MsalConfig) => {
  return {
    auth: {
      clientId: config.clientId,
      authority: config.authority,
      redirectUri: '/',
    },
    cache: {
      cacheLocation: BrowserCacheLocation.LocalStorage,
    },
  };
};

/**
 * The MSAL Guard Config
 */
export const getGuardConfig = (config: MsalConfig): MsalGuardConfiguration => {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: config.scope,
    },
  };
};

/**
 * The MSAL interceptor Config
 */
export const getInterceptorConfig = (appConfig: AppConfig): MsalInterceptorConfiguration => {
  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap: new Map([[appConfig.graphUrl + '/*', appConfig.msalConfig.scope]]),
  };
};
