# Dashboard Backend

Quarkus owns Microsoft authentication, scheduled synchronization, calendar grouping, OneDrive metadata, photo paging, disk caching, openHAB item handling, and motion snapshot storage. Angular reads the cached household view through public GraphQL and receives dataset invalidations and client actions over `graphql-transport-ws` without login. Metadata queries never call Microsoft. Binary media uses public HTTP; originals are downloaded only when requested. Account/source setup and arbitrary upstream HTTP writes require a Keycloak access token with the `dashboard` client's `admin` role. GraphQL PIN submission is public; the backend validates its numeric format and forwards it using private openHAB credentials.

## Requirements

- Java 25 and the included Gradle wrapper.
- PostgreSQL and persistent storage for the database and media directory.
- A confidential Microsoft application supporting personal Microsoft accounts.
- Same-origin HTTPS on the household LAN. Only the webhook callback needs public HTTPS.

## Code Formatting

The `Dashboard` profile in `etc/java_code_format.xml` is shared by Spotless and VS Code. Spotless uses Eclipse JDT 4.37 and formats Java sources under `src/*/java`, excluding generated code.

Run from the backend directory:

```powershell
.\gradlew.bat spotlessApply
.\gradlew.bat spotlessCheck
```

`check` and `build` include `spotlessCheck` and fail on formatting violations; they do not rewrite sources. Run `spotlessApply` to fix them.

VS Code's folder settings select Red Hat's Java formatter (`redhat.java`) and the same XML profile, with formatting enabled on save and while typing. The multi-root `dashboard.code-workspace` also defines the window-scoped Java profile settings, which VS Code ignores in folder settings when multiple roots are open. Install **Language Support for Java by Red Hat** if it is missing. After changing the XML profile, reload the Java language server or VS Code to refresh its settings, then run `spotlessApply`.

## Package Layout

Backend sources live under `cloud.heiss.dashboard`, grouped by responsibility:

- `api`: GraphQL contracts plus generated REST interfaces from the root OpenAPI contract.
- `api.model`: GraphQL response records plus generated REST request/response models.
- `calendar`: calendar synchronization and agenda date rules.
- `config`: application configuration mapping.
- `microsoft`: account/source management, OAuth, Graph requests, subscriptions, and webhooks.
- `openhab`: upstream item connection, security commands, doorbell/motion decisions, and GraphQL contracts.
- `persistence`: Hibernate store and transaction helpers.
- `persistence.entity`: one entity or composite ID class per file.
- `persistence.model`: account, source, and photo snapshot records, separate from managed entities.
- `photos`: OneDrive synchronization and binary media caching/serving.
- `protect`: persistent motion snapshots, grouping, retention, and media serving.
- `proxy`: streaming HTTP forwarding and dedicated openHAB/go2rtc WebSocket bridges.
- `security`: browser request checks and Microsoft token-cache encryption; Quarkus OIDC validates bearer tokens.
- `sync`: background coordination and dashboard change notifications.

Each handwritten class, record, and configuration interface has its own top-level file; handwritten response values and sync notifications use records. OpenAPI Generator creates REST interfaces and DTO classes under `build/generated/openapi`, not in the handwritten source tree. Tests mirror the responsibility packages.

## Configuration

Configure runtime settings in a protected `config/application.properties`, relative to Java's working directory, or through the process/container environment or a secret manager. To use another file, pass `-Dquarkus.config.locations=/etc/dashboard/application.properties` before `-jar`. Source templates live in the repository-root `config/` directory. The release layout uses `examples/application.properties`; copy it to the active location and replace all placeholders for a file-based installation. Never put secrets in public UI configuration or committed files. The [main installation guide](../README.md#linux-setup) describes the systemd deployment; environment override names are listed below.

