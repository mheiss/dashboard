# Dashboard Backend

Quarkus owns Microsoft authentication, scheduled synchronization, calendar grouping, OneDrive metadata, photo paging, and disk caching. Angular reads the cached household view through public GraphQL and receives `dashboardChanged` invalidations over `graphql-transport-ws` without login. Metadata queries never call Microsoft. Binary media uses public HTTP; originals are downloaded only when requested. Account/source setup requires the local admin login.

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

- `api`: GraphQL contracts and cached dashboard read models.
- `api.model`: top-level records for GraphQL responses.
- `calendar`: calendar synchronization and agenda date rules.
- `config`: application configuration mapping.
- `microsoft`: account/source management, OAuth, Graph requests, subscriptions, and webhooks.
- `microsoft.model`: top-level account/source request and response records.
- `persistence`: Hibernate store and transaction helpers.
- `persistence.entity`: one entity or composite ID class per file, including local dashboard users.
- `persistence.model`: account, source, and photo snapshot records, separate from managed entities.
- `photos`: OneDrive synchronization and binary media caching/serving.
- `security`: local sessions, browser request checks, and token encryption.
- `sync`: background coordination and dashboard change notifications.

Each class, record, and configuration interface has its own top-level file; response values and sync notifications use records rather than mutable DTO classes. Tests mirror the responsibility packages. Entity names and table mappings remain independent of the Java package layout; package moves require no Liquibase schema changes.

## Configuration

Configure runtime settings either in a protected `config/application.properties`, relative to Java's working directory, or through the process/container environment or a secret manager. The release archive includes an inactive `examples/application.properties`; copy it to the active location and replace all placeholders for a file-based installation. Never put secrets in public UI configuration or committed files. The main installation guide describes both methods and their override names.

| Variable | Purpose |
| --- | --- |
| `DASHBOARD_DB_URL` | PostgreSQL JDBC URL, such as `jdbc:postgresql://localhost:5432/dashboard`. Required in production. In development, set `QUARKUS_DATASOURCE_JDBC_URL` explicitly when Docker Dev Services is unavailable. |
| `DASHBOARD_DB_USER`, `DASHBOARD_DB_PASSWORD` | Database credentials. Replace the development defaults. |
| `DASHBOARD_TOKEN_KEY` | Base64-encoded, cryptographically random 32-byte AES key for persisted Microsoft token caches. |
| `DASHBOARD_SESSION_KEY` | Independent random session-encryption secret, at least 32 characters. Required in production. |
| `DASHBOARD_ADMIN_PASSWORD` | Bootstrap password for `admin`, at least 12 characters. |
| `DASHBOARD_ALLOWED_ORIGINS` | Comma-separated exact browser origins, including scheme and port, with no trailing slash. Required in production. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Confidential application's client ID and secret. |
| `MICROSOFT_REDIRECT_URI` | Exact registered Web callback, e.g. `https://dashboard.example.lan/accounts/callback`. |
| `MICROSOFT_WEBHOOK_URL` | Public `https://.../graph/webhook`; omit to use scheduled reconciliation only. |
| `DASHBOARD_MEDIA_DIRECTORY` | Persistent cache directory; defaults to `./data/media`, or `./dev/data/onedrive` with the local dev configuration. |
| `DASHBOARD_ORIGINAL_CACHE_BYTES` | Original-cache quota; defaults to 10 GiB. Individual originals are limited to the smaller of this quota and 512 MiB. |
| `DASHBOARD_THUMBNAIL_CACHE_BYTES` | Thumbnail-cache quota; defaults to 1 GiB. Individual thumbnails are limited to 20 MiB. |
| `DASHBOARD_UI_BASE_PATH` | UI return path; defaults to `/` for both embedded and separately served Angular builds. |
| `DASHBOARD_UI_CONFIG_FILE` | Backend-owned public UI JSON file. Defaults to `config/config.json`, or `dev/config/config.json` with the local dev configuration. Relative paths resolve from the backend's working directory. |

