# Free online deployment: GitHub + Vercel + Render + Aiven MySQL

This setup uses **free plans only**, within each provider's usage limits:

| Service | What it does | Plan to select |
|---|---|---|
| GitHub | Stores code and runs checks | Your existing repository |
| Vercel | Hosts the game website | Hobby / Free (personal, non-commercial use) |
| Render | Runs multiplayer matches | **Free Web Service** |
| Aiven MySQL | Keeps online XP, ranks and profiles | **Free**, not a paid trial |

The included `render.yaml` now selects Free, has **no persistent disk**, and uses
MySQL for saves. The backend creates its database table automatically. You do not
need MySQL installed on your computer or a Render/Vercel API token.

## 1. Create your free MySQL database in Aiven

1. Sign in at [console.aiven.io](https://console.aiven.io/) and open/create a project.
2. Choose **Services > Create service > MySQL**. Select **Free** and confirm the
   summary is **$0**, not a trial or a paid plan. Name it something like `aci-profiles`.
3. Create the service and wait for **Running**. Free accounts cannot choose a region.
4. Open its **Overview / Connection information**. You will need these values:

   | Aiven value | Render variable used later |
   |---|---|
   | Host | `MYSQL_HOST` |
   | Port (copy the actual number) | `MYSQL_PORT` |
   | User, usually `avnadmin` | `MYSQL_USER` |
   | Password | `MYSQL_PASSWORD` |
   | Database, usually `defaultdb` | `MYSQL_DATABASE` |
   | Downloaded CA certificate, entire file contents | `MYSQL_SSL_CA` |

5. Download the **CA Certificate**. Open the file as text; later, paste everything
   from `-----BEGIN CERTIFICATE-----` through `-----END CERTIFICATE-----` into Render.
   Both real line breaks and literal `\n` separators are supported by the code.

Keep the password out of GitHub, chat, and Vercel. Use individual connection fields;
do not paste the entire MySQL connection URL into the Host field.
[Aiven setup](https://aiven.io/docs/products/mysql/get-started) /
[CA certificate](https://aiven.io/docs/platform/concepts/tls-ssl-certificates)

## 2. GitHub: push the updated code

1. In your repository, ensure **Settings > Actions > General** allows GitHub Actions.
2. For Vercel-only website hosting, add a repository variable under **Settings >
   Secrets and variables > Actions > Variables > New repository variable**:

   | Name | Value |
   |---|---|
   | `DEPLOY_GITHUB_PAGES` | `false` |

   This skips Pages publishing while keeping the checks Render waits for. Leave the
   variable unset only if you also want GitHub Pages and already configured it.
3. On your computer, push the complete pending game changes, including the new
   MySQL code, `package.json`, `package-lock.json`, and `render.yaml`:

   ```powershell
   cd C:\Users\caseyn\Downloads\ACI-SND
   npm run check
   git status --short
   git add .
   git commit -m "Set up free multiplayer hosting with MySQL saves"
   git push origin main
   ```

   Review the file list before staging. `.env` files and `server-data/` are ignored;
   `.env.example` contains examples only. For protected `main`, merge a pull request.
4. Wait for GitHub's **Typecheck, tests and build** and **Browser boot check** to pass.
   On `main`, these are inside **Deploy to GitHub Pages**, even when its publishing
   job is skipped. Keep that workflow enabled.

## 3. Render: deploy the free backend

1. Sign in at [dashboard.render.com](https://dashboard.render.com/). Choose **New >
   Blueprint**, connect your GitHub account, and select `ACI-SND`. Connecting through
   GitHub enables automatic deployment; do not use the public-repository-URL option.
2. Select branch **main**, Blueprint path **render.yaml**, and a Blueprint name such
   as `aci-online-free`.
3. Fill in the prompted variables:

   | Variable | What to enter |
   |---|---|
   | `ALLOWED_ORIGINS` | Your exact production website origin, e.g. `https://YOUR-GAME.vercel.app` |
   | `MYSQL_HOST` | Aiven Host |
   | `MYSQL_PORT` | Aiven Port |
   | `MYSQL_USER` | Aiven User |
   | `MYSQL_PASSWORD` | Aiven Password |
   | `MYSQL_DATABASE` | Aiven Database, usually `defaultdb` |
   | `MYSQL_SSL_CA` | The full downloaded CA certificate text |

   Website origins have no trailing slash or path. For multiple websites, separate
   exact origins with commas. Example:
   `https://YOUR-GAME.vercel.app,https://ceenguyen05.github.io`.
   Add each preview/custom website origin explicitly; wildcards are not supported.
4. Before deploying, confirm **Free** and **no disk**. The Blueprint also sets:

   | Setting | Value |
   |---|---|
   | Runtime / Node | Node / 22 from `.nvmrc` |
   | Instances / branch | **1** / `main` |
   | Build command | `npm ci --include=dev && npm run build` |
   | Start command | `npm start` |
   | Health check | `/health` |
   | Auto-deploy | **After CI Checks Pass** |
   | `ACCOUNT_STORAGE` | `mysql` |
   | `NODE_ENV` | `production` |
   | `MAX_CONNECTIONS_PER_IP` | `128` (handles shared Render proxy peer IPs) |

   Render supplies `PORT`. No `DATA_DIR`, disk, Docker configuration, or paid Render
   database is needed. The Blueprint uses Ohio; edit `region` before creation if desired.
5. Choose **Deploy Blueprint**. Open the resulting **aci-snd-online** service and
   wait for **Live**. Copy its actual `https://...onrender.com` URL.
6. Visit `https://YOUR-BACKEND.onrender.com/health` with your actual hostname. Wait
   until you see JSON containing **`"status":"ok"` and `"storage":"mysql"`**.
   Startup checks MySQL connectivity and creates `aci_accounts` if needed.

Keep one backend instance: adding a database does not make room state multi-server.
If you already created the previous paid setup, changing this file alone does not
remove its paid disk or cancel its costs. Back up existing data before changing old
resources; this guide is for a fresh MySQL-backed deployment. File saves are not
imported automatically.

## 4. Vercel: point the website at Render

1. Open your existing Vercel project. Use the **Hobby / Free** plan for a personal,
   non-commercial game. Confirm the GitHub repository and Production Branch **main**.
2. Use these build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | Vite |
   | Root directory | Repository root |
   | Install command | `npm ci --include=dev` |
   | Build command | `npm run build` |
   | Output directory | `dist` |
   | Node.js | 22.x |

3. Under **Environment Variables**, add this for **Production**:

   | Name | Value |
   |---|---|
   | `VITE_MULTIPLAYER_URL` | `wss://YOUR-BACKEND.onrender.com/online` |

   Use Render's actual hostname. Keep `wss://` and `/online`. This is a public
   address; **MySQL passwords and certificates belong only in Render**, never in
   Vercel or any `VITE_*` variable.
4. Save and **Redeploy** your production deployment. Vite embeds this address during
   the build; saving the variable alone does not update the existing website.
5. If you also use GitHub Pages, set the same `VITE_MULTIPLAYER_URL` as a GitHub
   Actions repository variable and rerun its workflow. Preview deployments need the
   Vercel variable too, plus their exact website origins in Render's allow-list.

[Vercel environment settings](https://vercel.com/docs/environment-variables/managing-environment-variables)

## 5. Wake the backend and test with a friend

1. First open the Render **`/health`** address in a browser. After inactivity, allow
   about a minute for Render to wake; wait for the JSON with `storage: mysql`.
   If the game's connection failed while waking, retry after health is ready.
2. Both players open the **Vercel production website** on separate devices or browser
   profiles. Two tabs sharing one online identity cannot connect as two players.
3. Choose **Play Online**. Under **Game server connection**, verify the Render
   `wss://.../online` endpoint and replace any older saved override.
4. Create a private S&D room, share its code, join from the second device, and press
   **Play now**. Confirm people synchronize and bots fill the remaining slots.
5. Try public matchmaking with identical settings, then online Zombies. Empty rooms
   start with bots after three minutes. Start with one small match when testing Free.
6. Complete an active match and check **Career & Rank**. Close the game, reopen it in
   the same browser, and verify XP returns. Restart Render **between matches**, then
   repeat to confirm progress survives without a disk.

Profiles remain anonymous and browser-bound. Clearing browser storage or using a
new device creates a separate profile; MySQL alone does not add account recovery.

## 6. Keep it free and understand the limits

- Keep all three hosting services on their free plans. Use the supplied `.vercel.app`
  and `.onrender.com` addresses; a purchased domain is optional.
- Render sleeps after 15 minutes without inbound traffic; normal incoming game
  WebSocket messages keep it awake. Restarts/redeploys still disconnect players and
  clear active rooms. MySQL preserves saved career data, not the interrupted match.
- Render Free has limited CPU/RAM. Private rooms, queues, bots, XP, ranks and both
  modes stay available, but many matches or large Zombies waves may lag. Test before
  inviting a crowd; smooth 5v5 on Free has not been established.
- MySQL saves changed profiles periodically (every 15 seconds) and on match/room
  completion and graceful shutdown. A sudden process failure can lose recent unsaved
  progress. Database outages are retried in memory and make health report unavailable;
  the server never silently switches to disposable file saves.
- Aiven's Free plan has 1 GB storage and can be powered off for inactivity. Resume it
  in Aiven if needed. Render's own Free Postgres expires after 30 days, so it is not
  the database used here.
- Watch billing/usage in each dashboard. Render can bill bandwidth/build overages
  when a payment method is attached; without one, applicable services/builds stop at
  limits. A free service choice is not a promise of unlimited traffic or zero bills
  under every existing account setting. Avoid paid upgrades and review your current
  Render billing/spend settings before launch.

Sources: [Render Free limits](https://render.com/docs/free),
[Render Free WebSocket behavior](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages),
[Aiven Free MySQL](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier),
[Vercel Hobby](https://vercel.com/docs/plans/hobby).

## 7. Future pushes

Push/merge to `main`: Vercel rebuilds the website; Render rebuilds the backend after
commit checks pass. No deploy tokens are needed. Wait for both deployments, then
refresh the website. Deploy between play sessions because active rooms restart.
Change Aiven credentials or website allow-lists in **Render > service > Environment**
and redeploy; never commit those values.

## Quick fixes

| Problem | Check |
|---|---|
| Backend fails during startup | All `MYSQL_*` fields are set, Aiven is Running, and the database user can create tables. |
| Certificate error | Paste the entire current Aiven CA certificate into `MYSQL_SSL_CA`. Keep TLS verification enabled. |
| Health says `storage: file` | Set `ACCOUNT_STORAGE=mysql` on Render and redeploy. Do not launch with file saves on Free. |
| First connection fails | Open Render `/health`, wait for its JSON, then retry the game. |
| Health works but multiplayer gets 403 | `ALLOWED_ORIGINS` exactly matches the actual Vercel website origin, with no path/trailing slash; also check capacity. |
| Profile already connected | Close the other tab using that browser identity; use separate profiles to test multiple players. |
| Progress looks reset | Confirm the same browser credential and backend hostname, plus `storage: mysql`. Changing the endpoint creates a separate browser identity. |
| Render does not auto-deploy | Ensure GitHub is connected and all checks passed. Set `DEPLOY_GITHUB_PAGES=false` if unused Pages publishing fails. |

Implementation details: [multiplayer](MULTIPLAYER.md) / [progression](PROGRESSION.md).
