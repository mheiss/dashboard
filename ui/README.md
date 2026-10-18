# Smart Home Dashboard

An Angular dashboard for a wall-mounted smart home tablet. It combines family calendar data, a OneDrive photo gallery, a predefined openHAB sitemap, EVCC wallbox information, and UniFi Protect camera streams in one touch-friendly interface.

The app is designed for an always-on display in the living room. It keeps the main flows large and simple, embeds the existing openHAB controls, and pauses camera/gallery work when the tablet screen is off.

## Main Screens

On tablets and larger screens, the dashboard has up to four primary sections in the navigation bar, depending on the configured integrations. On mobile (below 640px), Home is replaced by separate Kalender and Galerie buttons.

- **Home**: Shows the configured Microsoft calendars next to a OneDrive photo gallery.
- **OpenHAB**: Displays the predefined openHAB sitemap for smart home control.
- **Wallbox**: Embeds the configured EVCC view for electric vehicle charging information.
- **Kamera**: Shows the configured UniFi Protect camera streams.

On both layouts, OpenHAB (`/openhab`) is hidden when `dashboard.openhab.sitemap` is empty or whitespace-only, and Wallbox (`/evcc`) is hidden when `dashboard.evcc.url` is empty or whitespace-only. Kamera (`/protect`) is hidden when no `dashboard.protect.cameras[n]` entries are configured. Restart the backend and reload the browser after changing configuration. These rules affect navigation links only; routes and authorization are unchanged. Einstellungen remains available for account setup.

## Home Screen

The Home screen is the default view; the Quarkus backend owns Microsoft accounts and synchronization. Public views are available without a sign-in prompt or authentication redirect. Account/source setup requires the `dashboard` client's `admin` role and shows a Keycloak sign-in popup when needed.

On mobile, `/home` and `/calendar` show the calendar at full height, while `/gallery` shows the photo gallery at full height. The bottom navigation switches between these dedicated pages. At 640px and above, all three routes show the unified calendar and gallery layout with a single Home navigation button. Read-only views remain public; Setup uses the administrator guard.

- The calendar column shows events from the configured calendars for the next few days.
- Compact day headers highlight today; all-day and timed events stay together without nested day cards.
- Calendar selection and colors are managed in the protected backend setup view.
- The gallery column displays photos from configured OneDrive folders.
- Memory tiles show same-day photos from previous years. The photo grid uses two columns on mobile and smaller tablets, and three on larger screens.
- Metadata and thumbnails are synchronized on the server. Originals are downloaded and cached there on demand; camera-motion snapshots are also stored in the backend media directory.
- Backend GraphQL notifications refresh the gallery and agenda. The gallery requests server-paged images as you scroll.
- Detail view opens a larger image viewer for an individual photo or a same-day memory group.

## OpenHAB Screen

The OpenHAB screen displays a predefined openHAB Basic UI sitemap. This is the main OpenHAB feature of the dashboard: users can operate the configured smart home controls directly inside the tablet interface without leaving the dashboard.

The embedded sitemap URL is configured in backend properties as `dashboard.openhab.sitemap`.

## Wallbox Screen

The Wallbox screen embeds the configured EVCC UI so charging information is available directly from the tablet dashboard.

The embedded EVCC URL is configured in backend properties as `dashboard.evcc.url`.

## Camera Screen