`dashboard.zone` defaults to `Europe/Vienna`; override with `DASHBOARD_ZONE`. Reconciliation defaults to five minutes; override with `DASHBOARD_SYNC_EVERY`, such as `5m` or `PT5M`. Workers check the durable queue every ten seconds. Retry-After and bounded backoff delay failing accounts without stopping other accounts.

Liquibase migrates the database at startup using `src/main/resources/db/changelog.xml`. Hibernate maps the dashboard tables and validates the migrated schema; application persistence uses managed entities, HQL, and JTA transactions rather than direct JDBC SQL. Bootstrap passwords create missing users only; changing the environment does not overwrite existing password hashes. For an administrative password reset, remove only that user's row through a trusted database connection, set the replacement bootstrap password, and restart. Rotate the session key and restart to invalidate existing cookies/connections. Never rotate the token key without re-encrypting the stored caches or reconnecting Microsoft accounts.

## Schema Migrations

Fresh databases are initialized automatically. The root Liquibase changelog includes `db/baseline.xml`, which defines tables, constraints, indexes, and the initial revision row using native XML changes in the immutable `1-initial-dashboard-schema` changeset. Liquibase generates and applies the database-specific SQL at startup; no handwritten SQL file is needed. Add future changesets to the root changelog; do not edit the baseline after deployment. Hibernate schema generation remains disabled in favor of validation.

Application tables use short, lowercase singular names: `appuser`, `account`, `source`, `event`, `photo`, `membership`, `item`, `subscription`, and `revision`. Columns use concise lowercase names without underscores, retaining compounds such as `startdate` and `takenday` where needed for clarity. `appuser` avoids the reserved SQL name `user`. Java field names remain independent through explicit Hibernate mappings.

## Microsoft Registration And Onboarding

1. Register an application supporting personal Microsoft accounts and add a **Web**, not SPA, redirect URI matching `MICROSOFT_REDIRECT_URI`.
2. Configure delegated `User.Read`, `Calendars.Read`, and `Files.Read`. The server requests `offline_access` during authorization. It uses the consumers authority, authorization code flow, PKCE, and an admin-bound, ten-minute state token.
3. Open `/home`, click the settings icon, and enter the local admin password in the popup. Open `/setup` and connect each owner's Microsoft account.
4. Select discovered calendars. Add OneDrive folder paths relative to the drive root, then enable them. New sources are disabled until selected. All selected accounts feed the same household view.
5. Open `/home` on viewing devices without signing in. Microsoft credentials are never needed on those devices; account/source management still requires the local admin login.

Reconnect accounts marked `RECONNECT_REQUIRED` from setup. Failed syncs retain last-good data. Disconnect removes source membership and unreferenced metadata; stale/unreferenced disk files are removed during subsequent synchronization or hourly cleanup. Files already being streamed remain pinned until the response closes. Quotas are temporarily soft while files are pinned.

## Development

Both `quarkusDev` and `quarkusDevH2` explicitly load `dev/config/application.properties`. Before starting, they run `prepareDevConfig` to create missing `dev/config/application.properties` and `dev/config/config.json` from their samples in `examples/`. Existing files are never overwritten. All local development configuration and data live under `dev/`, which is ignored by Git. Samples live under `examples/`, outside Quarkus's automatic `config/` scan.

To generate the local files without starting the backend:

```powershell
.\gradlew.bat prepareDevConfig
```

Edit the local properties and JSON files, or set their supported environment variables. With the standalone Angular dev server on port 4200, register `http://localhost:4200/accounts/callback`, set that as `MICROSOFT_REDIRECT_URI`, and set `DASHBOARD_UI_BASE_PATH=/`.

For a quick local backend without PostgreSQL or Docker, run from the backend directory:

```powershell
.\gradlew.bat quarkusDevH2
```