| Variable | Purpose |
| --- | --- |
| `DASHBOARD_DB_URL` | PostgreSQL JDBC URL, such as `jdbc:postgresql://localhost:5432/dashboard`. Required in production unless `quarkus.datasource.jdbc.url` is set in runtime configuration. Local development uses the configured H2 database. |
| `DASHBOARD_DB_USER`, `DASHBOARD_DB_PASSWORD` | Database credentials. Replace the development defaults. |
| `DASHBOARD_TOKEN_KEY` | Base64-encoded, cryptographically random 32-byte AES key for persisted Microsoft token caches. |
| `DASHBOARD_OIDC_ISSUER` | OIDC realm URL, e.g. `https://login.home.arpa/realms/dashboard`. Set this to your deployment's realm; the frontend uses the same realm. |
| `DASHBOARD_OIDC_AUDIENCE` | Required access-token audience; defaults to `dashboard`. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Confidential application's client ID and secret. |
| `MICROSOFT_REDIRECT_URI` | Exact registered Web callback, e.g. `https://dashboard.home.arpa/api/accounts/callback`. |
| `MICROSOFT_WEBHOOK_URL` | Public `https://.../api/graph/webhook`; omit to use scheduled reconciliation only. |
| `DASHBOARD_MEDIA_DIRECTORY` | Persistent photo cache and motion snapshot directory; defaults to `./data/media`. The development sample sets `dashboard.media-directory=./dev/data/onedrive`; edit that property or override it with `%dev.dashboard.media-directory=${DASHBOARD_MEDIA_DIRECTORY:./dev/data/onedrive}` to use this environment variable in development. Snapshots use its `protect/` subdirectory. |
| `DASHBOARD_ORIGINAL_CACHE_BYTES` | Original-cache quota; defaults to 10 GiB. Individual originals are limited to the smaller of this quota and 512 MiB. |
| `DASHBOARD_THUMBNAIL_CACHE_BYTES` | Thumbnail-cache quota; defaults to 1 GiB. Individual thumbnails are limited to 20 MiB. |
| `DASHBOARD_UI_BASE_PATH` | UI return path; defaults to `/` for both embedded and separately served Angular builds. |
| `DASHBOARD_OPENHAB_URL` | Optional openHAB HTTP(S) origin reachable from the backend, e.g. `http://openhab.home.arpa:8080`. Requires `DASHBOARD_OPENHAB_TOKEN`. |
| `DASHBOARD_OPENHAB_TOKEN` | Private openHAB API token used for both REST and WebSocket authentication; never expose it through public API responses. |
| `DASHBOARD_GO2RTC_URL` | Optional go2rtc HTTP(S) origin reachable from the backend, e.g. `http://127.0.0.1:1984`. |

`dashboard.zone` defaults to `Europe/Vienna`; override with `DASHBOARD_ZONE`. Reconciliation defaults to five minutes; override with `DASHBOARD_SYNC_EVERY`, such as `5m` or `PT5M`. Workers check the durable queue every ten seconds. Retry-After and bounded backoff delay failing accounts without stopping other accounts.

Environment overrides use the expressions configured in application properties; an explicit value in an external properties file takes precedence over a fallback expression. Quarkus's standard environment names, such as `QUARKUS_DATASOURCE_JDBC_URL`, are also available.

All settings, including public view URLs and backend item mappings, belong in the same private `application.properties` file. The frontend receives an explicit public projection through `/api/config`, not the file itself. Optional integration settings can be omitted. Restart the backend after editing properties, then reload browsers for updated public settings.

```properties
dashboard.openhab.sitemap=https://openhab.home.arpa/basicui/app
dashboard.openhab.items.security=Security
dashboard.openhab.items.pin=Security_Pin
dashboard.openhab.items.doorbell=Entrance_Bell_Switch
dashboard.openhab.doorbell-camera=entry
dashboard.evcc.url=https://evcc.home.arpa
dashboard.protect.cameras[0].id=entry
dashboard.protect.cameras[0].label=Eingang
dashboard.protect.cameras[1].id=garden
dashboard.protect.cameras[1].label=Garten
```

Camera indices define display order. Each configured camera requires a unique `id` and a `label`; omitting the list produces an empty camera map. Missing view URLs produce empty strings. Item mappings and credentials are never included in `/api/config`.

Cache budgets are enforced during hourly cleanup, not before every download. Allow disk space beyond the combined 11 GiB defaults for concurrent downloads, retained motion snapshots, and other application data. Active streams pin cached files until the response closes. Store media on a persistent writable filesystem with sufficient free bytes and inodes.

