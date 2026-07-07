# Smart Home Dashboard

An Angular dashboard for a wall-mounted smart home tablet. It combines family calendar data, a OneDrive photo gallery, a predefined openHAB sitemap, EVCC wallbox information, and UniFi Protect camera streams in one touch-friendly interface.

The app is designed for an always-on display in the living room. It keeps the main flows large and simple, embeds the existing openHAB controls, and pauses camera/gallery work when the tablet screen is off.

## Main Screens

The dashboard has four primary sections in the navigation bar:

- **Home**: Shows the configured Microsoft calendars next to a OneDrive photo gallery.
- **OpenHAB**: Displays the predefined openHAB sitemap for smart home control.
- **Wallbox**: Hosts the EVCC view for electric vehicle charging information.
- **Kamera**: Shows UniFi Protect camera streams.

## Home Screen

The Home screen is the default landing page. It is protected by Microsoft sign-in because it reads Microsoft Graph data.

- The calendar column shows events from the configured calendars for the next few days.
- Calendar colors are controlled by the `tailwindClasses` values in `public/config/config.json`.
- The gallery column displays photos from configured OneDrive folders.
- Gallery images are cached locally in the browser with IndexedDB so repeat loads are faster.
- The gallery refreshes periodically and loads more images as you scroll.
- Detail view opens a larger image viewer for an individual photo or a same-day memory group.

### OpenHAB Screen

The OpenHAB screen displays a predefined openHAB Basic UI sitemap. This is the main OpenHAB feature of the dashboard: users can operate the configured smart home controls directly inside the tablet interface without leaving the dashboard.

The embedded sitemap URL is configured in `public/config/config.json` under `openhab.sitemap`.

## Camera Screen

The camera screen shows UniFi Protect streams through a local WebRTC integration. Use [go2rtc](https://github.com/AlexxIT/go2rtc/) as the WebRTC streaming backend.

- Supported cameras are `entry`, `garden`, and `patio`.
- Use the camera screen controls to move to the next or previous pinned camera.
- The selected camera is mirrored in the URL query string as `?camera=entry`, `?camera=garden`, or `?camera=patio`.
- Streams are started with a short delay between cameras to reduce load on the streaming backend.
- Streams stop when the tablet screen turns off and restart when it turns on again.

## Tablet/Kiosk Behavior

The dashboard is intended to run on a wall tablet in fullscreen mode. Use [Fully Kiosk Browser](https://www.fully-kiosk.com/) to launch the dashboard as the tablet start URL and keep it running as a fullscreen smart home display.

- The app detects screen visibility changes and avoids unnecessary refresh/stream work while hidden.
- The deploy script can also ask the Fully Kiosk device to clear cache, reload the start URL, and turn the screen on after deployment.

## Configuration

Runtime configuration is loaded from `public/config/config.json` during application startup. This file is copied into the built app as `config/config.json`.

Example structure:

```json
{
	"graphUrl": "https://graph.microsoft.com/v1.0",
	"openhab": {
		"sitemap": "https://openhab.example.lan/basicui/app"
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

Set `openhab.sitemap` in `public/config/config.json` to the openHAB Basic UI sitemap URL that should be embedded on the OpenHAB screen. The URL must be reachable from the tablet browser.

### Backend/Proxy Paths

Use [Caddy](https://caddyserver.com/) as the production reverse proxy. Caddy should serve the built Angular files, route browser refreshes back to `index.html`, and expose the same-origin integration paths used by the dashboard.

In development, `src/proxy/proxy.dev.json` forwards these paths to the configured smart home backend.

Expected paths:

- `/api/openhab/*`: proxies openHAB REST requests 
- `/ws/openhab*`: proxies openHAB WebSocket requests
- `/api/webrtc/*`: proxies WebRTC offers for camera streams.
- `/ws/webrtc`: signaling channel for camera streams.

Use [go2rtc](https://github.com/AlexxIT/go2rtc/) behind the `/api/webrtc*` and `/ws/webrtc*` routes. Keep openHAB API tokens and other credentials out of committed documentation and configuration files.

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

	# go2rtc - WebSocket proxy
	handle_path /ws/webrtc* {
		rewrite * /api/ws{path}
		reverse_proxy localhost:1984 {
			header_up -Origin
		}
	}

	# go2rtc - HTTP API
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
npm start
```

The development server uses `src/proxy/proxy.dev.json` by default. Update the `target` values in that file for your local backend before testing camera streaming or same-origin openHAB proxy paths.

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
src/proxy                  Angular development proxy configuration
scripts                   Deployment configuration and PowerShell deploy script
```

### Architecture Notes

- `src/main.ts` loads `config/config.json` before creating MSAL providers, so runtime configuration can change without rebuilding TypeScript.
- Routes are defined in `src/app/routes.ts`; only the Home route is guarded by MSAL because it needs Microsoft Graph data.
- `Openhab` embeds the `openhab.sitemap` URL from runtime configuration as the OpenHAB screen.
- `ImageService` uses Microsoft Graph delta queries and IndexedDB to cache OneDrive image metadata and thumbnails.
- `CalendarService` fetches configured calendars from all calendar groups, filters by configured name, and refreshes events periodically.
- `WebRTCService` owns camera stream lifecycle and reacts to screen visibility events to stop or restart streams.

### Adding or Changing Cameras

Camera names are defined in `src/app/feature-protect/protect.model.ts`. To add a camera, update the `Camera` union, the `isCamera` guard, and the `cameraOrder` list in `src/app/feature-protect/protect.ts`.

The WebRTC stream names are generated as:

- high quality: `unifi_{camera}`
- medium quality: `unifi_{camera}_medium`

Make sure the backend exposes matching stream names.

### Changing the openHAB Sitemap

The OpenHAB screen is implemented as an iframe in `src/app/feature-openhab/openhab.html`. Change `openhab.sitemap` in `public/config/config.json` when moving to another openHAB host, sitemap, or Basic UI path.

### Common Troubleshooting

- **Blank Home screen or sign-in loop**: verify the Entra ID redirect URI, `clientId`, `authority`, and Graph scopes in `public/config/config.json`.
- **Calendars missing**: verify the configured calendar `name` values exactly match the Microsoft calendar names visible to the signed-in user.
- **Gallery folders missing**: verify each configured OneDrive folder path starts at the drive root and is accessible to the signed-in user.
- **OpenHAB screen is blank**: verify `openhab.sitemap` in `public/config/config.json` is reachable from the tablet and that the configured sitemap is available in openHAB Basic UI.
- **Camera stream does not start**: verify Caddy routes `/api/webrtc/*` and `/ws/webrtc` to go2rtc and that the generated `unifi_*` stream names are available there.
- **Tablet does not wake or reload after deploy**: verify the Fully Kiosk URL and password in `scripts/config.json`.
