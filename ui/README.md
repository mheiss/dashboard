# Dashboard Frontend

The Angular application is the dashboard's presentation and interaction layer. It is built for an always-on wall tablet, with responsive layouts for phones and desktop browsers.

See the [project overview](../README.md) for features and screenshots, and the [backend README](../server/README.md) for server configuration and integrations.

## Interface And Behavior

- **Responsive home view**: Calendar and gallery appear side by side on larger screens; below 640px, mobile navigation separates them into dedicated views.
- **Shared photo viewer**: OneDrive photos, memories, and camera snapshots use a common full-screen viewer with navigation and zoom.
- **Integration views**: openHAB and EVCC are embedded pages; cameras use WebRTC with camera selection and recent motion galleries. Navigation shows only configured integrations.
- **Protected setup**: Administrators connect Microsoft accounts and select calendar and photo sources. Everyday views do not prompt for sign-in.
- **Kiosk lifecycle**: Camera streams and gallery work react to screen visibility. Fully Kiosk Browser integration supports waking the tablet for backend camera actions.

## Camera Diagnostics

Select the camera's status dot to toggle stream diagnostics. The overlay shows sampled FPS and bitrate, cumulative packet loss and dropped frames, jitter, RTT, per-frame decode time, jitter-buffer delay, selected ICE transport, and the last reconnect reason. Unsupported browser statistics appear as `n/a`. The console records diagnostics every ten seconds and immediately before reconnecting.

WebRTC media continues after the signaling WebSocket closes; the player deliberately closes signaling after receiving decoded video. Brief stalls have a two-second status grace period. Recovery retains the five-second no-data and ten-second buffering timeouts, with a separate thirty-second limit for receiving the first decoded frame. Camera changes release the previous stream, shared viewers retain it until the last viewer leaves, and screen wake resumes only requested streams. Window focus alone does not determine screen visibility.

## Technology And Structure

The UI uses Angular standalone components and routing, RxJS for asynchronous data, Tailwind CSS for styling, and Lucide icons. Keycloak's JavaScript adapter handles administrator sessions; GraphQL subscriptions provide live updates.

| Directory | Responsibility |
| --- | --- |
| `src/app/feature-home` | Calendar, photo gallery, and home layout |
| `src/app/feature-openhab`, `feature-evcc` | Embedded smart-home and charging views |
| `src/app/feature-protect` | Camera views, WebRTC lifecycle, and motion galleries |
| `src/app/feature-setup` | Protected account and source management |
| `src/app/feature-navigation` | Responsive navigation |
| `src/app/feature-config` | Runtime display settings |
| `src/app/backend` | Backend communication and authentication |
| `src/app/image-viewer`, `popup`, `utils` | Shared UI and browser utilities |
| `src/proxy` | Angular development proxy settings |

## Backend Boundary

Angular loads public runtime settings before startup, then initializes authentication. Integration URLs, camera labels, and Keycloak connection settings come from the backend, so changing them does not require rebuilding the UI. Credentials and backend item mappings are never included in browser configuration.

The frontend renders the server's agenda, paged photos, and grouped motion snapshots. It reacts to change notifications and camera-selection actions; Microsoft synchronization, openHAB item interpretation, snapshot capture, and persistent caching remain server responsibilities.

Keycloak access and refresh tokens stay in memory. The UI guards administrator views and attaches tokens to protected dashboard requests; the backend remains responsible for authorization. Realm and client setup are covered in the [backend identity section](../server/README.md#configuration-and-identity).

## Local Development

Use Node.js compatible with Angular 22 and the npm version recorded in [package.json](package.json). Angular CLI is included in the project; no global installation is required. A running Quarkus backend is needed for runtime configuration and data.

First prepare and start the backend using its [development instructions](../server/README.md#local-development). Then run from this directory:

```powershell
npm install
npm start
```

Open `http://localhost:4200`. Backend preparation creates the ignored local `src/proxy/proxy.dev.json` from [the proxy sample](src/proxy/proxy.dev.sample.json) without overwriting an existing file.

The Angular development server forwards `/api/**`, including WebSockets, to Quarkus at `http://localhost:8080`. Keep the browser-facing host intact; do not enable `changeOrigin` or point the proxy directly at openHAB/go2rtc. Restart `npm start` after editing proxy settings. Administrator sign-in also requires the development origin to be registered in Keycloak.

## Build And Maintenance

```powershell
npm run build
npm run gen:api
npm run prettier
```

The production build is written to `dist/Dashboard/browser`. REST services and models are generated from the shared [OpenAPI contract](../openapi.yaml); generation runs automatically before start and build, or independently with `gen:api`. Edit the contract rather than generated files. GraphQL and WebRTC transports are separate from this generation.

`prettier` formats TypeScript, JavaScript, CSS, and HTML using the Tailwind plugin. There is currently no frontend test runner configured.

## Hosting

The standard production build is packaged and served by Quarkus through Quinoa. For separate hosting, serve the build output at the HTTP root, use SPA fallback for UI navigation, and forward `/api/**` unchanged to the backend with WebSocket support. API failures must not fall back to the Angular page.

Use the deployed dashboard URL as the start page in [Fully Kiosk Browser](https://www.fully-kiosk.com/) for a wall tablet. Server packaging and HTTPS considerations belong to the [backend deployment section](../server/README.md#packaging-and-deployment).
