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

The Home screen is the default landing page and requires no login; the Quarkus backend owns Microsoft accounts and synchronization. Account/source setup requires the local admin login.

On mobile, `/home` and `/calendar` show the calendar at full height, while `/gallery` shows the photo gallery at full height. The bottom navigation switches between these dedicated pages. At 640px and above, all three routes show the unified calendar and gallery layout with a single Home navigation button. All three routes use the local session guard.

- The calendar column shows events from the configured calendars for the next few days.
- Compact day headers highlight today; all-day and timed events stay together without nested day cards.
- Calendar selection and colors are managed in the protected backend setup view.
- The gallery column displays photos from configured OneDrive folders.
- Memory tiles show same-day photos from previous years. The photo grid uses two columns on mobile and smaller tablets, and three on larger screens.
- Metadata and thumbnails are synchronized on the server. Originals are downloaded and cached there on demand; the existing camera-motion IndexedDB storage remains unchanged.
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

Regular and smart motion items are derived from every configured camera ID by uppercasing its first character and appending `_Camera_Motion` or `_Camera_SmartMotion`. For example, `entry` registers `Entry_Camera_Motion` and `Entry_Camera_SmartMotion`. They capture a fresh camera snapshot on an OFF-to-ON transition, wake the tablet, and select that camera. Initial ON states and repeated ON updates do not trigger captures.

The recent-detections filmstrip groups all cameras into 30-second windows starting with each window's first capture. Each window shows its latest smart snapshot when available, otherwise its latest regular snapshot. Opening a window shows all its images chronologically in the full-screen gallery, starting with the preferred image.


## Tablet/Kiosk Behavior