Liquibase applies the database changelog at startup using `src/main/resources/db/changelog.xml`. Hibernate maps the dashboard tables and validates the resulting schema; application persistence uses managed entities, HQL, and JTA transactions. Never rotate the token key without re-encrypting the stored Microsoft caches or reconnecting Microsoft accounts.

## Keycloak Authentication

Use your realm, for example `https://login.home.arpa/realms/dashboard`, and a public OpenID Connect client named `dashboard`, with client authentication disabled, Standard Flow enabled, implicit/direct-access grants disabled, and PKCE `S256` required. No client secret is shipped to the browser. Register these URLs for every deployment origin, including `http://localhost:4200` during development:

- Valid redirect URI: `<origin>/auth/callback`.
- Valid post-logout redirect URI: `<origin>/home`.
- Web origins: the exact frontend origin, without a path or wildcard.

The frontend loads its server URL, realm, and client ID from `/api/config` before constructing the Keycloak adapter. The backend derives `keycloak.url` and `keycloak.realm` from `quarkus.oidc.auth-server-url`, which must end in `/realms/<realm>`, and exposes `quarkus.oidc.client-id` as `keycloak.clientId`. Context paths such as `/auth` are supported. Change the backend properties, restart, and reload the browser to use another realm without rebuilding. Only public connection settings are exposed, never secrets. Development and production URLs can be separate entries on the same client; separate clients provide stronger environment isolation.

Create the client role `admin` under `dashboard` and assign it to administrators. Ensure the access-token mapper includes `resource_access.dashboard.roles`; a realm role or another client's `admin` role does not grant access. Add an audience mapper that includes `dashboard` in access tokens. The backend validates signature, issuer, expiry, and audience using OIDC discovery/JWKS; it never trusts a frontend role assertion. Invalid authentication returns 401, and authenticated users without the client role receive 403 for protected HTTP operations. GraphQL authorization errors appear in the GraphQL error response.

To configure the audience explicitly, open **Clients > dashboard > Client scopes > dashboard-dedicated**, choose **Add mapper > By configuration > Audience**, set **Included Client Audience** to `dashboard`, and enable **Add to access token**. Sign in again after saving so a fresh access token contains the audience. The `aud` claim identifies the intended API; `azp` identifies the requesting client and does not replace the audience check.

The frontend uses `keycloak-js` with Authorization Code Flow and PKCE, in-memory tokens, refresh before protected requests, and Keycloak logout. Public views and PIN entry do not prompt for sign-in or trigger an authentication redirect. Account setup prompts for sign-in before privileged actions. After a Microsoft account callback, the UI temporarily stores the returned code/state in `sessionStorage` and restores the Keycloak session through a top-level SSO redirect. An active Keycloak session avoids another login-button click; tokens remain in memory. Completing the Microsoft connection is an authenticated POST bound to the initiating administrator. Authentication does not use hidden iframes.

Tests use a local discovery/JWKS server and freshly signed fixture tokens, without contacting the live realm. Live user login, role assignment, redirect allowlists, and logout still require a configured Keycloak client and a real user.

## Schema Initialization

Fresh databases are initialized automatically. The root Liquibase changelog includes `db/baseline.xml`, which defines tables, constraints, indexes, and the initial revision row using native XML changes in the immutable `1-initial-dashboard-schema` changeset. Liquibase generates and applies the database-specific SQL at startup; no handwritten SQL file is needed. Hibernate schema generation remains disabled in favor of validation.

Application tables use short, lowercase singular names: `appuser`, `account`, `source`, `event`, `photo`, `membership`, `item`, `subscription`, and `revision`. Columns use concise lowercase names without underscores, retaining compounds such as `startdate` and `takenday` where needed for clarity. `appuser` avoids the reserved SQL name `user`. Java field names remain independent through explicit Hibernate mappings.

## Microsoft Registration And Onboarding

