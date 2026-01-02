export const config = {
  graphUrl: 'https://graph.microsoft.com/v1.0',
  /**
   * The Microsoft Entra ID Application registered for this dashboard.
   * https://portal.azure.com/?utm_source=copilot.com#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview
   */
  msalConfig: {
    auth: {
      clientId: 'b2e1600d-0598-4527-a4de-67240bdbe077',
      authority: 'https://login.microsoftonline.com/consumers',
    },
    authRequest: {
      scope: ['User.Read', 'Calendars.Read'],
    },
  },
};