The dashboard is intended to run on a wall tablet in fullscreen mode. Use [Fully Kiosk Browser](https://www.fully-kiosk.com/) to launch the dashboard as the tablet start URL and keep it running as a fullscreen smart home display.

- The app detects screen visibility changes and avoids unnecessary refresh/stream work while hidden.
- The deploy script can also ask the Fully Kiosk device to clear cache, reload the start URL, and turn the screen on after deployment.

## Configuration

Angular requests runtime configuration from the backend at `GET /config` before application startup. Configuration files belong to the backend and are not copied into frontend builds.

From the frontend directory, create the backend's production configuration from its sample:

```powershell
New-Item -ItemType Directory -Force ../server/config
Copy-Item ../server/examples/config.sample.json ../server/config/config.json
```

For local development, both backend dev tasks create missing local config files automatically without overwriting existing settings. To prepare them without starting the backend, run from the frontend directory:

```powershell
../server/gradlew.bat -p ../server prepareDevConfig
```

The dev tasks load `dev/config/application.properties`, which selects `dev/config/config.json`; production uses `config/config.json`. Paths resolve relative to the backend's working directory. Set `DASHBOARD_UI_CONFIG_FILE` to override the JSON path. Edit the generated files for your installation. `npm start` proxies `/config` to the running backend; `npm run build` and `npm run deploy` need no UI configuration file.

The JSON contains only public smart-home integration URLs and camera settings. The endpoint is accessible before login; never include credentials. Microsoft credentials, source selection, and token caches belong to protected backend services. Local files are ignored by Git; keep publishable defaults in `server/examples/config.sample.json`. Edit the backend file and reload the browser to pick up changes without rebuilding.

Example structure:

```json
{
	"openhab": {
		"sitemap": "https://openhab.example.lan/basicui/app",
		"items": {
			"security": "Security",
			"pin": "Security_Pin",
			"doorbell": "Entrance_Bell_Switch"
		},
		"doorbellCamera": "entry"
	},
	"evcc": {
		"url": "https://evcc.example.lan"
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

Configure the sibling Quarkus backend with PostgreSQL, Microsoft app credentials, independent encryption keys, a local admin password, and callback URLs. See the backend README for registration and deployment details. Click the settings icon and enter the admin password in the popup, connect each owner's personal Microsoft account, and select calendars/folders in `/setup`. Viewing devices open `/home` without login; they do not receive Microsoft tokens or run OneDrive delta synchronization.

### openHAB Setup

Set `openhab.sitemap` in the selected environment config to the openHAB Basic UI sitemap URL that should be embedded on the OpenHAB screen. The URL must be reachable from the tablet browser.

Set `openhab.items.security`, `openhab.items.pin`, and `openhab.items.doorbell` to the corresponding openHAB item names. These names control initial state requests, WebSocket updates, and PIN commands. Set `openhab.doorbellCamera` to a camera ID present in `protect.cameras`; this camera is selected when the doorbell rings, regardless of camera ordering.

### EVCC Setup

Set `evcc.url` in the selected environment config to the EVCC UI URL that should be embedded on the Wallbox screen. The URL must be reachable from the tablet browser.

### Camera Setup

Set `protect.cameras` to an object mapping UniFi Protect camera IDs to display labels, such as `{ "entry": "Eingang", "garden": "Garten", "patio": "Terrasse" }`. Property order controls display order. Labels appear on live cameras and motion snapshots, including tooltips. Camera IDs, not labels, determine stream names, query parameters, and derived openHAB motion item names. Stored detections from an unconfigured camera display its ID as a fallback.

The WebRTC stream names are generated from each configured camera name:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure go2rtc exposes matching stream names.

### Backend/Proxy Paths

Use [Caddy](https://caddyserver.com/) as the production reverse proxy. Caddy should serve the built Angular files, route browser refreshes back to `index.html`, and expose the same-origin integration paths used by the dashboard.

In development, `src/proxy/proxy.dev.json` forwards these paths to the configured smart home backend.

Expected paths:

- `/config`: public backend-owned runtime UI settings.
- `/graphql`: backend queries and WebSocket subscriptions, preserving `graphql-transport-ws`.
- `/accounts*`, `/session*`, `/j_security_check`, `/media/*`: same-origin backend setup, sessions, and binary images.
- `/api/openhab/*`: proxies openHAB REST requests 
- `/ws/openhab*`: proxies openHAB WebSocket requests
- `/api/webrtc/*`: proxies WebRTC offers for camera streams.
- `/api/webrtc/ws`: signaling channel for camera streams.

Use [go2rtc](https://github.com/AlexxIT/go2rtc/) behind the `/api/webrtc*` route. Keep openHAB API tokens and other credentials out of committed documentation and configuration files.

Sample Caddyfile:

```caddyfile
# Refer to the Caddy docs for more information:
# https://caddyserver.com/docs/caddyfile
:8080 {
	@dashboardApi path /config /graphql /graphql/* /accounts /accounts/* /session /session/* /j_security_check /media/*
	handle @dashboardApi {
		reverse_proxy localhost:8081
	}

	# OpenHAB - WebSocket proxy
	handle_path /ws/openhab* {
		rewrite * /ws{path}
		reverse_proxy openhab.example.lan:8080 {
			header_up Sec-WebSocket-Protocol "org.openhab.ws.protocol.default, org.openhab.ws.accessToken.base64.<OPENHAB_ACCESS_TOKEN_BASE64>"
		}
	}

	# OpenHAB - REST proxy
	handle_path /api/openhab* {
		rewrite * /rest{path}
		reverse_proxy openhab.example.lan:8080 {
			header_up Authorization "<OPENHAB_API_TOKEN>"
		}
	}

	# go2rtc - HTTP API and WebSocket signaling
	handle_path /api/webrtc* {
		rewrite * /api{path}
		reverse_proxy localhost:1984 {
			header_up -Origin
		}
	}

	# Everything else -> SPA
	handle {
		root * /srv/dashboard
		file_server
		try_files {path} /index.html
	}

	log {
		output file /var/log/caddy/access.log
		format console
	}
}
```

## Developer Documentation

### Prerequisites

- Node.js/npm compatible with the package manager recorded in `package.json`.
- Angular CLI, usually through `npm run ng` or `npx ng`.
- A configured Quarkus backend for local sessions and synchronized Microsoft data.
- Caddy for serving the dashboard and reverse proxying integration paths.
- go2rtc for WebRTC camera streaming.
- An openHAB Basic UI sitemap URL that the tablet can reach.
- Fully Kiosk Browser for running the dashboard fullscreen on the wall tablet.
- PowerShell remoting if you use the included deployment script.

### Install and Run

```powershell
npm install
../server/gradlew.bat -p ../server prepareDevConfig
Copy-Item src/proxy/proxy.dev.sample.json src/proxy/proxy.dev.json
npm start
```

The development server uses `src/proxy/proxy.dev.json` by default. Update the `target` values in that local file for your backend before testing camera streaming or same-origin openHAB proxy paths. The local proxy config is ignored by Git; keep publishable defaults in `src/proxy/proxy.dev.sample.json`.

### Build

```powershell
npm run build
```

The production build is written to `dist/Dashboard/browser`.

Run `npm test` for the Angular/Vitest adapter tests. Standalone and Quinoa-embedded production builds both use `/` as the base href and serve the UI from root. The frontend deployment script does not deploy the backend.

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
src/app/backend           GraphQL DTOs, subscriptions, and local session guards
src/app/feature-setup      Admin login and protected Microsoft account/source setup
src/app/ms-graph           Thin calendar/gallery display adapters and retained motion storage
src/app/utils              Shared visibility, layout, date, debug, and WebSocket helpers
../server/config           Backend-owned runtime configuration and public sample
src/proxy                  Angular development proxy configuration and sample
scripts                   Deployment configuration and PowerShell deploy script
```

### Architecture Notes

- `src/main.ts` requests `/config` from the backend before application startup; there are no MSAL providers or Microsoft HTTP interceptors.
- Home, Calendar, and Gallery require a local session; Setup requires the admin role.
- `Openhab` embeds the `openhab.sitemap` URL from runtime configuration as the OpenHAB screen.
- `Evcc` embeds the `evcc.url` URL from runtime configuration as the Wallbox screen.
- `ImageService` reads server-paged GraphQL metadata and grouped moments, then fetches authenticated backend media as blobs.
- Home and Protect adapt their images to the provider-independent `ViewerImage` model for the shared fullscreen viewer.
- `CalendarService` displays the server-grouped agenda. Filtering, grouping, sorting, sync, and source persistence happen in Quarkus.
- `Protect` reads the camera list from `protect.cameras` and passes configured camera names to `WebRTCService`.
- `WebRTCService` owns camera stream lifecycle and reacts to screen visibility events to stop or restart streams.

### Adding or Changing Cameras

Camera IDs and labels are configured in the selected environment config under `protect.cameras`. To add, remove, rename, or reorder cameras, update that object and make sure go2rtc has matching stream names. OpenHAB motion items are registered automatically for each camera using the naming convention described above. Update `openhab.doorbellCamera` if the doorbell's assigned camera changes.

The WebRTC stream names are generated as:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure the backend exposes matching stream names.

### Changing the openHAB Sitemap

The OpenHAB screen is implemented as an iframe in `src/app/feature-openhab/openhab.html`. Change `openhab.sitemap` in the selected environment config when moving to another openHAB host, sitemap, or Basic UI path.

### Changing the EVCC URL

The Wallbox screen is implemented as an iframe in `src/app/feature-evcc/evcc.html`. Change `evcc.url` in the selected environment config when moving to another EVCC host or path.

### Common Troubleshooting

- **Sign-in fails**: verify the backend is running, local users were bootstrapped, the session paths are proxied, and the browser origin is allowed.
- **Calendars missing**: open Setup as admin, discover and enable the intended sources, then inspect account synchronization status.
- **Gallery folders missing**: verify the selected server-side folder path is relative to the owner's drive root and accessible to that connected account.
- **OpenHAB screen is blank**: verify `openhab.sitemap` in the selected environment config is reachable from the tablet and that the configured sitemap is available in openHAB Basic UI.
- **Wallbox screen is blank**: verify `evcc.url` in the selected environment config is reachable from the tablet and allows embedding in an iframe.
- **Camera stream does not start**: verify `protect.cameras` contains the expected camera names, Caddy routes `/api/webrtc/*` to go2rtc, and the generated `unifi_*` stream names are available there.
- **Tablet does not wake or reload after deploy**: verify the Fully Kiosk URL and password in `scripts/config.json`.