1. Register an application supporting personal Microsoft accounts and add a **Web**, not SPA, redirect URI matching `MICROSOFT_REDIRECT_URI`.
2. Configure delegated `User.Read`, `Calendars.Read`, and `Files.Read`. The server requests `offline_access` during authorization. It uses the consumers authority, authorization code flow, PKCE, and an admin-bound, ten-minute state token.
3. Open `/home`, click the settings icon, and sign in through Keycloak from the popup. Open `/setup` and connect each owner's Microsoft account.
4. Select discovered calendars. Add OneDrive folder paths relative to the drive root, then enable them. New sources are disabled until selected. All selected accounts feed the same household view.
5. Open `/home` on viewing devices. Microsoft credentials are never needed on those devices; public reads and PIN submission are available without authentication, while account/source changes require the Keycloak client role.

Reconnect accounts marked `RECONNECT_REQUIRED` from setup. Failed syncs retain last-good data. Disconnect removes source membership and unreferenced metadata; stale/unreferenced disk files are removed during subsequent synchronization or hourly cleanup. Files already being streamed remain pinned until the response closes. Quotas are temporarily soft while files are pinned.

## Development

`quarkusDev` explicitly loads `dev/config/application.properties`. Before starting, it runs `prepareDevConfig` to create that file from the repository-root `config/application-dev.properties.sample`, and the UI's `src/proxy/proxy.dev.json` from `src/proxy/proxy.dev.sample.json`, if missing. Existing files are never overwritten. Backend development configuration and data live under `dev/`, which is ignored by Git; the UI proxy file is also ignored. The source templates are outside the backend's automatic `config/` scan.

To generate the local files without starting the backend:

```powershell
.\gradlew.bat prepareDevConfig
```

Edit the local properties and UI proxy files, or set their supported environment variables. With the standalone Angular dev server on port 4200, register `http://localhost:4200/api/accounts/callback`, set that as `MICROSOFT_REDIRECT_URI`, and set `DASHBOARD_UI_BASE_PATH=/`.

The standard dev task uses the `dev,h2` profiles and disables Quinoa by default:

```powershell
.\gradlew.bat quarkusDev
```

H2 data persists across restarts in `dev/data/h2/dashboard.mv.db`; OneDrive originals and thumbnails use `dev/data/onedrive`. Paths are relative to the backend working directory. The backend listens at `http://localhost:8080`. Configure the frontend's development URLs in Keycloak to sign in. Tests continue to use their isolated in-memory H2 database.

Run `npm start` in the sibling UI directory for the Angular dev server. Its single `/api/**` proxy rule forwards all dashboard APIs, including WebSockets, to the backend on port 8080. It must not target openHAB or go2rtc directly. Configure those upstreams in `dev/config/application.properties` or through the environment as described below. The browser uses the Angular server's origin for both the UI and APIs; no separate origin configuration is needed. Local UI proxy files use `/api/**`, targeting `http://localhost:8080` with `ws: true`. Preserve the browser-facing host rather than enabling `changeOrigin`. Angular continues to serve SPA routes, assets, and development hot reload. For PostgreSQL development, configure its JDBC URL and credentials and change the dev JVM profiles in `build.gradle` to `dev`.

## Build And Test

### OpenAPI Contracts

The repository-root `../openapi.yaml` is the authoritative, editable REST contract shared by backend and frontend. It covers configuration, account/source setup, synchronization, photo blobs, motion snapshots, and camera poster frames. Do not generate or overwrite this file from Java code.

OpenAPI Generator's `jaxrs-spec` generator creates Jakarta REST interfaces and Jackson models in `build/generated/openapi`. Resource classes implement the generated interfaces, which own operation paths, parameters, and media types. Handwritten implementations contain business logic, runtime authorization, and validation, but no OpenAPI annotations. `compileJava` automatically depends on `genApi`; run `.\gradlew.bat genApi` to generate the backend sources independently, without building Angular or starting the server. Generated files are build outputs and must not be edited or committed.

Angular's `npm run gen:api` reads the same root YAML and generates its service classes and TypeScript models. Frontend start/build commands regenerate these automatically. Neither generator requires the other project's build outputs.

Gradle packages the root contract as `META-INF/openapi.yaml`. SmallRye annotation scanning is disabled, so `/q/openapi` serves this contract rather than inferring one from Java. API documentation endpoints require a bearer token with the `dashboard` client's `admin` role. The contract uses HTTP bearer authentication with browser-origin safeguards.

