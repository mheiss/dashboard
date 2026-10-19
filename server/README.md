# Dashboard Backend

The Quarkus server is the dashboard's data and integration layer. It maintains a shared household view independently of connected browsers and hosts the production Angular application through Quinoa.

See the [project overview](../README.md) for features and screenshots, and the [frontend README](../ui/README.md) for Angular development.

## Responsibilities

- **Microsoft integration**: Account linking, calendar and OneDrive synchronization, source selection, and encrypted token storage.
- **Household data**: Cached agenda grouping, photo paging, and memories from previous years. Metadata reads use local data rather than live Microsoft requests.
- **Media storage**: On-demand original downloads, thumbnail caching, and persistent camera-motion snapshots.
- **Smart-home coordination**: A shared openHAB item connection, doorbell and motion handling, and openHAB/go2rtc forwarding with server-held credentials.
- **Client updates**: GraphQL queries and subscriptions for shared data, change notifications, and camera-selection actions; REST for account management and binary media.

## Technology And Structure

Quarkus provides REST, GraphQL, OIDC security, scheduling, and health checks. Hibernate ORM handles persistence, Liquibase manages schema changes, and Vert.x supports integration forwarding. Production uses PostgreSQL; development and automated tests use H2.

Sources under `cloud.heiss.dashboard` are organized by responsibility:

| Area | Packages |
| --- | --- |
| Contracts and configuration | `api`, `api.model`, `config` |
| Microsoft data and synchronization | `microsoft`, `calendar`, `photos`, `sync` |
| Database access | `persistence`, `persistence.entity`, `persistence.model` |
| Smart-home integrations | `openhab`, `protect`, `proxy` |
| Authentication and request safeguards | `security` |

Tests mirror these packages. The shared [OpenAPI contract](../openapi.yaml) generates Java REST interfaces and models during compilation; generated sources are build outputs and must not be edited. GraphQL and streaming transports are maintained separately.

## Local Development

Use Java 25 and the included Gradle wrapper. Node.js/npm are also needed for combined builds that include the sibling Angular project.

Run from this directory:

```powershell
.\gradlew.bat prepareDevConfig
.\gradlew.bat quarkusDev
```

`prepareDevConfig` creates missing local backend settings and the Angular development proxy from committed samples, without overwriting existing files. Edit `dev/config/application.properties` before using live integrations. `quarkusDev` also runs this preparation automatically.

Development runs at `http://localhost:8080` with the `dev,h2` profiles and embedded UI hosting disabled. The H2 database and media cache persist under `dev/data/`. Start Angular separately using its README; the development proxy keeps browser requests on one origin.

## Configuration And Identity

The [production sample](../config/application.properties.sample) and [development sample](../config/application-dev.properties.sample) define the available settings and environment overrides. Configuration covers database access, Microsoft credentials, token encryption, Keycloak, media storage, and optional integrations.

Production reads a private `config/application.properties` relative to Java's working directory, or an external file selected with `quarkus.config.locations`. Keep active configuration and secrets outside Git. Only public display and Keycloak connection settings are sent to the frontend. Restart the backend and reload browsers after changing runtime settings; no frontend rebuild is needed.

`dashboard.token-key` (or `DASHBOARD_TOKEN_KEY`) accepts any nonblank secret; use a long, unique passphrase. Token caches use AES-256-GCM with a key derived through PBKDF2-HMAC-SHA256, 600,000 iterations, and a fresh random salt. Keep the configured value unchanged across restarts and upgrades; changing it requires reconnecting Microsoft accounts.

Two identity systems serve different purposes:

- **Microsoft**: A confidential app registration supporting personal accounts grants delegated calendar and file access. Configure a Web redirect URI matching the dashboard's account callback and the delegated permissions `User.Read`, `Calendars.Read`, and `Files.Read`. The backend requests offline access for background synchronization.
- **Keycloak**: A public `dashboard` client uses Authorization Code Flow with PKCE `S256`. Register the frontend's `/auth/callback` redirect, `/home` post-logout redirect, and exact web origin, including `http://localhost:4200` for development. Administrators need the client's `admin` role, and access tokens must include audience `dashboard`. Quarkus validates tokens independently of the browser.

Microsoft accounts are connected and their sources selected in the protected setup view. Background synchronization normally runs every five minutes and retains last-good data when an account fails. Webhooks are optional hints; scheduled reconciliation remains active. LAN-only `home.arpa` names cannot receive public Microsoft webhooks.

## Persistence And Integrations

Liquibase initializes and migrates the database at startup; Hibernate validates the schema. PostgreSQL stores accounts, selected sources, synchronized metadata, and encrypted Microsoft token caches. Binary photos and motion snapshots live in a separate persistent media directory.

Photo-cache budgets default to 10 GiB for originals and 1 GiB for thumbnails. Cleanup is periodic, so allow extra capacity for temporary downloads and motion snapshots. Back up PostgreSQL and the external token-encryption key together; back up motion snapshots if their history matters. Cached OneDrive photos can be downloaded again.

openHAB and go2rtc run separately. Configure their backend-reachable origins and the private openHAB token in backend settings. Camera IDs and labels determine display order and integration mappings; go2rtc streams use `unifi_<cameraId>` and `unifi_<cameraId>_medium`. Motion capture continues without an open browser. Camera signaling passes through Quarkus, but WebRTC media still requires direct connectivity to go2rtc's advertised candidates. Embedded openHAB and EVCC views must be reachable by the browser and allow iframe embedding.

## Build And Quality Checks

```powershell
.\gradlew.bat test
.\gradlew.bat build
.\gradlew.bat spotlessCheck
.\gradlew.bat spotlessApply
```

`build` includes tests, formatting checks, and the production Angular build. Spotless and VS Code share the `Dashboard` Java formatter profile in `etc/java_code_format.xml`; `spotlessApply` rewrites formatting, while `spotlessCheck` only checks it.

Automated tests use isolated H2 databases, Microsoft and OIDC fixtures, and local HTTP/WebSocket servers. Live Microsoft sign-in, Keycloak administration, PostgreSQL deployment, and physical camera connectivity need environment-level verification.

## Packaging And Deployment

Create a combined distribution from this directory:

```powershell
.\gradlew.bat check distributionZip -PreleaseVersion=1.0.0
```

The ZIP in `build/distributions/` contains the full `quarkus-app/` runtime, documentation, and `examples/application.properties`. GitHub Actions builds and checks the application; published releases provide the same layout with checksums.

After extraction, copy the sample to a protected runtime configuration file and replace its placeholders. Do not overwrite existing configuration. Keep the entire `quarkus-app/` directory together and run with Java 25, PostgreSQL, and writable persistent media storage:

```powershell
java -Dquarkus.config.locations=/etc/dashboard/application.properties -jar quarkus-app/quarkus-run.jar
```

Use one backend instance; client notifications are not shared between replicas. Serve the UI and backend through the same HTTPS origin, forwarding requests unchanged with WebSocket support. Trust forwarding headers only from the actual reverse proxy and preserve the public scheme, host, port, and browser origin. Incorrect forwarding can reject legitimate browser requests; keep origin checks enabled.

Keep the deployment on the trusted household network: shared calendar, photo, and camera data are readable without login. Account/source changes and privileged integration operations require administrator access. Never expose backend secrets or upstream credentials in browser configuration or logs.