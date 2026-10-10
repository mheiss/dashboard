# Smart Home Dashboard

A household dashboard for calendars, OneDrive photos, openHAB controls, EVCC charging information, and UniFi Protect cameras. The downloaded application includes both the backend and the browser interface. Microsoft synchronization and photo processing run on the backend.

## Start From A Downloaded Release

This guide assumes you have downloaded the application ZIP from GitHub and have not configured the dashboard before. Examples use Windows and PowerShell 7, with the application, PostgreSQL, and Caddy on the same computer. For Linux directory layout and boot-time startup, see [Linux Service Setup](#linux-service-setup); the database, Microsoft registration, and HTTPS requirements below still apply.

### 1. Install The Required Software

Install these separately; they are not included in the ZIP:

- **Java 25**: install a Java 25 runtime or JDK, for example [Eclipse Temurin](https://adoptium.net/temurin/releases/), and add Java to PATH.
- **PostgreSQL**: install a supported version from [postgresql.org](https://www.postgresql.org/download/). Keep the administrator password chosen during installation. Leave the default port, `5432`, unless another installation already uses it.
- **Caddy**: install [Caddy](https://caddyserver.com/docs/install) and add it to PATH. It provides HTTPS in front of the dashboard.
- **PowerShell 7**: use [PowerShell](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows) for these commands.

Open a new PowerShell window and check:

```powershell
java -version
caddy version
$PSVersionTable.PSVersion
```

Java must report version 25. PostgreSQL must be running. The dashboard computer and client devices need internet access for Microsoft sign-in and synchronization.

### 2. Extract The Application

Use the application ZIP from the GitHub Release's **Assets**, such as `dashboard-v1.0.0.zip`. Extract the application into a permanent directory, for example `C:\dashboard`. It should contain:

```text
C:\dashboard\
  README.md
  BACKEND.md
    examples\
        application.properties
        config.json
  quarkus-app\
    quarkus-run.jar
    app\
    lib\
    quarkus\
```

Keep the **entire** `quarkus-app` directory together. The runner JAR cannot run by itself. Older releases may contain only the backend README; their archive layout and capabilities depend on that release.

For the remaining commands, work from the extracted directory:

```powershell
Set-Location C:\dashboard
```

### 3. Choose Your Dashboard Address

This guide uses `https://dashboard.home.arpa`. Replace that hostname consistently if you choose another one.

Configure your router's local DNS so `dashboard.home.arpa` resolves to the dashboard computer's LAN IP address. Give that computer a reserved/static LAN address. Every browser and tablet must be able to resolve the hostname. A hosts-file entry works for an individual computer, but does not configure your tablet.

Check from a client computer:

```powershell
Resolve-DnsName dashboard.home.arpa
```

Keep the dashboard on your household network. Do not forward its ports from your router to the internet. Microsoft account connection works through the browser and does not require a public dashboard server.

Dashboard viewing, calendar data, and photos require no authentication. Anyone who can reach the server can read them; restrict network access accordingly. Account/source setup remains protected by the local admin login.

### 4. Create The Database

Open PostgreSQL's **SQL Shell (psql)** and connect to the local server as the administrator, usually `postgres`. Alternatively, if `psql` is on PATH:

```powershell
psql --host localhost --username postgres --dbname postgres
```

At the SQL prompt, run:

```sql
CREATE ROLE dashboard LOGIN;
```

Use psql's password prompt to choose a strong database password:

```text
\password dashboard
```

Create the database owned by the application role:

```sql
CREATE DATABASE dashboard OWNER dashboard;
```

Connect to that database before granting schema privileges:

```text
\connect dashboard
```

```sql
GRANT USAGE, CREATE ON SCHEMA public TO dashboard;
SELECT has_schema_privilege('dashboard', 'public', 'USAGE') AS can_use,
       has_schema_privilege('dashboard', 'public', 'CREATE') AS can_create;
```

Both results must be `t` (true). Database privileges alone do not grant permission to create tables in a schema; Liquibase needs these schema privileges to initialize the application.

If you already created the database and role using the earlier instructions, **do not recreate them**. Connect as the database administrator to the existing `dashboard` database and run only the schema grant and verification query above. This fixes `permission denied for schema public` without deleting data. Grant privileges to the application role, not to every user (`PUBLIC`), and do not make it a superuser.

Exit psql with `\q`. Remember the new `dashboard` database password. The application creates its tables on first startup using Liquibase. Do not create tables manually or use the administrator database account for the application.

### 5. Edit The Public UI Settings

For a **first installation only**, create the active file from the included sample. Do not overwrite an existing configured file:

```powershell
New-Item -ItemType Directory -Force .\config | Out-Null
Copy-Item .\examples\config.json .\config\config.json
notepad .\config\config.json
```

For a first installation using **Method A** in step 7, you can instead copy the entire `examples` folder to `config` with `Copy-Item .\examples .\config -Recurse`, provided `config` does not already exist. No file renaming is needed. For **Method B**, copy only the public JSON as shown above; the example backend properties contain placeholders and would override some environment-based defaults if copied into the active configuration directory.

Replace the sample values with your installation's settings:

| Setting | What to enter |
| --- | --- |
| `openhab.sitemap` | The full openHAB Basic UI URL to display. |
| `openhab.items.security`, `pin`, `doorbell` | Your corresponding openHAB item names. |
| `openhab.doorbellCamera` | A camera ID from `protect.cameras`. |
| `evcc.url` | The full URL of your EVCC interface. |
| `protect.cameras` | Camera IDs mapped to display names; order determines display order. |

Keep valid JSON: double-quoted strings, no comments, and no trailing commas.

The browser fetches these settings through the backend's public `/config` endpoint. **Never put passwords, API tokens, or Microsoft secrets in this file.** Microsoft calendar and OneDrive selection happens in the admin setup screen later, not in this JSON.

openHAB, EVCC, and go2rtc are separate applications, not installed by the dashboard. Their views will not work until those services and settings are configured. Embedded openHAB and EVCC URLs must be reachable from the tablet, allow iframe embedding, and use HTTPS when the dashboard uses HTTPS.

### 6. Register A Microsoft Application

To display calendars and OneDrive photos, register an application in the [Microsoft Entra admin center](https://entra.microsoft.com/):

1. Open **App registrations**, select **New registration**, and name it, for example `Dashboard`. If your account cannot create registrations, you need access to an Entra tenant that permits it.
2. Choose an account type including **personal Microsoft accounts**, such as organizational directories and personal accounts. This dashboard currently uses Microsoft's personal-account sign-in authority.
3. Add a **Web** redirect URI: `https://dashboard.home.arpa/accounts/callback`. Do not choose the SPA platform; use this exact backend callback path.
4. Copy the **Application (client) ID** from the overview.
5. Under **Certificates & secrets**, create a client secret. Store its **Value**, not its Secret ID, in a password manager. The value is only shown when created; record its expiry and renew it before it expires.
6. Under **API permissions**, add Microsoft Graph **delegated** permissions: `User.Read`, `Calendars.Read`, and `Files.Read`. Do not use application permissions. The dashboard also requests `offline_access` for background refresh.

Use exactly the same callback URL in the registration and application configuration below. Each household owner will consent when connecting their Microsoft account.

### 7. Configure The Application

Choose **Method A (a file)** for a persistent, easy-to-maintain installation, or **Method B (environment variables)** if a service manager or secret manager supplies your settings. Both methods use the same launch command and need no rebuild.

#### Method A: Configuration File (Recommended)

Quarkus automatically reads `config/application.properties` relative to the directory where you start Java. The ZIP includes an inactive `examples/application.properties` with all the settings needed for this guide. Samples are kept outside `config` so Quarkus does not scan them as configuration sources.

For a **first installation only**, copy the sample from the extracted directory and edit it. Do not overwrite an existing configured file:

```powershell
Set-Location C:\dashboard
New-Item -ItemType Directory -Force .\config | Out-Null
Copy-Item .\examples\application.properties .\config\application.properties
notepad .\config\application.properties
```

Replace every `REPLACE_...` placeholder:

| Sample value | What to enter |
| --- | --- |
| `REPLACE_DATABASE_PASSWORD` | The `dashboard` database password from step 4. |
| `REPLACE_ADMIN_PASSWORD` | A new local admin password of at least 12 characters. |
| `REPLACE_MICROSOFT_CLIENT_ID` | The Application (client) ID from step 6. |
| `REPLACE_MICROSOFT_CLIENT_SECRET_VALUE` | The client secret **Value**, not its Secret ID. |
| `REPLACE_SAVED_TOKEN_KEY`, `REPLACE_SAVED_SESSION_KEY` | Two independent keys, generated once as described below. |

The sample uses property names, not environment-variable names. For example:

```properties
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/dashboard
quarkus.datasource.username=dashboard
quarkus.datasource.password=REPLACE_DATABASE_PASSWORD
dashboard.allowed-origins=https://dashboard.home.arpa
dashboard.ui-config-file=config/config.json
dashboard.media-directory=C:/dashboard-data/media
dashboard.microsoft.redirect-uri=https://dashboard.home.arpa/accounts/callback
```

Adjust the hostname, database connection, timezone, and paths in the complete sample if needed. The local setup login is `admin`, not a Microsoft account. Dashboard viewing requires no login.

For a **first installation only**, generate the two keys in a private PowerShell terminal:

```powershell
$tokenKey = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$sessionKey = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$tokenKey
$sessionKey
```

Put the first value in `dashboard.token-key` and the second in `quarkus.http.auth.session.encryption-key`. Back them up securely and clear the terminal display. For an existing installation, use the **saved original keys**; never regenerate them just to switch configuration methods.

Save as exactly `application.properties`, not `application.properties.txt`. Values are not surrounded by quotes. Use forward slashes for Windows paths as in the sample; backslashes are escape characters in Java properties files. Escape literal backslashes as `\\` and literal `${` as `\\${` when present in a value; `${...}` otherwise denotes a configuration expression.

Create the sample's media directory:

```powershell
New-Item -ItemType Directory -Force C:\dashboard-data\media | Out-Null
```

The active file contains **plaintext secrets**. Restrict access to the account running Java and necessary administrators, keep it out of Git and shared folders, and back it up securely. It is separate from public `config/config.json` and is **not** returned by `/config`. Release archives include only the placeholder sample, never the active properties file.

On later starts, Java reads the active file automatically; no environment assignments are needed. Restart Java after editing application properties. Public UI JSON edits still need only a browser reload.

#### Method B: Environment Variables

In the PowerShell window you will use to run Java, set the following values. Masked prompts do not echo passwords or put their values into command history:

```powershell
$env:DASHBOARD_DB_URL = 'jdbc:postgresql://localhost:5432/dashboard'
$env:DASHBOARD_DB_USER = 'dashboard'
$env:DASHBOARD_DB_PASSWORD = Read-Host 'Database password from step 4' -MaskInput

$env:DASHBOARD_ADMIN_PASSWORD = Read-Host 'Choose the local admin password (at least 12 characters)' -MaskInput

$env:DASHBOARD_ALLOWED_ORIGINS = 'https://dashboard.home.arpa'
$env:DASHBOARD_UI_BASE_PATH = '/'
$env:DASHBOARD_UI_CONFIG_FILE = 'C:\dashboard\config\config.json'
$env:DASHBOARD_MEDIA_DIRECTORY = 'C:\dashboard-data\media'

$env:MICROSOFT_CLIENT_ID = Read-Host 'Microsoft Application (client) ID'
$env:MICROSOFT_CLIENT_SECRET = Read-Host 'Microsoft client secret VALUE' -MaskInput
$env:MICROSOFT_REDIRECT_URI = 'https://dashboard.home.arpa/accounts/callback'

$env:QUARKUS_HTTP_HOST = '127.0.0.1'
$env:QUARKUS_HTTP_PORT = '8080'
$env:QUARKUS_HTTP_PROXY_PROXY_ADDRESS_FORWARDING = 'true'
$env:QUARKUS_HTTP_PROXY_ALLOW_FORWARDED = 'false'
$env:QUARKUS_HTTP_PROXY_ALLOW_X_FORWARDED = 'true'
$env:QUARKUS_HTTP_PROXY_TRUSTED_PROXIES = '127.0.0.1,::1'

New-Item -ItemType Directory -Force $env:DASHBOARD_MEDIA_DIRECTORY | Out-Null
```

The database and admin passwords are separate credentials. The local setup username is `admin`, not a Microsoft account. Dashboard viewing requires no login.

Generate two independent encryption keys **once, for the first installation**:

```powershell
$env:DASHBOARD_TOKEN_KEY = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:DASHBOARD_SESSION_KEY = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Record both generated values securely in a password manager. To view them for that purpose, use `$env:DASHBOARD_TOKEN_KEY` and `$env:DASHBOARD_SESSION_KEY` in a private terminal, then clear the display. Do not share terminal screenshots or put these values in the public JSON.

These assignments last only in this PowerShell session. Before closing it, arrange to restore the same settings from protected configuration or a secret manager. On later starts, restore the keys rather than regenerating them:

```powershell
$env:DASHBOARD_TOKEN_KEY = Read-Host 'Saved token encryption key' -MaskInput
$env:DASHBOARD_SESSION_KEY = Read-Host 'Saved session encryption key' -MaskInput
```

#### Shared Rules And Overrides

For **either method**, losing or changing the token key makes stored Microsoft credentials unreadable. Changing the session key signs out all devices. Changing bootstrap password settings does not change passwords for users already created in the database.

Avoid configuring the same setting in several places. Environment variables for the **same property** normally override the external file, which overrides bundled defaults. Java `-D` system properties have higher priority still. Some aliases in Method B only feed bundled defaults. To override these file properties explicitly, use:

| File property | Direct environment override |
| --- | --- |
| `quarkus.datasource.jdbc.url` | `QUARKUS_DATASOURCE_JDBC_URL` |
| `quarkus.datasource.username` | `QUARKUS_DATASOURCE_USERNAME` |
| `quarkus.datasource.password` | `QUARKUS_DATASOURCE_PASSWORD` |
| `quarkus.http.auth.session.encryption-key` | `QUARKUS_HTTP_AUTH_SESSION_ENCRYPTION_KEY` |
| `dashboard.microsoft.client-id` | `DASHBOARD_MICROSOFT_CLIENT_ID` |
| `dashboard.microsoft.client-secret` | `DASHBOARD_MICROSOFT_CLIENT_SECRET` |
| `dashboard.microsoft.redirect-uri` | `DASHBOARD_MICROSOFT_REDIRECT_URI` |

For example, `DASHBOARD_DB_PASSWORD` supplies the bundled password default; it does not replace an explicit `quarkus.datasource.password` in the external file. When switching methods, remove unused conflicting settings and retain the original encryption keys.

Leave `dashboard.microsoft.webhook-url` absent in Method A, or `MICROSOFT_WEBHOOK_URL` unset in Method B. Scheduled synchronization works without a public webhook. The default timezone is `Europe/Vienna`; change `dashboard.zone` in the file or `DASHBOARD_ZONE` in the environment for another timezone.

### 8. Set Up HTTPS With Caddy

Create a file named `Caddyfile` in `C:\dashboard` with this content:

```caddyfile
dashboard.home.arpa {
    tls internal
    reverse_proxy 127.0.0.1:8080
}
```

This serves the embedded UI at `/` and all dashboard endpoints through one HTTPS origin. Do not configure a separate frontend directory or rewrite/strip paths. Backend endpoints such as `/config`, `/graphql`, and `/accounts/callback` keep their existing paths.

In a **second** PowerShell window, run:

```powershell
Set-Location C:\dashboard
caddy validate --config .\Caddyfile --adapter caddyfile
caddy run --config .\Caddyfile --adapter caddyfile
```

Keep this window open. Allow Caddy's HTTPS port `443` and HTTP redirect port `80` through the Windows firewall for the private household network only. Java's port `8080` is bound to loopback and must not be exposed.

`tls internal` uses Caddy's local certificate authority. Install its **root certificate** in the trusted certificate store of every computer/tablet browser using the dashboard. It is in Caddy's data directory, typically `%APPDATA%\Caddy\pki\authorities\local\root.crt` for an interactive Windows installation. A service account may use a different directory. Copy only the public root certificate, never its private key.

The browser must open the chosen HTTPS address without a certificate warning before Microsoft sign-in. Do not rely on clicking through certificate errors. An existing trusted HTTPS proxy or a domain with a publicly trusted certificate can replace this local CA setup.

### 9. Start The Dashboard

With Method A, open a PowerShell window; with Method B, return to the window where you set the environment. In either case, start from the extracted directory so Java finds `config/application.properties` and the default public JSON:

```powershell
Set-Location C:\dashboard
java -jar .\quarkus-app\quarkus-run.jar
```

Leave it running. First startup connects to PostgreSQL, creates the schema, and creates the local administrator. Wait for the Quarkus startup message before opening the UI. Fix any startup error before continuing.

From another PowerShell window, check:

```powershell
Invoke-RestMethod https://dashboard.home.arpa/config
```

It should return the public UI settings without requesting a login. This also checks HTTPS trust and proxy routing. Now open:

```text
https://dashboard.home.arpa/home
```

Click the settings icon and enter the local admin password from step 7 in the popup. No username is needed. After login, account setup opens. Do not enter a Microsoft password in this popup.

### 10. Connect Accounts And Select Data

Open `https://dashboard.home.arpa/setup` while signed in as admin:

1. Select **Konto verbinden** (connect account).
2. Sign in on Microsoft's page with the personal account holding your calendars/photos and accept the requested permissions.
3. Back in setup, select the checkboxes for calendars to display and choose their colors with the adjacent selectors.
4. Enter a OneDrive folder path relative to the account's drive root, such as `Pictures/Camera Roll`, and add it with the plus button. Enable its checkbox; new sources are disabled until selected.
5. Repeat for other household members' personal Microsoft accounts if needed.
6. Use the synchronize button, or wait for scheduled synchronization. It runs about every five minutes; a large initial photo collection can take longer.

Open `https://dashboard.home.arpa/home` to check calendars and photos. Empty views before accounts are connected and sources selected are expected. Originals are downloaded only when requested; the backend caches photo data and media on disk.

For the wall tablet, open `https://dashboard.home.arpa/home` without signing in. Account/source setup still requires the local admin login. If using Fully Kiosk Browser, use that URL as its start URL and install the Caddy root certificate on the tablet first.

### 11. Enable Optional Smart-Home Integrations

The minimal Caddyfile forwards everything to Quarkus. openHAB and camera controls additionally need paths routed to their respective services. If using those features, replace the Caddyfile with a configuration like this and substitute your upstream addresses:

```caddyfile
dashboard.home.arpa {
    tls internal

    handle_path /api/openhab/* {
        rewrite * /rest{path}
        reverse_proxy openhab.example.lan:8080
    }

    handle_path /ws/openhab* {
        rewrite * /ws{path}
        reverse_proxy openhab.example.lan:8080
    }

    handle_path /api/webrtc* {
        rewrite * /api{path}
        reverse_proxy 127.0.0.1:1984 {
            header_up -Origin
        }
    }

    handle {
        reverse_proxy 127.0.0.1:8080
    }
}
```

Validate and reload after editing, in a terminal with access to Caddy's local administration endpoint:

```powershell
caddy validate --config C:\dashboard\Caddyfile --adapter caddyfile
caddy reload --config C:\dashboard\Caddyfile --adapter caddyfile
```

If openHAB requires authentication, configure the proxy's REST authorization and WebSocket authentication headers according to your openHAB installation; this routing example does not supply credentials. Keep credentials on the proxy, not in public UI settings. Do not disable authentication to make the example work.

Configure [go2rtc](https://github.com/AlexxIT/go2rtc/) separately with stream names `unifi_<cameraId>` and `unifi_<cameraId>_medium`, for example `unifi_entry` and `unifi_entry_medium`. IDs must match `protect.cameras`. Set the EVCC and openHAB iframe URLs to their browser-reachable HTTPS addresses.

Public JSON edits require only a browser reload. Application properties or environment changes require restarting Java with those settings. Proxy routing changes require reloading Caddy.

## Linux Service Setup

Use systemd on Linux with a Java 25 runtime, PostgreSQL, and a separately configured HTTPS reverse proxy such as Caddy. No Gradle or Node.js is required on the deployment machine. Verify that `/usr/bin/java -version` reports Java 25; if Java is installed elsewhere, substitute its absolute path in the unit below.

### Recommended Directories

Keep binaries, configuration, and writable data separate:

```text
/opt/dashboard/
    releases/
        1.2.3/
            examples/
            quarkus-app/
                quarkus-run.jar
                app/
                lib/
                quarkus/
    latest -> /opt/dashboard/releases/1.2.3
/etc/dashboard/
    application.properties
    config.json
/var/lib/dashboard/
    media/
```

- `/opt/dashboard`: root-owned application installations, readable but not writable by the service account. Keep the entire `quarkus-app` directory together. Point `latest` at the extracted release directory, not at `quarkus-app` itself.
- `/etc/dashboard`: root-managed configuration. The private properties file contains secrets; public `config.json` must not contain credentials. Neither file is generated or rewritten by the application.
- `/var/lib/dashboard`: persistent writable application state. Cached media lives in `media`; PostgreSQL manages its own database storage separately. Logs go to the system journal, not this directory.

The working directory only sets the base for relative paths; it does not itself cause writes. Use `/var/lib/dashboard`, not `/etc/dashboard`, as the working directory so relative data paths do not point into the configuration directory.

### Account And Configuration

For a first installation, create a dedicated account and directories. Skip `useradd` if the account already exists:

```bash
sudo useradd --system --user-group --home-dir /var/lib/dashboard --shell /usr/sbin/nologin dashboard
sudo install -d -o root -g dashboard -m 0750 /etc/dashboard
sudo install -d -o dashboard -g dashboard -m 0750 /var/lib/dashboard /var/lib/dashboard/media
```

Ensure the account can traverse and read the release directories and all application files. Extract releases as an administrator and do not give the service account write access to `/opt/dashboard`.

For a **first installation only**, copy the inactive samples from the release. These commands replace destination files, so do not run them over an existing configuration:

```bash
sudo install -o root -g dashboard -m 0640 /opt/dashboard/latest/examples/application.properties /etc/dashboard/application.properties
sudo install -o root -g dashboard -m 0640 /opt/dashboard/latest/examples/config.json /etc/dashboard/config.json
sudoedit /etc/dashboard/application.properties
sudoedit /etc/dashboard/config.json
```

Replace every backend placeholder using the database, admin, Microsoft, and encryption-key settings described above. For existing installations, preserve the original token and session keys. Set these Linux paths, replacing the sample's Windows media path:

```properties
dashboard.ui-config-file=/etc/dashboard/config.json
dashboard.media-directory=/var/lib/dashboard/media
```

Keep `quarkus.http.host=127.0.0.1` when the HTTPS reverse proxy is on the same machine. Configure the actual dashboard origin and Microsoft redirect URI, and retain the sample's proxy trust settings only if they match your proxy deployment. The service does not inherit environment variables from your interactive shell; this setup supplies runtime settings through the protected properties file.

### Systemd Unit

Create `/etc/systemd/system/dashboard.service` with:

```ini
[Unit]
Description=Smart Home Dashboard
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=dashboard
Group=dashboard
StateDirectory=dashboard
StateDirectoryMode=0750
WorkingDirectory=/var/lib/dashboard
ExecStart=/usr/bin/java -Dquarkus.config.locations=/etc/dashboard/application.properties -jar /opt/dashboard/latest/quarkus-app/quarkus-run.jar
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

`quarkus.config.locations` explicitly loads `/etc/dashboard/application.properties`; it does not rely on automatic discovery under the working directory's `config/` subdirectory. `StateDirectory=dashboard` creates and assigns `/var/lib/dashboard` to the service account and keeps it writable despite `ProtectSystem=strict`. The installation and configuration remain read-only to the process. Temporary files use the service's private temporary directory.

PostgreSQL must be available before the application can finish startup. `network-online.target` does not guarantee that the database is ready; `Restart=on-failure` retries failed starts. If using local PostgreSQL, you can add its distribution-specific systemd unit to `After=`. Manage Caddy separately and forward the dashboard origin to `127.0.0.1:8080`; do not expose the dashboard directly to the internet.

Validate the unit, enable startup at boot, and inspect startup logs:

```bash
sudo systemd-analyze verify /etc/systemd/system/dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable --now dashboard
sudo systemctl status dashboard
sudo journalctl -u dashboard -f
```

Check the backend and then the HTTPS proxy:

```bash
curl --fail http://127.0.0.1:8080/q/health/ready
curl --fail https://dashboard.home.arpa/config
```

Use your configured hostname and ensure the client's trust store includes the proxy's CA when using a private CA. First startup runs database migrations and creates the admin user; wait for successful startup before connecting Microsoft accounts.

### Restart And Upgrade

After editing backend properties, run `sudo systemctl restart dashboard`. Public JSON edits need only a browser reload. After editing the service unit, run `sudo systemctl daemon-reload` before restarting.

For an upgrade, back up PostgreSQL, both configuration files, and the original encryption keys. Verify the downloaded archive's checksum and extract the full archive into a new root-owned release directory. Do not replace active configuration with samples. Once the new release is ready, stop the process before switching the symlink, for example:

```bash
sudo systemctl stop dashboard
sudo ln -sfn /opt/dashboard/releases/1.2.4 /opt/dashboard/latest
sudo systemctl start dashboard
sudo journalctl -u dashboard -n 100 --no-pager
```

These commands assume `latest` is already a symlink. Keep the old installation until its process has stopped because Java may load classes lazily. Configuration and media stay outside releases and need no copying during upgrades. Database migrations may prevent reverting to an older binary without restoring a matching database backup.

## Restart, Backup, And Upgrade

The commands below describe the interactive Windows installation. For Linux service operations and symlink-based upgrades, use [Linux Service Setup](#linux-service-setup).

When upgrading from an older release hosted at `/quinoa/`, use a newly built root-hosted release and set `dashboard.ui-base-path=/` in your active properties file, or `DASHBOARD_UI_BASE_PATH=/` in the environment. Update bookmarks and kiosk URLs to `/home`. Changing only a runtime setting does not relocate an older binary's compiled UI assets. The Microsoft callback remains `/accounts/callback`; no prefix-stripping proxy rule is needed.

- **Restart:** stop Java with Ctrl+C and run the same JAR command from the extracted directory. With Method A, retain `config/application.properties`; with Method B, restore the environment in the launch session. Keep the original keys; do not repeat first-install key generation. Restart Caddy separately if needed.
- **Run continuously:** these terminal commands are an initial setup, not a Windows service. After confirming operation, configure a service manager to run Java and Caddy at boot with the same working directories and protected configuration. Method A requires the Java account to read the private properties file; Method B requires environment settings supplied to the service. Running accounts also need access to the database, public JSON, and media directory.
- **Back up:** preserve PostgreSQL data, public JSON, Caddy configuration, and keys securely. Include the private `config/application.properties` for Method A. Cached media can be downloaded again. A database backup without the token key cannot restore Microsoft connections.
- **Upgrade:** back up, stop Java, and extract the new release into a separate directory. Copy your existing public JSON and, for Method A, private `config/application.properties` into its `config` directory; do not overwrite them with samples. Keep the existing database, media directory, and keys; update configured paths if the installation directory changes. Start the new runner. Liquibase applies new schema changes automatically. Migrations may prevent switching back to an older binary; restore a matching database backup for rollback.
- **Microsoft secret expiry:** create a replacement in Entra, update `dashboard.microsoft.client-secret` in the file or `MICROSOFT_CLIENT_SECRET` in the environment, and restart. If an account shows **Anmeldung erforderlich**, use **Erneut verbinden** to reconnect it.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `java` not found or unsupported class version | Install Java 25, correct PATH, and open a new terminal. |
| Missing database URL, session key, or allowed origins | Method A: check `config/application.properties`, access permissions, and Java's working directory. Method B: restore step 7 settings in the launch session/service. |
| Database connection refused | PostgreSQL is running, host/port match the JDBC URL, and the database exists. |
| Database password authentication failed | Use the `dashboard` role's password, not the administrator password. |
| `permission denied for schema public` | As the database administrator, connect to the application database and run `GRANT USAGE, CREATE ON SCHEMA public TO dashboard;` (step 4). Database-level grants alone are insufficient. |
| HTTPS name does not resolve | Fix local DNS on the device; the hostname must point to the dashboard computer. |
| Certificate warning | Install Caddy's root certificate in the client's trusted certificate store. |
| Caddy returns 502 | Java is running on `127.0.0.1:8080`; inspect its terminal. |
| Blank page or `/config` returns 503 | The JSON exists at `dashboard.ui-config-file` / `DASHBOARD_UI_CONFIG_FILE`, is readable by Java, and contains a valid JSON object. |
| Admin login fails | Use `admin` with the local admin password. Environment changes do not reset the existing database user's password. |
| Requests return 403 | Use the exact origin in `dashboard.allowed-origins` / `DASHBOARD_ALLOWED_ORIGINS`, including scheme/port and no trailing slash. Do not mix hostnames and IP addresses. |
| Microsoft callback returns 403 | The callback requires a local admin session and a GET redirect (`response_mode=query`). Older builds used MSAL's default `form_post`, which the browser request guard rejects. Deploy a corrected build and start a new account connection from setup; do not disable the guard or add Microsoft to the allowed origins. |
| Microsoft redirect URI mismatch | Registered **Web** URI and `dashboard.microsoft.redirect-uri` / `MICROSOFT_REDIRECT_URI` match exactly: `/accounts/callback`. |
| Calendar/gallery stays empty | Connect an account, enable source checkboxes, check sync status, and allow time for initial synchronization. |
| Images fail with `Untrusted Microsoft media redirect` | Deploy a build that includes Microsoft's OneDrive `*.svc.ms` media hosts. If rejection persists, report only the hostname from the updated error, never the signed download URL. Keep redirect validation enabled; no account reconnection or metadata reset is needed. |
| Token decryption fails | Restore the original `DASHBOARD_TOKEN_KEY`; generating a new key does not recover old credentials. |
| openHAB, EVCC, or cameras fail | Check their separate services, public JSON, HTTPS/iframe compatibility, proxy authentication, and go2rtc stream names. |

No public Microsoft webhook is necessary for this initial installation. Do not expose the whole dashboard to the internet to troubleshoot synchronization.

## For Contributors

The source repository contains `server/` (Quarkus) and `ui/` (Angular). Developer setup, formatting, tests, and builds are documented in [server/README.md](server/README.md) and [ui/README.md](ui/README.md). These source-directory links apply on GitHub, not in the extracted ZIP, which includes the backend reference as `BACKEND.md`.

Every push and pull request runs **Build** and produces a downloadable deployment artifact. Publishing a GitHub Release builds its tag and attaches the application ZIP and `SHA256SUMS`. You do not need these pipelines to use a downloaded release.