GraphQL, WebSocket signaling, Microsoft webhooks, arbitrary transparent upstream proxying, and operational health endpoints remain outside this REST contract. The concrete camera-frame operation implements the generated interface and streams upstream responses without forwarding browser credentials.

### Commands

```powershell
.\gradlew.bat test
.\gradlew.bat build
java -jar build/quarkus-app/quarkus-run.jar
```

Quinoa builds the sibling UI with `/` as its base href, hosts it at the HTTP root, and serves SPA deep links. All dashboard backend endpoints live under `/api`; unknown API routes return HTTP 404 instead of the SPA page. Smart-home integration and Keycloak connection settings are loaded at runtime. Angular requests `GET /api/config` once before initializing authentication and starting the application. To serve Angular separately, build it normally and proxy `/api/**` to the backend, including WebSocket upgrades.

`GET /api/config` returns the frontend model: `sitemapUrl` from `dashboard.openhab.sitemap`, `evccUrl` from `dashboard.evcc.url`, an ordered `cameras` map from `dashboard.protect.cameras[n].id` and `.label`, and public `keycloak` settings derived from the backend's OIDC configuration. Backend item mappings and private configuration fields are not returned.

Automated tests use H2 in PostgreSQL compatibility mode, mocked Graph responses, local OIDC discovery/JWKS, and an actual Quarkus HTTP/WebSocket test server. Test-only signing keys are generated at runtime. Real PostgreSQL schema initialization, live Keycloak/Microsoft flows, and multi-device deployment still require an environment integration test.

## Deployment Packages And Releases

GitHub Actions runs backend tests, Spotless, and the combined production build on every push and pull request. Download the `dashboard` artifact from the successful **Build** run. It contains `dashboard-ci.<run>.<attempt>-<commit>.zip` and `SHA256SUMS` and is retained for 14 days.

Publish a GitHub Release for a tag such as `v1.0.0` to run the **Release** pipeline. It checks out that exact tag, runs the same checks, and attaches `dashboard-v1.0.0.zip` and `SHA256SUMS` to the release. Tag names must start with a letter or digit and contain only letters, digits, dots, underscores, and hyphens. The workflow files must be present in the tagged commit. Release assets remain available independently of the temporary Actions artifacts.

The archive includes one runtime template at `examples/application.properties`, sourced from `../config/application.properties.sample`. On first installation, copy it to `config/application.properties` and replace all placeholders, or use an external file with `quarkus.config.locations`. It contains database, Microsoft, Keycloak, view, camera, and integration settings. Environment-based deployments can supply these settings without an active properties file. Samples are outside Quarkus's scanned `config` directory; active configuration and secrets must not be distributed. Restart Java after changing runtime settings, then reload browsers. No frontend rebuild is needed.

Build the same archive locally from the backend directory:

```powershell
.\gradlew.bat check distributionZip -PreleaseVersion=1.0.0
```

The archive is written to `build/distributions/`. Extract it on the target machine and keep the entire `quarkus-app/` directory together; the runner JAR alone is not sufficient. No Gradle, Node.js, or npm is required on the target, but a Java 25 runtime, PostgreSQL, runtime configuration, and persistent media storage are required. Start from the extracted directory:

```powershell
java -jar quarkus-app/quarkus-run.jar
```

The embedded UI is served at `/`, with account setup at `/setup`. The settings icon opens a Keycloak sign-in popup when needed; direct visits to `/setup` use the same popup, and `/login` opens that flow. Configure your same-origin reverse proxy for HTTPS and forward requests unchanged to the backend, including WebSocket upgrades. The backend hosts the openHAB/go2rtc proxy routes; the upstream services themselves are not packaged with the application.

## Smart-Home Proxy

Quarkus forwards openHAB REST requests, camera snapshots, and WebSocket signaling through Vert.x. Browsers use the dashboard origin only for these integrations; no extra integration proxy layer or browser-held openHAB token is required. openHAB and go2rtc continue to run as separate services.

### Private Configuration

Set these properties in the protected runtime properties file, or use the environment variables listed above:

```properties
dashboard.proxy.openhab-url=http://openhab.home.arpa:8080
dashboard.proxy.openhab-token=REPLACE_OPENHAB_API_TOKEN
dashboard.proxy.go2rtc-url=http://127.0.0.1:1984
dashboard.proxy.connect-timeout-ms=5000
dashboard.proxy.request-timeout-ms=30000
```

