# Smart Home Dashboard

[![Build](https://github.com/mheiss/dashboard/actions/workflows/build.yml/badge.svg)](https://github.com/mheiss/dashboard/actions/workflows/build.yml)
[![Releases](https://img.shields.io/github/v/release/mheiss/dashboard?label=release)](https://github.com/mheiss/dashboard/releases)
![Java 25](https://img.shields.io/badge/Java-25-007396)
![Angular 22](https://img.shields.io/badge/Angular-22-DD0031)

A dashboard for your household calendars, photos, and smart-home controls.

Smart Home Dashboard brings Microsoft calendars and OneDrive photos together with openHAB, EVCC, and UniFi Protect. Designed for a wall-mounted tablet and just as useful in a browser, it gives the household a common view. A protected admin area handles account connections and source selection.

![Dashboard home screen with a color-coded family agenda, photos from this day in past years, and a travel-photo gallery](docs/images/dashboard-home.png)

*Shared calendar on the left, a look back at this day in past years along with a gallery showing the latest photos on the right. Screenshots show the real app with fictional calendar entries and sample photography, not private household data. The current interface is in German.*

**[Download a release](https://github.com/mheiss/dashboard/releases)** | **[Setup guide](#setup-guide)** | **[Frontend](ui/README.md)** | **[Backend](server/README.md)**

## At A Glance

| Everyday View | What It Brings Together |
| --- | --- |
| Calendar | A color-coded household agenda from selected Microsoft calendars. |
| Photos | OneDrive galleries, a look back at this day in past years, and a full-screen photo viewer. |
| Home controls | openHAB views, EVCC charging information, and UniFi Protect cameras through your existing integrations. |
| Account setup | Admin-only Microsoft account connection and calendar/photo source selection. |

![Full-screen photo viewer displaying a mountain lake with navigation controls and a thumbnail filmstrip](docs/images/dashboard-photo-viewer.png)

Open a photo from the gallery to browse originals in the full-screen viewer. The filmstrip keeps the rest of the collection close at hand.

## Running The Dashboard

The dashboard is intended for a trusted household network, not public internet access. Calendar, photo, and camera viewing do not require sign-in; configuration and privileged actions require an administrator. Fully Kiosk Browser is supported for wall-mounted tablets, and the interface also adapts to desktop and mobile browsers.

## Setup Guide

This guide installs a downloaded release on a Windows or Linux machine. The machine must stay running while other devices use the dashboard. No source checkout, frontend build, Node.js, or Gradle installation is needed.

### 1. Prepare Your Machine

Install these prerequisites using their official instructions:

- [Java 25](https://adoptium.net/temurin/releases/): Check that `java -version` reports version 25.
- [PostgreSQL](https://www.postgresql.org/download/): Start the database service and retain access to its administrator account.
- [Caddy](https://caddyserver.com/docs/install), or an existing HTTPS reverse proxy. The example below uses Caddy on the same machine as the dashboard.
- A running [Keycloak](https://www.keycloak.org/getting-started/getting-started-zip) installation with administrator access and an HTTPS URL trusted by both the browser and the dashboard's Java runtime. Keycloak is separate software and is not included in the ZIP.

The examples use `https://dashboard.home.arpa` for the dashboard and `https://login.home.arpa` for Keycloak. Configure your household DNS so each name resolves to the machine hosting that service. For a single-machine trial, hosts-file entries can be used instead, but they must also be added on every viewing device. Replace the example hostnames consistently if using different names.

Allow HTTPS access from your household network only. Do not expose the dashboard or its database to the internet. Leave enough writable disk space for the default 10 GiB original-photo cache, 1 GiB thumbnail cache, and additional snapshots and temporary downloads.

### 2. Download And Extract A Release

From [GitHub Releases](https://github.com/mheiss/dashboard/releases), download the application ZIP, not GitHub's source-code archive. The commands below use `v1.0.0` as an example; substitute the actual downloaded version and filename.

On **Windows**, open PowerShell in the download directory:

```powershell
New-Item -ItemType Directory -Force "$HOME\dashboard\releases", "$HOME\dashboard\config", "$HOME\dashboard\media"
Expand-Archive .\dashboard-v1.0.0.zip -DestinationPath "$HOME\dashboard\releases\v1.0.0"
```

On **Linux**, open a terminal in the download directory:
Install `unzip` if needed, then extract the release:

```bash
mkdir -p "$HOME/dashboard/releases/v1.0.0" "$HOME/dashboard/config" "$HOME/dashboard/media"
unzip dashboard-v1.0.0.zip -d "$HOME/dashboard/releases/v1.0.0"
```

Use a new release directory rather than extracting over an existing installation. Keep the entire `quarkus-app/` directory together; its runner JAR cannot run on its own.

### 3. Create The Database

Open PostgreSQL's SQL Shell (`psql`) as its administrator on Windows, or run `sudo -u postgres psql` on Linux. For a new installation, enter:

```sql
CREATE ROLE dashboard LOGIN;
\password dashboard
CREATE DATABASE dashboard OWNER dashboard;
\connect dashboard
GRANT USAGE, CREATE ON SCHEMA public TO dashboard;
\q
```

Choose a database password at the prompt and retain it for step 6. Skip creating the role or database if they already exist. The application initializes its own tables on startup; it should not run as a PostgreSQL superuser.

### 4. Register The Microsoft Application

In the [Microsoft Entra admin center](https://entra.microsoft.com/):

1. Create an app registration with an account type that includes **personal Microsoft accounts**.
2. Add a **Web** redirect URI of `https://dashboard.home.arpa/api/accounts/callback`, not a SPA redirect.
3. Record the application (client) ID. Create a client secret and retain its **Value**, not its Secret ID; note its expiry date.
4. Add Microsoft Graph **delegated** permissions `User.Read`, `Calendars.Read`, and `Files.Read`. The dashboard also requests `offline_access` for background synchronization.

This registration lets the server connect household Microsoft accounts. Those accounts are connected later through the dashboard, not entered into its configuration file.

### 5. Configure Administrator Sign-In

In the Keycloak administration console:

1. Create or select a realm named `dashboard`. Its example issuer URL is `https://login.home.arpa/realms/dashboard`.
2. Create an **OpenID Connect** client with client ID `dashboard`. Turn **Client authentication** off, enable **Standard flow**, disable implicit and direct-access grants, and require PKCE method `S256`.
3. Set the valid redirect URI to `https://dashboard.home.arpa/auth/callback`, the valid post-logout redirect URI to `https://dashboard.home.arpa/home`, and Web origins to exactly `https://dashboard.home.arpa`. Avoid wildcards.
4. Under the client's **Roles**, create `admin`. Create a user with a password and assign that user the `dashboard` client's `admin` role. A realm role named `admin` is not sufficient.
5. Under **Client scopes > dashboard-dedicated**, add a mapper **By configuration > Audience**. Set **Included Client Audience** to `dashboard` and enable **Add to access token**. Ensure client roles are also included in access tokens.

Keycloak controls dashboard administration; it does not replace the Microsoft registration. Everyday viewing does not require a Keycloak login.

### 6. Configure The Dashboard

For a **first installation only**, copy the release sample into your private configuration directory. Do not overwrite existing settings.

**Windows (PowerShell):**

```powershell
Copy-Item "$HOME\dashboard\releases\v1.0.0\examples\application.properties" "$HOME\dashboard\config\application.properties"
notepad "$HOME\dashboard\config\application.properties"
```

**Linux:**

```bash
chmod 700 "$HOME/dashboard/config" "$HOME/dashboard/media"
cp -i "$HOME/dashboard/releases/v1.0.0/examples/application.properties" "$HOME/dashboard/config/application.properties"
chmod 600 "$HOME/dashboard/config/application.properties"
nano "$HOME/dashboard/config/application.properties"
```

The table below covers every active setting in the copied sample. Replace all `REPLACE_...` placeholders and adjust paths, hostnames, and other values to match your installation. Defaults can stay unchanged where they match this setup.

| Setting | Value For This Setup |
| --- | --- |
| `dashboard.token-key` | Replace `REPLACE_SAVED_TOKEN_KEY` with your own long, unique password or passphrase. Keep this secret private and retain a secure backup. Changing or losing it prevents decryption of stored Microsoft tokens and requires reconnecting accounts. |
| `dashboard.media-directory` | Absolute path to the media directory created in step 2. Use forward slashes, for example `C:/Users/YourName/dashboard/media` on Windows or `/home/yourname/dashboard/media` on Linux; substitute your actual home directory. |
| `dashboard.zone` | Your household's time zone, for example `Europe/Vienna`. |
| `dashboard.microsoft.client-id` | Replace `REPLACE_MICROSOFT_CLIENT_ID` with the application (client) ID from step 4. |
| `dashboard.microsoft.client-secret` | Replace `REPLACE_MICROSOFT_CLIENT_SECRET_VALUE` with the client secret's **Value** from step 4, not its Secret ID. |
| `dashboard.microsoft.redirect-uri` | `https://dashboard.home.arpa/api/accounts/callback` |
| `quarkus.datasource.jdbc.url` | `jdbc:postgresql://localhost:5432/dashboard` |
| `quarkus.datasource.username` | `dashboard` |
| `quarkus.datasource.password` | Replace `REPLACE_DATABASE_PASSWORD` with the password you chose for the `dashboard` database role in step 3. |
| `quarkus.oidc.auth-server-url` | `https://login.home.arpa/realms/dashboard` |
| `quarkus.oidc.token.audience` | `dashboard` |
| `quarkus.http.host` | `127.0.0.1`, keeping the backend reachable only by the local reverse proxy. |
| `quarkus.http.port` | `8080`, matching the reverse proxy's backend port in step 7. |

For the same-machine reverse proxy, enable these properties, replacing any sample trusted-proxy value:

```properties
quarkus.http.proxy.proxy-address-forwarding=true
quarkus.http.proxy.allow-forwarded=false
quarkus.http.proxy.allow-x-forwarded=true
quarkus.http.proxy.enable-forwarded-host=true
quarkus.http.proxy.trusted-proxies=127.0.0.1,::1
```

Leave optional integrations commented out initially. Leave the Microsoft webhook URL unset: scheduled synchronization works on a private LAN, and `home.arpa` cannot receive public Microsoft webhooks. Keep the properties file private, readable only by the application user and administrators, and never commit it to Git.

### 7. Enable HTTPS

For Caddy on the same machine, add this site to its Caddyfile:

```caddyfile
dashboard.home.arpa {
	tls internal
	reverse_proxy 127.0.0.1:8080
}
```

Validate the file with `caddy validate --config /path/to/Caddyfile`, then start or reload Caddy using its installation instructions. Caddy forwards requests and WebSocket upgrades without additional path rewrites.

The `tls internal` setting uses Caddy's private certificate authority. Follow [Caddy's local HTTPS instructions](https://caddyserver.com/docs/automatic-https#local-https) to install its **public root certificate** in the trust store of the host and each tablet, phone, or browser that will use the dashboard.

### 8. Start And Connect Your Accounts

Start the downloaded application in a terminal. Keep this terminal open during the initial setup.

**Windows (PowerShell):**

```powershell
java "-Dquarkus.config.locations=$HOME/dashboard/config/application.properties" -jar "$HOME/dashboard/releases/v1.0.0/quarkus-app/quarkus-run.jar"
```

**Linux:**

```bash
java -Dquarkus.config.locations="$HOME/dashboard/config/application.properties" -jar "$HOME/dashboard/releases/v1.0.0/quarkus-app/quarkus-run.jar"
```

The first startup initializes the database schema. In another terminal, check `http://127.0.0.1:8080/q/health/ready` with `curl --fail` on Linux or `Invoke-RestMethod` on Windows; expect status `UP`.

1. Open `https://dashboard.home.arpa/home` without certificate warnings.
2. Open settings and sign in with your Keycloak administrator user.
3. Open Setup and connect each household member's Microsoft account.
4. Select the calendars and enable OneDrive folders to display, using drive-relative paths such as `Pictures/Camera Roll`.
5. Allow time for the first synchronization; subsequent synchronization normally runs every five minutes. Open the same dashboard URL on your tablet or other viewing devices.

Stop the foreground application with `Ctrl+C`. For continuous use, configure a service manager such as systemd on Linux or a Windows service wrapper to run the same Java command. Use a dedicated non-administrator account with read access to the application and configuration and write access to the media directory. The service should start after PostgreSQL and restart after failures.

### 9. Add Optional Integrations

Once calendars and photos work, edit the optional sections in your private properties file for openHAB, EVCC, and cameras. These services are not included in the release. Set backend-reachable openHAB/go2rtc addresses and keep the openHAB token on the server. Camera streams in go2rtc must match the configured IDs, using `unifi_<cameraId>` and `unifi_<cameraId>_medium`.

Embedded openHAB and EVCC pages must be reachable from viewing devices over HTTPS and allow iframe embedding. WebRTC media connectivity is required in addition to camera signaling. Restart the dashboard and reload the browser after configuration changes; navigation automatically includes configured integrations.

### Maintenance And Common Problems

Back up PostgreSQL, the private configuration, and the token-encryption key. Back up motion snapshots if their history matters; cached OneDrive photos can be downloaded again. For updates, verify and extract the new release into a separate directory, stop the application, and change the Java command to the new runner path while retaining configuration and data. Back up before first starting a new version, since startup may migrate the database.

| Problem | What To Check |
| --- | --- |
| Application will not start | Java 25, complete release extraction, database availability, correct configuration path, and unreplaced placeholders. Read the terminal output. |
| Browser cannot open the dashboard | Household DNS, Caddy/proxy status, LAN firewall rules, and certificate trust on the viewing device. |
| Microsoft account connection fails | Exact Web redirect URI, client ID, secret **value** and expiry, and supported account type. |
| Administrator login fails or requests are unauthorized | Keycloak realm, redirect/web-origin allowlists, client role `admin`, and access-token audience `dashboard`. Sign in again after changing mappings. |
| Browser requests or camera connections fail only behind the proxy | Trusted proxy address, public forwarding headers, and WebSocket support. Keep origin checks enabled. |
| Calendar or gallery is empty | Connected accounts, enabled sources, folder paths, synchronization status, and enough free disk space. |

## Project Documentation

- [Frontend](ui/README.md): Angular application structure, UI responsibilities, and local development.
- [Backend](server/README.md): Quarkus services, persistence, configuration, builds, and deployment considerations.

The backend README is also included as `BACKEND.md` in release archives; source-directory links above apply to the repository.

Every push and pull request runs **Build** and produces a downloadable deployment artifact. Publishing a GitHub Release builds its tag and attaches the application ZIP and `SHA256SUMS`. You do not need these pipelines to use a downloaded release.


## Demo Photography Credits

Sample photographs are from [Unsplash](https://unsplash.com/license). Original image sources used in these staged screenshots:

- [Desert road](https://images.unsplash.com/photo-1500530855697-b586d89ba3ee)
- [Boat on a mountain lake](https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1)
- [Lakeside cabin](https://images.unsplash.com/photo-1470770841072-f978cf4d019e)
- [Mountain panorama](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b)
- [Turquoise lake](https://images.unsplash.com/photo-1501785888041-af3ef285b470)
- [Forest sunlight](https://images.unsplash.com/photo-1441974231531-c6227db76b6e)
- [Wildlife in the forest](https://images.unsplash.com/photo-1472396961693-142e6e269027)
- [Stars over the mountains](https://images.unsplash.com/photo-1519681393784-d120267933ba)
- [Beach at sunset](https://images.unsplash.com/photo-1507525428034-b723cf961d3e)
- [Ocean waves](https://images.unsplash.com/photo-1518837695005-2083093ee35b)
- [Mountain landscape](https://images.unsplash.com/photo-1469474968028-56623f02e42e)
- [Evening light](https://images.unsplash.com/photo-1500534623283-312aade485b7)

</details>