The `quarkusDevH2` shortcut runs the normal `quarkusDev` task with the `dev,h2` profiles and Quinoa disabled. Plain `quarkusDev` does not select H2 or disable Quinoa. The opt-in `h2` profile in the local properties file uses `jdbc:h2:file:./dev/data/h2/dashboard;MODE=PostgreSQL;DB_CLOSE_ON_EXIT=FALSE` with local database credentials `sa` / `sa`, disables datasource Dev Services, and keeps the normal `dev` settings. Liquibase initializes the schema and Hibernate validates it. Data persists across restarts in `dev/data/h2/dashboard.mv.db`; OneDrive originals and thumbnails use `dev/data/onedrive`. Paths are relative to the backend working directory. The backend listens at `http://localhost:8080`. Quinoa is disabled by the shortcut so it does not start a second frontend server.

Admin and Microsoft settings are unchanged: supply `DASHBOARD_ADMIN_PASSWORD` (at least 12 characters) to create the local administrator, and the Microsoft credentials and token/session keys for account connection. Keep the same token key when reusing a database containing Microsoft accounts. No default admin password or Microsoft credentials are introduced by the H2 profile. Production still uses PostgreSQL, and tests still use their isolated in-memory H2 database. If an external properties file or direct datasource environment variables override the datasource, remove those overrides for this local H2 launch.

For PostgreSQL development, supply its JDBC URL and credentials and omit the `h2` profile:

```powershell
.\gradlew.bat quarkusDev "-Dquarkus.quinoa=false"
```

Run `npm start` in the sibling UI directory. Its HTTP and WebSocket proxy forwards the dashboard endpoints to port 8080. Add another browser origin to `DASHBOARD_ALLOWED_ORIGINS` if the frontend uses another port. Existing openHAB/go2rtc proxy targets still need your local configuration.

## Build And Test

```powershell
.\gradlew.bat test "-Dquarkus.quinoa.enabled=false"
.\gradlew.bat build
java -jar build/quarkus-app/quarkus-run.jar
```

Quinoa builds the sibling UI with `/` as its base href, hosts it at the HTTP root, and serves SPA deep links. Backend endpoints keep their root-level paths. No deployment-specific UI configuration is needed at build time. Angular requests `GET /config` from the backend before startup. To serve Angular separately, build it normally and proxy the APIs below (including `/config`).

Automated tests use H2 in PostgreSQL compatibility mode, mocked Graph responses, and an actual Quarkus HTTP/WebSocket test server. Test-only fixture passwords/keys are not production defaults. Real PostgreSQL migrations, live Microsoft refresh/subscriptions/shared-folder capabilities, and multi-device deployment still require an environment integration test.

## Deployment Packages And Releases

GitHub Actions runs frontend tests, backend tests, Spotless, and the combined production build on every push and pull request. Download the `dashboard` artifact from the successful **Build** run. It contains `dashboard-1.0.0-SNAPSHOT.zip` and `SHA256SUMS` and is retained for 14 days.

Publish a GitHub Release for a tag such as `v1.0.0` to run the **Release** pipeline. It checks out that exact tag, runs the same checks, and attaches `dashboard-v1.0.0.zip` and `SHA256SUMS` to the release. Tag names must start with a letter or digit and contain only letters, digits, dots, underscores, and hyphens. The workflow files must be present in the tagged commit. Release assets remain available independently of the temporary Actions artifacts.

Every archive includes the committed public UI configuration sample as `examples/config.json`. On first installation, create the `config` directory and copy the sample to `config/config.json`, then edit it for your openHAB, EVCC, and camera settings, or set `DASHBOARD_UI_CONFIG_FILE` to an external file. Do not overwrite existing active configuration during upgrades. Local configuration files are never included in the archive. The backend rereads the file for each request, so browser reloads pick up changes without rebuilding or restarting. The endpoint is public to allow login-page bootstrap: never include credentials in this file. Private backend settings are supplied at runtime through the properties file or environment and are not needed during the build.