Both URLs must be HTTP(S) origins with no credentials, query, fragment, or path other than an optional trailing `/`. Do not append `/rest`, `/ws`, or `/api`; the backend supplies these paths. Addresses resolve from the backend process: in a container, `127.0.0.1` refers to that container, not the host or a separate go2rtc container. HTTPS upstreams must present certificates trusted by the backend.

Settings are optional and unset by default. openHAB needs both its URL and token; go2rtc needs its URL. Missing settings return HTTP 503 on the corresponding integration routes without disabling the rest of the dashboard. Restart the backend after changing properties. The connection timeout defaults to 5,000 ms and also bounds the upstream WebSocket handshake; the HTTP request timeout defaults to 30,000 ms. The HTTP timeout does not limit an established WebSocket's lifetime.

### Routes And Forwarding

| Browser route | Upstream route | Transport |
| --- | --- | --- |
| `/api/openhab` and `/api/openhab/*` | `/rest` and `/rest/*` | HTTP |
| `/api/ws/openhab` | `/ws` | WebSocket |
| `/api/webrtc` and `/api/webrtc/*` | `/api` and `/api/*` | HTTP |
| `/api/ws/webrtc?src=unifi_entry` | `/api/ws?src=unifi_entry` | WebSocket |

Query strings are preserved. HTTP forwarding streams request and response bodies and preserves upstream status codes and end-to-end headers. WebSocket bridges forward text, binary, and fragmented messages with backpressure and propagate connection closure. Ping/pong control frames are handled locally on each connection.

For openHAB HTTP requests, the backend replaces `Authorization` with the configured token. For openHAB WebSockets, it offers `org.openhab.ws.protocol.default` and derives the access-token subprotocol from the same token. The upstream authentication subprotocol is not exposed to the browser. For go2rtc, the backend removes `Origin` for HTTP and disables its generation during the upstream WebSocket handshake.

The integration proxy accepts WebSocket upgrades only at `/api/ws/openhab` and `/api/ws/webrtc`. Upgrades on the integration HTTP routes `/api/openhab` and `/api/webrtc` (including their subpaths) return HTTP 400; ordinary HTTP requests to the two WebSocket routes return HTTP 426. GraphQL independently supports WebSocket subscriptions at `/api/graphql`.

### Security And Media Boundaries

Read-only HTTP proxy requests, camera images, and camera-viewing signaling remain public. Other proxy HTTP methods and openHAB WebSocket upgrades require a valid bearer token with the `dashboard` client role `admin`. PIN commands use the public GraphQL HTTP mutation, which accepts only a numeric PIN for the configured item; openHAB rules decide whether that PIN is valid. Proxy filters run after OIDC authentication and strip browser credentials before forwarding upstream. Restrict the dashboard to the trusted household network and scope the private openHAB token's permissions where supported.

The UI and APIs share one public scheme, host, and port. No configured origin list or application-specific request header is needed. The backend compares standard browser `Origin` headers with the request's public origin and rejects mismatches, including on WebSocket upgrades. For unsafe HTTP methods and WebSocket upgrades, Fetch Metadata and a supplied `Referer` also reject cross-origin requests when applicable. Non-browser clients can call APIs without browser metadata; origin checks are not authentication. The public webhook is exempt, and cross-site OAuth callback navigation remains supported.

Ensure the reverse proxy preserves the public host and conveys the public scheme and port through trusted forwarding headers. Trust only your proxy addresses; incorrect forwarding can make valid same-origin requests fail. Browser cookies, browser authorization, forwarded headers, and hop-by-hop headers are not sent upstream; upstream `Set-Cookie` headers are not returned to browsers. Keep tokens in protected backend configuration, never in `/api/config`, frontend proxy files, committed examples, or logs.

The camera bridge proxies WebRTC signaling, not the WebRTC media connection. Configure go2rtc streams as `unifi_<cameraId>` and `unifi_<cameraId>_medium`, matching `dashboard.protect.cameras[n].id`. Clients still need connectivity to the media candidates advertised by go2rtc; configure ICE/TURN and network access as appropriate. Embedded openHAB sitemap and EVCC pages remain separate URLs and must be reachable directly from the browser over HTTPS with iframe embedding allowed.