The camera screen shows UniFi Protect streams through a local WebRTC integration. Use [go2rtc](https://github.com/AlexxIT/go2rtc/) as the WebRTC streaming backend.

- Supported cameras are configured in backend properties as `dashboard.protect.cameras[n].id` and `.label`.
- Use the camera screen controls to move to the next or previous pinned camera.
- The selected camera is mirrored in the URL query string, for example `?camera=entry`.
- Streams are started with a short delay between cameras to reduce load on the streaming backend.
- Streams stop when the tablet screen turns off and restart when it turns on again.

The backend derives regular and smart motion items from every configured camera ID by uppercasing its first character and appending `_Camera_Motion` or `_Camera_SmartMotion`. For example, `entry` registers `Entry_Camera_Motion` and `Entry_Camera_SmartMotion`. It processes live transitions, captures and stores snapshots, and sends a camera-selection action to connected clients. Initial ON states and repeated ON motion updates do not trigger captures. The frontend only wakes the tablet and navigates to the requested camera; it does not connect to openHAB item events.

The backend groups recent detections from all cameras into 30-second windows starting with each window's first capture and retains the newest 20 groups. Each window shows its latest smart snapshot when available, otherwise its latest regular snapshot. Opening a window shows all its images chronologically in the full-screen gallery, starting with the preferred image. Images and metadata persist under `<dashboard.media-directory>/protect/` and are shared by all clients; capture continues when no browser is open. The browser renders GraphQL groups and backend media URLs.

## Tablet/Kiosk Behavior

The dashboard is intended to run on a wall tablet in fullscreen mode. Use [Fully Kiosk Browser](https://www.fully-kiosk.com/) to launch the dashboard as the tablet start URL and keep it running as a fullscreen smart home display.

- The app detects screen visibility changes and avoids unnecessary refresh/stream work while hidden.

## Configuration

Angular requests runtime configuration from the backend at `GET /api/config` before application startup. All application settings belong to the backend's private `application.properties` file and are not copied into frontend builds. The endpoint exposes only public view URLs, camera IDs/labels, and Keycloak connection settings, never credentials or item mappings.

For a first production setup only, create the backend's configuration from its sample, running from the frontend directory. Do not overwrite an existing properties file:

```powershell
New-Item -ItemType Directory -Force ../server/config
Copy-Item ../config/application.properties.sample ../server/config/application.properties
```

For local development, backend dev tasks create missing backend config files and the UI proxy config automatically without overwriting existing settings. To prepare them without starting the backend, run from the frontend directory:

```powershell
../server/gradlew.bat -p ../server prepareDevConfig
```

The dev tasks load the backend's `dev/config/application.properties`; production defaults to `config/application.properties` relative to Java's working directory. Use `quarkus.config.locations` to select another properties file. Edit the generated file for your installation. `npm start` proxies `/api/config` to the running backend; `npm run build` does not use the development proxy config.

The same private properties file contains smart-home view URLs, camera settings, backend item mappings, and authentication credentials. Microsoft source selections and token caches are stored by backend services. Local files are ignored by Git; keep publishable defaults in the repository-root `config/application.properties.sample` and `config/application-dev.properties.sample`. Restart the backend after changing properties, then reload the browser. No frontend rebuild is needed.

Example properties:

```properties
dashboard.openhab.sitemap=https://openhab.home.arpa/basicui/app
dashboard.openhab.items.security=Security
dashboard.openhab.items.doorbell=Entrance_Bell_Switch
dashboard.openhab.doorbell-camera=entry
dashboard.evcc.url=https://evcc.home.arpa
dashboard.protect.cameras[0].id=entry
dashboard.protect.cameras[0].label=Eingang
dashboard.protect.cameras[1].id=garden
dashboard.protect.cameras[1].label=Garten
dashboard.protect.cameras[2].id=patio
dashboard.protect.cameras[2].label=Terrasse
```

### Microsoft Graph Setup

Configure the sibling Quarkus backend with PostgreSQL, Microsoft app credentials, a token-cache encryption key, and callback URLs. Dashboard authentication uses your Keycloak realm, for example `https://login.home.arpa/realms/dashboard`, public client `dashboard`, and client role `admin`; see [Keycloak setup](../server/README.md#keycloak-authentication). The sign-in popup redirects to Keycloak using Authorization Code Flow with PKCE `S256`. Access and refresh tokens stay in memory, never in localStorage or sessionStorage. Normal page loads do not check SSO. After returning from Microsoft account linking, the app temporarily keeps the callback code/state in sessionStorage and automatically restores the existing Keycloak session through a top-level redirect before completing the connection. No hidden iframe is used. Logout redirects to Keycloak. Connect each owner's Microsoft account and select calendars/folders in `/setup`; the browser never receives Microsoft tokens or runs OneDrive synchronization.

The frontend loads its Keycloak server URL, realm, and client ID from the existing `/api/config` response before constructing the adapter. Set `quarkus.oidc.auth-server-url=https://login.home.arpa/realms/dashboard` and `quarkus.oidc.client-id=dashboard` in backend properties. Restart the backend and reload the browser after changes; no frontend rebuild is needed. Access tokens and private client secrets are never part of the configuration response.

### openHAB Setup

Set `dashboard.openhab.sitemap` in backend properties to the openHAB Basic UI sitemap URL that should be embedded on the OpenHAB screen. The URL must be reachable from the tablet browser and allow iframe embedding.

Set `dashboard.openhab.items.security` and `dashboard.openhab.items.doorbell` to the corresponding openHAB item names. The backend uses these names for initial state requests and upstream event handling. Set `dashboard.openhab.doorbell-camera` to a configured camera ID; this camera is selected when the doorbell rings, regardless of camera ordering. Restart the backend after changing settings.

### EVCC Setup

Set `dashboard.evcc.url` in backend properties to the EVCC UI URL that should be embedded on the Wallbox screen. The URL must be reachable from the tablet browser and allow iframe embedding.

### Camera Setup

Configure `dashboard.protect.cameras[n].id` and `dashboard.protect.cameras[n].label` in backend properties, starting at index zero. Indices control display order, and IDs must be unique. Labels appear on live cameras and motion snapshots, including tooltips. Camera IDs, not labels, determine stream names, query parameters, and derived openHAB motion item names. Stored detections from an unconfigured camera display its ID as a fallback.

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
- `/api/graphql`: backend queries and `dashboardChanged`/`dashboardAction` subscriptions, preserving `graphql-transport-ws`.
- `/api/accounts*`, `/api/media/*`: same-origin bearer-protected setup and public binary images. Microsoft callback GET relays to the UI, which completes linking with an authenticated POST.
- `/api/openhab/*`: available backend proxy for openHAB REST requests; dashboard item handling uses the backend service instead.
- `/api/ws/openhab`: admin-only backend WebSocket bridge; the dashboard receives item actions through GraphQL.
- `/api/media/protect/{id}`: stored motion snapshots from the backend media directory.
- `/api/webrtc/*`: backend HTTP proxy for go2rtc, including `frame.jpeg?src=unifi_<cameraId>` snapshots.
- `/api/ws/webrtc?src=unifi_<cameraId>`: backend WebSocket bridge for camera signaling.

The integration proxy accepts WebSocket upgrades only on the exact `/api/ws/openhab` and `/api/ws/webrtc` paths; its `/api/openhab/*` and `/api/webrtc/*` routes are HTTP-only. GraphQL also supports subscriptions at `/api/graphql`. The backend automatically rejects cross-origin browser API requests using standard browser metadata. Read-only camera data remains public. Arbitrary upstream HTTP writes and the openHAB WebSocket bridge require an admin bearer token. The interceptor attaches available tokens only to same-origin account-management and GraphQL requests, never to upstream integrations or third-party URLs.

Configure `dashboard.proxy.openhab-url`, `dashboard.proxy.openhab-token`, and `dashboard.proxy.go2rtc-url` in the backend's protected runtime properties, or use `DASHBOARD_OPENHAB_URL`, `DASHBOARD_OPENHAB_TOKEN`, and `DASHBOARD_GO2RTC_URL`. Do not put upstream credentials in public `/api/config` JSON or the frontend proxy file. The backend authenticates openHAB REST and WebSockets with the same private token and strips go2rtc's upstream `Origin` header. Missing upstream settings return HTTP 503. See [the backend proxy reference](../server/README.md#smart-home-proxy) for configuration, deployment, and troubleshooting.

Camera media still uses go2rtc's advertised WebRTC network candidates; signaling through the backend does not replace media connectivity or ICE/TURN configuration. The embedded openHAB sitemap and EVCC URLs remain directly browser-accessible pages outside these integration routes.

For the embedded production UI, configure the HTTPS reverse proxy for `dashboard.home.arpa` with a certificate trusted by viewing devices. Forward all requests unchanged to the Quarkus backend, normally `http://127.0.0.1:8080` on the same machine, and support WebSocket upgrades with suitable idle timeouts.

## Developer Documentation

### Prerequisites

- Node.js/npm compatible with the package manager recorded in `package.json`.
- Angular CLI, usually through `npm run ng` or `npx ng`.
- A configured Quarkus backend for OIDC token validation and synchronized Microsoft data.
- Keycloak client redirect URI `/auth/callback`, post-logout `/home`, and the exact frontend web origin, including `http://localhost:4200` for development. Access tokens must include audience `dashboard` and the `admin` client role for administrators.
- A trusted HTTPS reverse proxy for production. Integration forwarding is provided by Quarkus.
- Optional: go2rtc for WebRTC camera streaming.
- Optional: an openHAB Basic UI sitemap URL that the tablet can reach, and an EVCC URL for the Wallbox view.
- Fully Kiosk Browser for running the dashboard fullscreen on the wall tablet.

### Install And Run

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

There is no frontend test runner configured. Standalone and Quinoa-embedded production builds both use `/` as the base href and serve the UI from root.

### Format

```powershell
npm run prettier
```

This formats TypeScript, JavaScript, CSS, and HTML files with Prettier and the Tailwind CSS plugin.

### Deployment

The standard deployment packages Angular with Quarkus. Follow the [Linux installation guide](../README.md#linux-setup) for service, database, storage, and HTTPS configuration.

To host the frontend separately, run `npm run build` and serve the contents of `dist/Dashboard/browser` from the HTTP root. Configure SPA fallback for UI routes, and forward `/api/**` unchanged to Quarkus with WebSocket support. Unknown API routes must retain their backend response rather than falling back to `index.html`.

Configure Fully Kiosk Browser to open the deployed dashboard URL. Manage device reloads through Fully Kiosk's own controls.

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
../config                  Committed backend configuration templates
../server/dev/config       Local backend development configuration
../server/config           Optional local backend production configuration
src/proxy                  Angular development proxy configuration and sample
```

### Architecture Notes

- `src/main.ts` loads `/api/config` once, then initializes the Keycloak adapter before application startup.
- The backend projects runtime properties into `AppConfig`: `sitemapUrl`, `evccUrl`, and ordered `cameras`, plus `keycloak` settings derived from its OIDC properties. Backend-only item mappings and credentials are not sent to the frontend.
- Home, Calendar, and Gallery support public read-only access. Setup requires the `dashboard` client role `admin`.
- `Openhab` embeds the `sitemapUrl` URL from runtime configuration as the OpenHAB screen.
- `OpenHABService` executes backend camera actions and displays security state; item parsing and state transitions run in Quarkus.
- `MotionService` renders server-grouped motion snapshots and refreshes on backend notifications; capture and persistence run in Quarkus.
- `Evcc` embeds the `evccUrl` URL from runtime configuration as the Wallbox screen.
- `ImageService` reads server-paged GraphQL metadata and grouped moments, then fetches public backend media as blobs.
- `ImageService` converts backend image metadata into the provider-independent `ViewerImage` model shared by the gallery and fullscreen viewer. Protect uses the same model for motion snapshots.
- `CalendarService` displays the server-grouped agenda. Filtering, grouping, sorting, sync, and source persistence happen in Quarkus.
- `Protect` reads the camera list from `cameras` and passes configured camera IDs to `WebRTCService`.
- `WebRTCService` owns camera stream lifecycle and reacts to screen visibility events to stop or restart streams.

### Adding or Changing Cameras

Camera IDs and labels are configured in backend properties under `dashboard.protect.cameras[n]`. To add, remove, rename, or reorder cameras, update the indexed entries and make sure go2rtc has matching stream names. The backend registers openHAB motion items automatically for each camera using the naming convention described above. Update `dashboard.openhab.doorbell-camera` if the doorbell's assigned camera changes, then restart the backend and reload the browser.

The WebRTC stream names are generated as:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure go2rtc exposes matching stream names.

### Changing the openHAB Sitemap

The OpenHAB screen is implemented as an iframe in `src/app/feature-openhab/openhab.html`. Change `dashboard.openhab.sitemap` in backend properties to select the openHAB host, sitemap, or Basic UI path, then restart the backend and reload the browser.

### Changing the EVCC URL

The Wallbox screen is implemented as an iframe in `src/app/feature-evcc/evcc.html`. Change `dashboard.evcc.url` in backend properties to select the EVCC host and path, then restart the backend and reload the browser.

### Common Troubleshooting

- **Sign-in fails**: verify Keycloak reachability, public client `dashboard`, PKCE, redirect/web-origin allowlists, audience `dashboard`, and the `admin` client role.
- **Calendars missing**: open Setup as admin, discover and enable the intended sources, then inspect account synchronization status.
- **Gallery folders missing**: verify the selected server-side folder path is relative to the owner's drive root and accessible to that connected account.
- **OpenHAB screen is blank**: verify `dashboard.openhab.sitemap` in backend properties is reachable from the tablet and that the configured sitemap is available in openHAB Basic UI.
- **Wallbox screen is blank**: verify `dashboard.evcc.url` in backend properties is reachable from the tablet and allows embedding in an iframe.
- **Camera stream does not start**: verify `dashboard.protect.cameras[n]`, the backend's `DASHBOARD_GO2RTC_URL`, `/api/ws/webrtc` WebSocket connectivity, and matching `unifi_*` streams in go2rtc. If signaling succeeds, check WebRTC media/ICE connectivity separately.
- **Tablet does not wake**: verify the Fully Kiosk device configuration and dashboard screen-visibility events.
