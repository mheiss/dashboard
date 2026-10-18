# Smart Home Dashboard

An Angular dashboard for a wall-mounted smart home tablet. It combines family calendar data, a OneDrive photo gallery, a predefined openHAB sitemap, EVCC wallbox information, and UniFi Protect camera streams in one touch-friendly interface.

The app is designed for an always-on display in the living room. It keeps the main flows large and simple, embeds the existing openHAB controls, and pauses camera/gallery work when the tablet screen is off.

## Main Screens

On tablets and larger screens, the dashboard has four primary sections in the navigation bar. On mobile (below 640px), Home is replaced by separate Kalender and Galerie buttons.

- **Home**: Shows the configured Microsoft calendars next to a OneDrive photo gallery.
- **OpenHAB**: Displays the predefined openHAB sitemap for smart home control.
- **Wallbox**: Embeds the configured EVCC view for electric vehicle charging information.
- **Kamera**: Shows the configured UniFi Protect camera streams.

## Home Screen

The Home screen is the default view; the Quarkus backend owns Microsoft accounts and synchronization. Anonymous startup shows a Keycloak sign-in popup, which can be dismissed for read-only viewing. Account/source setup and PIN commands require the `dashboard` client's `admin` role.

On mobile, `/home` and `/calendar` show the calendar at full height, while `/gallery` shows the photo gallery at full height. The bottom navigation switches between these dedicated pages. At 640px and above, all three routes show the unified calendar and gallery layout with a single Home navigation button. Read-only views remain public; Setup uses the administrator guard.

- The calendar column shows events from the configured calendars for the next few days.
- Compact day headers highlight today; all-day and timed events stay together without nested day cards.
- Calendar selection and colors are managed in the protected backend setup view.
- The gallery column displays photos from configured OneDrive folders.
- Memory tiles show same-day photos from previous years. The photo grid uses two columns on mobile and smaller tablets, and three on larger screens.
- Metadata and thumbnails are synchronized on the server. Originals are downloaded and cached there on demand; camera-motion snapshots are also stored in the backend media directory.
- Backend GraphQL notifications refresh the gallery and agenda. The gallery requests server-paged images as you scroll.
- Detail view opens a larger image viewer for an individual photo or a same-day memory group.

### OpenHAB Screen

The OpenHAB screen displays a predefined openHAB Basic UI sitemap. This is the main OpenHAB feature of the dashboard: users can operate the configured smart home controls directly inside the tablet interface without leaving the dashboard.

The embedded sitemap URL is configured in the selected environment config under `openhab.sitemap`.

## Wallbox Screen

The Wallbox screen embeds the configured EVCC UI so charging information is available directly from the tablet dashboard.

The embedded EVCC URL is configured in the selected environment config under `evcc.url`.

## Camera Screen