### Backend Item Handling

The backend maintains one openHAB item connection, independent of browser sessions. It reads initial states through authenticated REST, processes `ItemStateUpdatedEvent` messages, sends five-second heartbeats, and reconnects after connection failures. Runtime properties supply `dashboard.openhab.items.security`, `dashboard.openhab.items.pin`, `dashboard.openhab.items.doorbell`, `dashboard.openhab.doorbell-camera`, and `dashboard.protect.cameras[n].id`. Restart the backend after changing these mappings.

Each configured camera registers `<CapitalizedCameraId>_Camera_Motion` and `<CapitalizedCameraId>_Camera_SmartMotion`. Motion transitions to ON from a known non-ON state select the matching camera and queue a snapshot. Initial ON states and repeated ON motion updates do not create detections. Positive doorbell updates select the configured doorbell camera without taking a motion snapshot. PIN commands are sent to the configured PIN item through backend REST; clients never interpret upstream item topics or submit arbitrary item names.

The public `dashboardAction` GraphQL subscription delivers `SHOW_CAMERA`, `SECURITY_STATE`, `SNAPSHOTS_CHANGED`, and an initial `SYNC`. Camera actions are not replayed to new clients. Angular only wakes the tablet, navigates to the requested camera, renders security state, and refreshes the snapshot gallery. `securityArmed` returns the current state, or null before a successful state read; `submitSecurityPin` submits a numeric PIN without logging its value.

The backend downloads snapshots directly from go2rtc, including when no browser is open. Two capture workers and a queue of 32 requests bound concurrency; each JPEG is limited to 20 MiB with a ten-second download timeout. A capture failure is logged without preventing camera navigation. Multiple browsers do not multiply captures.

JPEGs and JSON metadata are stored atomically in `<dashboard.media-directory>/protect/`, separate from the OneDrive cache. The newest 20 groups are retained; groups span 30 seconds from their first capture and prefer the latest smart snapshot, otherwise the latest regular snapshot. `motionGroups` supplies the grouped gallery, and `/api/media/protect/{id}` serves stored JPEGs. Snapshots survive backend restarts; cleanup removes older groups and interrupted writes. Anyone able to reach the dashboard can read this shared camera history, so keep the media directory persistent and the dashboard restricted to the trusted household network.

### Deployment

Keep the outer HTTPS reverse proxy, with WebSocket support and suitable idle timeouts. Forward all dashboard requests to the backend without stripping integration prefixes. Quinoa already serves the production UI and SPA fallback. For a same-machine deployment, terminate HTTPS for `dashboard.home.arpa` at the proxy and forward requests unchanged to `http://127.0.0.1:8080`.

Verify initial openHAB states, live item updates, commands, camera snapshots, and live video through the dashboard origin. Backend restarts interrupt both integration WebSockets.

### Troubleshooting And Tests

| Symptom | Check |
| --- | --- |
| HTTP 503 | Required upstream URL/token is unset. |
| HTTP 502 or failed WebSocket handshake | Upstream availability, backend DNS/network access, TLS trust, and openHAB token validity. |
| HTTP 403 | UI and APIs use the same public scheme, host, and port; the reverse proxy preserves that origin through trusted forwarding headers. |
| HTTP 400 on upgrade or HTTP 426 | Use the exact `/api/ws/openhab` or `/api/ws/webrtc` route with a WebSocket upgrade, not an integration HTTP route. |
| Upstream HTTP 401/403 | Verify token permissions and upstream access policies; upstream HTTP statuses are preserved. |
| Snapshots work but live video does not | Matching stream names, WebSocket support at the outer proxy, and go2rtc media/ICE connectivity. |

`OpenhabProxy` and `Go2rtcProxy` own their integration routes and header behavior; their shared `HttpProxy` base handles client lifecycle, request checks, header filtering, and HTTP streaming. `OpenhabWebSocketProxy` and `Go2rtcWebSocketProxy` supply integration-specific handshake settings; their shared `WebSocketProxy` base owns client lifecycle, frame forwarding, backpressure, and cleanup.

