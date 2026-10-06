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

The Home screen is the default landing page. It is protected by Microsoft sign-in because it reads Microsoft Graph data.

On mobile, `/home` and `/calendar` show the calendar at full height, while `/gallery` shows the photo gallery at full height. The bottom navigation switches between these dedicated pages. At 640px and above, all three routes show the unified calendar and gallery layout with a single Home navigation button. Both new routes use the same Microsoft sign-in guard as Home.

- The calendar column shows events from the configured calendars for the next few days.
- Calendar colors are controlled by the `tailwindClasses` values in the selected environment config.
- The gallery column displays photos from configured OneDrive folders.
- Gallery images are cached locally in the browser with IndexedDB so repeat loads are faster.
- The gallery refreshes periodically and loads more images as you scroll.
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

Regular motion items (`Patio_Camera_Motion`, `Garden_Camera_Motion`, `Entry_Camera_Motion`) and the corresponding `_SmartMotion` items capture a fresh camera snapshot on an OFF-to-ON transition. They also wake the tablet and select the detected camera. Initial ON states and repeated ON updates do not trigger captures.

The recent-detections filmstrip groups all cameras into 30-second windows starting with each window's first capture. Each window shows its latest smart snapshot when available, otherwise its latest regular snapshot. Opening a window shows all its images chronologically in the full-screen gallery, starting with the preferred image.


## Tablet/Kiosk Behavior