The camera screen shows UniFi Protect streams through a local WebRTC integration. Use [go2rtc](https://github.com/AlexxIT/go2rtc/) as the WebRTC streaming backend.

- Supported cameras are configured in the selected environment config under `protect.cameras`.
- Use the camera screen controls to move to the next or previous pinned camera.
- The selected camera is mirrored in the URL query string, for example `?camera=entry`.
- Streams are started with a short delay between cameras to reduce load on the streaming backend.
- Streams stop when the tablet screen turns off and restart when it turns on again.

The backend derives regular and smart motion items from every configured camera ID by uppercasing its first character and appending `_Camera_Motion` or `_Camera_SmartMotion`. For example, `entry` registers `Entry_Camera_Motion` and `Entry_Camera_SmartMotion`. It processes live transitions, captures and stores snapshots, and sends a camera-selection action to connected clients. Initial ON states and repeated ON motion updates do not trigger captures. The frontend only wakes the tablet and navigates to the requested camera; it does not connect to openHAB item events.

The backend groups recent detections from all cameras into 30-second windows starting with each window's first capture and retains the newest 20 groups. Each window shows its latest smart snapshot when available, otherwise its latest regular snapshot. Opening a window shows all its images chronologically in the full-screen gallery, starting with the preferred image. Images and metadata persist under `<dashboard.media-directory>/protect/` and are shared by all clients; capture continues when no browser is open. The browser only renders GraphQL groups and backend media URLs, without IndexedDB snapshot storage.


## Tablet/Kiosk Behavior

The dashboard is intended to run on a wall tablet in fullscreen mode. Use [Fully Kiosk Browser](https://www.fully-kiosk.com/) to launch the dashboard as the tablet start URL and keep it running as a fullscreen smart home display.

- The app detects screen visibility changes and avoids unnecessary refresh/stream work while hidden.
- The deploy script can also ask the Fully Kiosk device to clear cache, reload the start URL, and turn the screen on after deployment.

## Configuration

Angular requests runtime configuration from the backend at `GET /api/config` before application startup. Configuration files belong to the backend and are not copied into frontend builds.

From the frontend directory, create the backend's production configuration from its sample:

```powershell
New-Item -ItemType Directory -Force ../server/config
Copy-Item ../server/examples/config.sample.json ../server/config/config.json
```

For local development, backend dev tasks create missing backend config files and the UI proxy config automatically without overwriting existing settings. To prepare them without starting the backend, run from the frontend directory:

```powershell
../server/gradlew.bat -p ../server prepareDevConfig
```

The dev tasks load `dev/config/application.properties`, which selects `dev/config/config.json`; production uses `config/config.json`. Paths resolve relative to the backend's working directory. Set `DASHBOARD_UI_CONFIG_FILE` to override the JSON path. Edit the generated files for your installation. `npm start` proxies `/api/config` to the running backend; `npm run build` and `npm run deploy` do not use the development proxy config.

The JSON contains only public smart-home integration URLs and camera settings. The endpoint is accessible before login; never include credentials. Microsoft credentials, source selection, and token caches belong to protected backend services. Local files are ignored by Git; keep publishable defaults in `server/examples/config.sample.json`. Edit the backend file and reload the browser to pick up changes without rebuilding.

Example structure:

```json
{
	"openhab": {
		"sitemap": "https://openhab.home.arpa/basicui/app",
		"items": {
			"security": "Security",
			"pin": "Security_Pin",
			"doorbell": "Entrance_Bell_Switch"
		},
		"doorbellCamera": "entry"
	},
	"evcc": {
		"url": "https://evcc.home.arpa"
	},
	"protect": {
		"cameras": {
			"entry": "Eingang",
			"garden": "Garten",
			"patio": "Terrasse"
		}
	}
}
```

### Microsoft Graph Setup

Configure the sibling Quarkus backend with PostgreSQL, Microsoft app credentials, a token-cache encryption key, and callback URLs. Dashboard authentication uses your Keycloak realm, for example `https://login.home.arpa/realms/dashboard`, public client `dashboard`, and client role `admin`; see [Keycloak setup](../server/README.md#keycloak-authentication). The sign-in popup redirects to Keycloak using Authorization Code Flow with PKCE `S256`. Access and refresh tokens stay in memory, never in localStorage or sessionStorage. Silent SSO restores authentication after reload where browser privacy settings permit; otherwise sign in interactively again. Logout redirects to Keycloak. Connect each owner's Microsoft account and select calendars/folders in `/setup`; the browser never receives Microsoft tokens or runs OneDrive synchronization.

### openHAB Setup

Set `openhab.sitemap` in the selected environment config to the openHAB Basic UI sitemap URL that should be embedded on the OpenHAB screen. The URL must be reachable from the tablet browser.

Set `openhab.items.security`, `openhab.items.pin`, and `openhab.items.doorbell` to the corresponding openHAB item names. The backend uses these names for initial state requests, upstream event handling, and PIN commands. Set `openhab.doorbellCamera` to a camera ID present in `protect.cameras`; this camera is selected when the doorbell rings, regardless of camera ordering. Restart the backend after changing item or camera mappings.

### EVCC Setup

Set `evcc.url` in the selected environment config to the EVCC UI URL that should be embedded on the Wallbox screen. The URL must be reachable from the tablet browser.

### Camera Setup

Set `protect.cameras` to an object mapping UniFi Protect camera IDs to display labels, such as `{ "entry": "Eingang", "garden": "Garten", "patio": "Terrasse" }`. Property order controls display order. Labels appear on live cameras and motion snapshots, including tooltips. Camera IDs, not labels, determine stream names, query parameters, and derived openHAB motion item names. Stored detections from an unconfigured camera display its ID as a fallback.

The WebRTC stream names are generated from each configured camera name:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure go2rtc exposes matching stream names.

### Backend/Proxy Paths

The Quarkus backend owns the openHAB and go2rtc integration routes through Vert.x HTTP/WebSocket forwarding. Production Quinoa builds serve Angular and SPA deep links from the backend. Keep the outer HTTPS reverse proxy forwarding requests unchanged to Quarkus, with WebSocket support; no integration-specific proxy rewrites or credential headers are needed.

All dashboard backend calls use `/api`. In development, `src/proxy/proxy.dev.json` forwards that namespace to Quarkus, not directly to openHAB or go2rtc. `prepareDevConfig` creates this ignored local file from `src/proxy/proxy.dev.sample.json` only when it does not exist. The development proxy configuration is:

```json
{
	"/api/**": {
		"target": "http://localhost:8080",
		"ws": true
	}
}
```

Restart `npm start` after changing the proxy file. Angular still serves SPA navigation, assets, and development hot reload; unknown backend API routes return HTTP 404 rather than the SPA page. The browser uses one origin, normally `http://localhost:4200`, for both UI and APIs. Preserve the browser-facing host in proxy requests; do not enable `changeOrigin`. No separate origin configuration or application-specific request header is needed.

Expected paths:

- `/api/config`: public backend-owned runtime UI settings.
- `/api/graphql`: backend queries, PIN commands, and `dashboardChanged`/`dashboardAction` subscriptions, preserving `graphql-transport-ws`.
- `/api/accounts*`, `/api/media/*`: same-origin bearer-protected setup and public binary images. Microsoft callback GET relays to the UI, which completes linking with an authenticated POST.
- `/api/openhab/*`: available backend proxy for openHAB REST requests; dashboard item handling uses the backend service instead.
- `/api/ws/openhab`: available backend WebSocket bridge; dashboard item events and commands no longer use it from the browser.
- `/api/media/protect/{id}`: stored motion snapshots from the backend media directory.
- `/api/webrtc/*`: backend HTTP proxy for go2rtc, including `frame.jpeg?src=unifi_<cameraId>` snapshots.
- `/api/ws/webrtc?src=unifi_<cameraId>`: backend WebSocket bridge for camera signaling.

The integration proxy accepts WebSocket upgrades only on the exact `/api/ws/openhab` and `/api/ws/webrtc` paths; its `/api/openhab/*` and `/api/webrtc/*` routes are HTTP-only. GraphQL also supports subscriptions at `/api/graphql`. The backend automatically rejects cross-origin browser API requests using standard browser metadata. Read-only camera data remains public. Upstream HTTP writes and the openHAB WebSocket bridge require an admin bearer token; the UI uses the protected GraphQL PIN mutation rather than that bridge. The interceptor attaches tokens only to same-origin account-management and GraphQL requests, never to upstream integrations or third-party URLs.

Configure `dashboard.proxy.openhab-url`, `dashboard.proxy.openhab-token`, and `dashboard.proxy.go2rtc-url` in the backend's protected runtime properties, or use `DASHBOARD_OPENHAB_URL`, `DASHBOARD_OPENHAB_TOKEN`, and `DASHBOARD_GO2RTC_URL`. Do not put upstream credentials in public `/api/config` JSON or the frontend proxy file. The backend authenticates openHAB REST and WebSockets with the same private token and strips go2rtc's upstream `Origin` header. Missing upstream settings return HTTP 503. See [the backend proxy reference](../server/README.md#smart-home-proxy) for configuration, deployment, and troubleshooting.

Camera media still uses go2rtc's advertised WebRTC network candidates; signaling through the backend does not replace media connectivity or ICE/TURN configuration. The embedded openHAB sitemap and EVCC URLs remain directly browser-accessible pages outside these integration routes.

For the embedded production UI, configure the HTTPS reverse proxy for `dashboard.home.arpa` with a certificate trusted by viewing devices. Forward all requests unchanged to the Quarkus backend, normally `http://127.0.0.1:8080` on the same machine, and support WebSocket upgrades with suitable idle timeouts.

## Developer Documentation

### Prerequisites

- Node.js/npm compatible with the package manager recorded in `package.json`.
- Angular CLI, usually through `npm run ng` or `npx ng`.
- A configured Quarkus backend for OIDC token validation and synchronized Microsoft data.
- Keycloak client redirect URIs for `/auth/callback` and `/silent-check-sso.html`, post-logout `/home`, and the exact frontend web origin, including `http://localhost:4200` for development. Access tokens must include audience `dashboard` and the `admin` client role for administrators.
- A trusted HTTPS reverse proxy for production. Integration forwarding is provided by Quarkus.
- go2rtc for WebRTC camera streaming.
- An openHAB Basic UI sitemap URL that the tablet can reach.
- Fully Kiosk Browser for running the dashboard fullscreen on the wall tablet.
- PowerShell remoting if you use the included deployment script.

### Install and Run

```powershell
npm install
../server/gradlew.bat -p ../server prepareDevConfig
npm start
```

The development server uses `src/proxy/proxy.dev.json` by default. All `target` values should point to the Quarkus backend. Configure actual openHAB/go2rtc addresses and the openHAB token in `../server/dev/config/application.properties` or through backend environment variables. No separate local reverse proxy is required. The local proxy config is ignored by Git; keep publishable defaults in `src/proxy/proxy.dev.sample.json`.

### Build

All dashboard REST calls use generated OpenAPI service classes and models: configuration, account setup/synchronization, photo blobs, motion snapshots, and camera poster frames. Do not add handwritten REST calls or invoke generated functions directly from consumers. The authoritative, editable contract is the repository-root `../openapi.yaml`; both backend interfaces/models and frontend services/models are generated from it. Keycloak's adapter owns OIDC requests; GraphQL transport and WebSocket signaling remain separate.

After editing the contract, regenerate the frontend from this directory:

```powershell
npm run gen:api
```

This also runs automatically before `npm start` and `npm run build`. No backend build or running server is required. The backend generates its own sources automatically during Java compilation, or explicitly with `../server/gradlew.bat -p ../server genApi`. Do not edit generated sources.

```powershell
npm run build
```

The production build is written to `dist/Dashboard/browser`.

There is currently no frontend test runner configured. Standalone and Quinoa-embedded production builds both use `/` as the base href and serve the UI from root. The frontend deployment script does not deploy the backend.

### Format

```powershell
npm run prettier
```

This formats TypeScript, JavaScript, CSS, and HTML files with Prettier and the Tailwind CSS plugin.

### Deployment

Copy the deployment sample and edit it for your server and Fully Kiosk device:

```powershell
Copy-Item scripts/config.sample.json scripts/config.json
```

Then deploy:

```powershell
npm run deploy
```

The deploy script:

- builds the Angular app;
- opens a PowerShell remoting session to the configured host;
- clears the configured remote destination directory;
- copies the built files to that directory;
- asks Fully Kiosk to clear cache, reload the start URL, and turn the screen on.

`scripts/config.json` contains machine-specific values and should not be shared with secrets intact.

### Project Structure

```text
src/app/feature-home       Home screen, calendar, and OneDrive gallery
src/app/feature-openhab    Embedded openHAB Basic UI sitemap screen
src/app/feature-evcc       EVCC wallbox screen
src/app/feature-protect    UniFi Protect camera screen and WebRTC streaming
src/app/feature-config     Runtime configuration model and service
src/app/image-viewer       Shared fullscreen image viewer, image model, and blob directive
src/app/backend           GraphQL DTOs, subscriptions, and Keycloak authentication
src/app/feature-setup      Admin login and protected Microsoft account/source setup
src/app/feature-home/calendar  Calendar display model and backend service
src/app/feature-home/gallery   Gallery display model and backend image service
src/app/utils              Shared visibility, layout, date, debug, and WebSocket helpers
../server/config           Backend-owned runtime configuration and public sample
src/proxy                  Angular development proxy configuration and sample
scripts                   Deployment configuration and PowerShell deploy script
```

### Architecture Notes

- `src/main.ts` requests `/api/config` from the backend before application startup; there are no MSAL providers or Microsoft HTTP interceptors.
- The backend projects the runtime JSON into `AppConfig`: `sitemapUrl`, `evccUrl`, and ordered `cameras`. Backend-only item mappings are not sent to the frontend.
- Home, Calendar, and Gallery support read-only access after dismissing the sign-in popup; Setup and PIN commands require the `dashboard` client role `admin`.
- `Openhab` embeds the `sitemapUrl` URL from runtime configuration as the OpenHAB screen.
- `OpenHABService` executes backend camera actions and displays security state; item parsing, state transitions, and PIN forwarding run in Quarkus.
- `MotionService` renders server-grouped motion snapshots and refreshes on backend notifications; capture and persistence run in Quarkus.
- `Evcc` embeds the `evccUrl` URL from runtime configuration as the Wallbox screen.
- `ImageService` reads server-paged GraphQL metadata and grouped moments, then fetches authenticated backend media as blobs.
- `ImageService` converts backend image metadata into the provider-independent `ViewerImage` model shared by the gallery and fullscreen viewer. Protect uses the same model for motion snapshots.
- `CalendarService` displays the server-grouped agenda. Filtering, grouping, sorting, sync, and source persistence happen in Quarkus.
- `Protect` reads the camera list from `cameras` and passes configured camera IDs to `WebRTCService`.
- `WebRTCService` owns camera stream lifecycle and reacts to screen visibility events to stop or restart streams.

### Adding or Changing Cameras

Camera IDs and labels are configured in the selected environment config under `protect.cameras`. To add, remove, rename, or reorder cameras, update that object and make sure go2rtc has matching stream names. The backend registers openHAB motion items automatically for each camera using the naming convention described above. Update `openhab.doorbellCamera` if the doorbell's assigned camera changes, then restart the backend.

The WebRTC stream names are generated as:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure the backend exposes matching stream names.

### Changing the openHAB Sitemap

The OpenHAB screen is implemented as an iframe in `src/app/feature-openhab/openhab.html`. Change `openhab.sitemap` in the selected environment config when moving to another openHAB host, sitemap, or Basic UI path.

### Changing the EVCC URL

The Wallbox screen is implemented as an iframe in `src/app/feature-evcc/evcc.html`. Change `evcc.url` in the selected environment config when moving to another EVCC host or path.

### Common Troubleshooting

- **Sign-in fails**: verify Keycloak reachability, public client `dashboard`, PKCE, redirect/web-origin allowlists, audience `dashboard`, and the `admin` client role. Local users and session endpoints are no longer used.
- **Calendars missing**: open Setup as admin, discover and enable the intended sources, then inspect account synchronization status.
- **Gallery folders missing**: verify the selected server-side folder path is relative to the owner's drive root and accessible to that connected account.
- **OpenHAB screen is blank**: verify `openhab.sitemap` in the selected environment config is reachable from the tablet and that the configured sitemap is available in openHAB Basic UI.
- **Wallbox screen is blank**: verify `evcc.url` in the selected environment config is reachable from the tablet and allows embedding in an iframe.
- **Camera stream does not start**: verify `protect.cameras`, the backend's `DASHBOARD_GO2RTC_URL`, `/api/ws/webrtc` WebSocket connectivity, and matching `unifi_*` streams in go2rtc. If signaling succeeds, check WebRTC media/ICE connectivity separately.
- **Tablet does not wake or reload after deploy**: verify the Fully Kiosk URL and password in `scripts/config.json`.