Run the focused fixture tests from the backend directory:

```powershell
.\gradlew.bat test --tests cloud.heiss.dashboard.proxy.IntegrationProxyTest
.\gradlew.bat test --tests "cloud.heiss.dashboard.openhab.*" --tests cloud.heiss.dashboard.protect.MotionSnapshotsTest
```

The tests use local upstream fixtures and an artificial token to verify HTTP forwarding, credential isolation, origin rejection, and WebSocket messages and closure. They do not validate live openHAB/go2rtc services or WebRTC media connectivity.

## API And Proxy

All dashboard HTTP APIs and WebSockets share the `/api` namespace; SPA navigation remains at `/`, `/home`, `/setup`, and the other UI routes. The outer production proxy can still forward everything to port 8080 unchanged. Angular development needs only a `/api/**` proxy rule with `ws: true`.

Register the Microsoft Web redirect URI and set `MICROSOFT_REDIRECT_URI` to the public `/api/accounts/callback` URL. If using Microsoft webhooks, configure `MICROSOFT_WEBHOOK_URL` and its public proxy rule for `/api/graph/webhook`.

- `GET /api/config`: public UI configuration projected from backend properties, with `Cache-Control: no-store`; invalid Keycloak realm settings or duplicate camera IDs return HTTP 503.
- `POST /api/graphql`: public bounded `agenda`, `calendars`, `images`, `image`, `moments`, and `syncStatus` queries; cached `securityArmed` and `motionGroups`; the public `submitSecurityPin` mutation with numeric-format validation.
- `WS /api/graphql`: public `dashboardChanged` and `dashboardAction`; subscribers receive an initial revision or `SYNC`, not historical camera actions.
- `GET /api/media/images/{opaque-id}/thumbnail` and `/original`: public access, private ETag caching, streamed bytes.
- `GET /api/media/protect/{opaque-id}`: public stored motion JPEGs with private caching.
- `/api/accounts` and its source/connect/sync endpoints: admin-only setup operations. OAuth remains HTTP rather than GraphQL.
- `GET /api/accounts/callback`: public Microsoft callback relay; `POST /api/accounts/callback` completes the connection with an admin bearer token. Standard browser metadata rejects cross-origin API requests, including WebSocket upgrades.
- `POST /api/graph/webhook`: public validation challenge or validated subscription/client-state notification; only durable queueing happens in the callback.

For a separately served frontend, preserve the API paths at the LAN proxy and support WebSocket upgrades. Do not expose the LAN server wholesale to the Internet. If using public Microsoft webhooks, configure a separate HTTPS listener with your publicly resolvable hostname to forward only the exact `/api/graph/webhook` path unchanged to `http://dashboard-backend:8080`. The `home.arpa` examples are LAN-only and cannot receive public Microsoft webhooks. Return HTTP 404 for all other paths on that public listener.

Terminate LAN HTTPS at a trusted proxy and configure forwarding headers only for trusted proxy addresses. Avoid logging bearer tokens, OAuth callback query strings, and upstream token/download URLs. Rate-limit the public callback at the edge.

## Operational Boundaries

Webhooks are hints, not a guaranteed delivery stream. Microsoft drive notifications can be delayed for hours; polling remains active and subscription renewal failures appear as account warnings. Shared/delegated Outlook sources may require polling or connecting their owner. Folder delta and CDN redirect compatibility need validation with representative personal/shared accounts before deployment.

The agenda is cached from yesterday through thirty days ahead. Requests outside that range fail rather than causing live Graph calls. Images use revision-bound, timestamp-plus-ID cursors; clients reload if a revision expires their cursor. Moments contain four populated dates in the preceding ten days, excluding the reference year's photos, with a current limit of 100 images per group.

Back up PostgreSQL **and** the external Microsoft token-cache key. Database contents alone cannot decrypt Microsoft token caches. OneDrive cache files can be downloaded again; back up motion snapshots if their history must be retained. Use one backend instance; in-memory notification broadcasts are not shared between replicas. Keycloak owns administrator sessions; issued access tokens remain valid until expiry, so use suitably short access-token lifetimes. Calendar metadata and images are public to anyone who can reach the server; restrict network access accordingly.