The dashboard is intended to run on a wall tablet in fullscreen mode. Use [Fully Kiosk Browser](https://www.fully-kiosk.com/) to launch the dashboard as the tablet start URL and keep it running as a fullscreen smart home display.

- The app detects screen visibility changes and avoids unnecessary refresh/stream work while hidden.
- The deploy script can also ask the Fully Kiosk device to clear cache, reload the start URL, and turn the screen on after deployment.

## Configuration

Runtime configuration is loaded from `config/config.json` during application startup. Angular serves or builds that file from the selected environment folder.

Create your production/deployment runtime config from the sample file:

```powershell
Copy-Item public/config/config.sample.json public/config/production/config.json
```

For local development, create a separate config file:

```powershell
Copy-Item public/config/config.sample.json public/config/development/config.json
```

`npm start` uses `public/config/development/config.json` and serves it as `config/config.json`. Production builds and `npm run deploy` use `public/config/production/config.json`.

The environment `config.json` files contain environment-specific URLs, calendar names, folder names, and Microsoft app registration details. They are ignored by Git. Keep publishable defaults in `public/config/config.sample.json`.

Example structure:

```json
{
	"graphUrl": "https://graph.microsoft.com/v1.0",
	"openhab": {
		"sitemap": "https://openhab.example.lan/basicui/app"
	},
	"evcc": {
		"url": "https://evcc.example.lan"
	},
	"protect": {
		"cameras": ["entry", "garden", "patio"],
		"cameraLabels": {
			"entry": "Eingang",
			"garden": "Garten",
			"patio": "Terrasse"
		}
	},
	"folders": ["Pictures/#Uploads", "Familie - Ausflüge"],
	"calendars": [
		{
			"name": "Familie",
			"tailwindClasses": "border-emerald-600 bg-emerald-300"
		}
	],
	"msalConfig": {
		"clientId": "00000000-0000-0000-0000-000000000000",
		"authority": "https://login.microsoftonline.com/consumers",
		"scope": ["User.Read", "Calendars.Read", "Files.Read"]
	}
}
```

### Microsoft Graph Setup

Create a Microsoft Entra ID app registration for the dashboard and put its client ID in `msalConfig.clientId`.

Required delegated scopes:

- `User.Read`
- `Calendars.Read`
- `Files.Read`

The configured redirect URI should match where the dashboard is served. For local development, use the Angular dev server URL. For production, use the dashboard URL exposed to the tablet.

The `calendars` entries must match the calendar names returned by Microsoft Graph. The `folders` entries are OneDrive paths from the drive root.

### openHAB Sitemap Setup

Set `openhab.sitemap` in the selected environment config to the openHAB Basic UI sitemap URL that should be embedded on the OpenHAB screen. The URL must be reachable from the tablet browser.

### EVCC Setup

Set `evcc.url` in the selected environment config to the EVCC UI URL that should be embedded on the Wallbox screen. The URL must be reachable from the tablet browser.

### Camera Setup

Set `protect.cameras` in the selected environment config to the UniFi Protect camera names that should appear on the Camera screen. The order in this array controls the display order and next/previous navigation order.

Use the optional `protect.cameraLabels` map to translate camera IDs into display names. These labels appear on the live cameras and motion snapshots, including tooltips and accessibility text. Cameras without a configured label display their ID. Labels do not change stream names or camera query parameters.

The WebRTC stream names are generated from each configured camera name:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure go2rtc exposes matching stream names.

### Backend/Proxy Paths

Use [Caddy](https://caddyserver.com/) as the production reverse proxy. Caddy should serve the built Angular files, route browser refreshes back to `index.html`, and expose the same-origin integration paths used by the dashboard.

In development, `src/proxy/proxy.dev.json` forwards these paths to the configured smart home backend.

Expected paths:

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
- Access to Microsoft Graph through a configured Entra ID app registration.
- Caddy for serving the dashboard and reverse proxying integration paths.
- go2rtc for WebRTC camera streaming.
- An openHAB Basic UI sitemap URL that the tablet can reach.
- Fully Kiosk Browser for running the dashboard fullscreen on the wall tablet.
- PowerShell remoting if you use the included deployment script.

### Install and Run

```powershell
npm install
Copy-Item public/config/config.sample.json public/config/production/config.json
Copy-Item public/config/config.sample.json public/config/development/config.json
Copy-Item src/proxy/proxy.dev.sample.json src/proxy/proxy.dev.json
npm start
```

The development server uses `src/proxy/proxy.dev.json` by default. Update the `target` values in that local file for your backend before testing camera streaming or same-origin openHAB proxy paths. The local proxy config is ignored by Git; keep publishable defaults in `src/proxy/proxy.dev.sample.json`.

### Build

```powershell
npm run build
```

The production build is written to `dist/Dashboard/browser`.

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
src/app/ms-graph           Microsoft Graph calendar/gallery services and IndexedDB cache
src/app/utils              Shared visibility, layout, date, debug, and WebSocket helpers
public/config              Runtime configuration copied into the built app
src/proxy                  Angular development proxy configuration and sample
scripts                   Deployment configuration and PowerShell deploy script
```

### Architecture Notes

- `src/main.ts` loads `config/config.json` before creating MSAL providers, so runtime configuration can change without rebuilding TypeScript.
- Routes are defined in `src/app/routes.ts`; Home, Calendar, and Gallery are guarded by MSAL because they need Microsoft Graph data.
- `Openhab` embeds the `openhab.sitemap` URL from runtime configuration as the OpenHAB screen.
- `Evcc` embeds the `evcc.url` URL from runtime configuration as the Wallbox screen.
- `ImageService` uses Microsoft Graph delta queries and IndexedDB to cache OneDrive image metadata and thumbnails.
- `CalendarService` fetches configured calendars from all calendar groups, filters by configured name, and refreshes events periodically.
- `Protect` reads the camera list from `protect.cameras` and passes configured camera names to `WebRTCService`.
- `WebRTCService` owns camera stream lifecycle and reacts to screen visibility events to stop or restart streams.

### Adding or Changing Cameras

Camera names are configured in the selected environment config under `protect.cameras`. To add, remove, rename, or reorder cameras, update that array and make sure go2rtc has matching stream names.

The WebRTC stream names are generated as:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure the backend exposes matching stream names.

### Changing the openHAB Sitemap

The OpenHAB screen is implemented as an iframe in `src/app/feature-openhab/openhab.html`. Change `openhab.sitemap` in the selected environment config when moving to another openHAB host, sitemap, or Basic UI path.

### Changing the EVCC URL

The Wallbox screen is implemented as an iframe in `src/app/feature-evcc/evcc.html`. Change `evcc.url` in the selected environment config when moving to another EVCC host or path.

### Common Troubleshooting

- **Blank Home screen or sign-in loop**: verify the Entra ID redirect URI, `clientId`, `authority`, and Graph scopes in the selected environment config.
- **Calendars missing**: verify the configured calendar `name` values exactly match the Microsoft calendar names visible to the signed-in user.
- **Gallery folders missing**: verify each configured OneDrive folder path starts at the drive root and is accessible to the signed-in user.
- **OpenHAB screen is blank**: verify `openhab.sitemap` in the selected environment config is reachable from the tablet and that the configured sitemap is available in openHAB Basic UI.
- **Wallbox screen is blank**: verify `evcc.url` in the selected environment config is reachable from the tablet and allows embedding in an iframe.
- **Camera stream does not start**: verify `protect.cameras` contains the expected camera names, Caddy routes `/api/webrtc/*` to go2rtc, and the generated `unifi_*` stream names are available there.
- **Tablet does not wake or reload after deploy**: verify the Fully Kiosk URL and password in `scripts/config.json`.