The archive also includes `examples/application.properties` for private backend settings. On a first file-based installation, the entire `examples` folder can be copied to `config` without renaming files; replace all backend placeholders before starting. For an environment-based installation, copy only the public JSON. Samples are outside Quarkus's scanned `config` directory. Only the samples are shipped; active configuration is excluded. Protect the active file and preserve it, your original keys, and your public JSON during upgrades. Changes to backend properties require restarting Java.

Build the same archive locally from the backend directory:

```powershell
.\gradlew.bat check distributionZip -PreleaseVersion=1.0.0
```

The archive is written to `build/distributions/`. Extract it on the target machine and keep the entire `quarkus-app/` directory together; the runner JAR alone is not sufficient. No Gradle, Node.js, or npm is required on the target, but a Java 25 runtime, PostgreSQL, the environment variables listed above, and persistent media storage are required. Start from the extracted directory:

```powershell
java -jar quarkus-app/quarkus-run.jar
```

The embedded UI is served at `/`, with account setup at `/setup`. The settings icon opens a password-only admin login popup when needed; direct visits to `/setup` use the same popup, and `/login` redirects to that flow for compatibility. Configure your same-origin reverse proxy for HTTPS and the openHAB/go2rtc paths; these integrations are not packaged with the application. Existing deployments must change any old `DASHBOARD_UI_BASE_PATH` or `dashboard.ui-base-path` override to `/` when using a root-hosted release.

## API And Proxy

- `GET /config`: public UI configuration from the backend-owned runtime file, with `Cache-Control: no-store`; unavailable or invalid files return HTTP 503.
- `POST /graphql`: public bounded `agenda`, `calendars`, `images`, `image`, `moments`, and `syncStatus` queries.
- `WS /graphql`: public `dashboardChanged`; an initial revision is emitted after subscriber registration.
- `GET /media/images/{opaque-id}/thumbnail` and `/original`: public access, private ETag caching, streamed bytes.
- `/accounts` and its source/connect/sync endpoints: admin-only setup operations. OAuth remains HTTP rather than GraphQL.
- `/session`, `/session/logout`, and `/j_security_check`: local admin session management. Unsafe browser API requests must send `X-Dashboard-Request: true`; unapproved Origin values are rejected, including on WebSocket upgrades.
- `POST /graph/webhook`: public validation challenge or validated subscription/client-state notification; only durable queueing happens in the callback.

For a separately served frontend, preserve the API paths at the LAN proxy and support WebSocket upgrades. Do not expose the following LAN server wholesale to the Internet. A public Caddy listener should forward only the exact callback:

```caddyfile
notifications.example.com {
    handle /graph/webhook {
        reverse_proxy dashboard-backend:8080
    }
    handle {
        respond 404
    }
}
```

Terminate LAN HTTPS at a trusted proxy, configure forwarding headers only for trusted proxy addresses, and ensure session cookies are Secure on the deployed HTTPS origin. Avoid logging OAuth callback query strings and upstream token/download URLs. Rate-limit the public callback at the edge.

## Operational Boundaries

Webhooks are hints, not a guaranteed delivery stream. Microsoft drive notifications can be delayed for hours; polling remains active and subscription renewal failures appear as account warnings. Shared/delegated Outlook sources may require polling or connecting their owner. Folder delta and CDN redirect compatibility need validation with representative personal/shared accounts before deployment.

The agenda is cached from yesterday through thirty days ahead. Requests outside that range fail rather than causing live Graph calls. Images use revision-bound, timestamp-plus-ID cursors; clients reload if a revision expires their cursor. Moments contain four populated dates in the preceding ten days, excluding the reference year's photos, with a current limit of 100 images per group.

Back up PostgreSQL **and** the external token/session keys. Database contents alone cannot decrypt Microsoft token caches. Media is reconstructible and optional in backups. Use one backend instance initially; in-memory notification broadcasts are not shared between replicas. Admin sessions use encrypted cookies rather than a per-device revocation registry; restart with a rotated session key to revoke admin sessions. Calendar metadata and images are public to anyone who can reach the server; restrict network access accordingly.