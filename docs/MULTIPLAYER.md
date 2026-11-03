# Online Search & Destroy and Zombies

For the step-by-step GitHub + Vercel frontend + Render backend setup, start with
[ONLINE_DEPLOYMENT.md](ONLINE_DEPLOYMENT.md). The included `render.yaml` provisions
one Free backend with external MySQL storage and deploys after GitHub checks pass.

The game has a dedicated authoritative multiplayer server and an online menu. Both
S&D and Zombies are available offline through **Play Now** and online through **Play
Online**. S&D supports 1v1–5v5; Zombies supports 1–5 cooperative survivors with allied
bots filling empty squad slots, always against AI zombies. See [career/rank design](PROGRESSION.md)
for XP, daily streaks, persistent online profiles, Ranked and fair matchmaking.

## Player flow

* **Play Online → Play online:** joins the oldest waiting public room with the selected
  team size and match length; creates one if none exists.
* **Create public match:** creates a new room visible to public matchmaking.
* **Create private match:** creates a room with a unique, randomly generated five-digit
  code. Friends use **Join private match** and enter that code. Codes are invitations,
  not account authentication or passwords.
* S&D humans are balanced between two teams; Zombies humans share the survivor squad.
  A full room starts immediately. The owner
  can press **Play now** at any time. Otherwise the room starts **three minutes after
  creation**, using the server's clock. New arrivals and ownership changes do not reset
  that deadline. This applies to private and public rooms.
* Vacant S&D slots become Normal-difficulty bots; Zombies allies follow the chosen mode difficulty. Five humans in a 3v3 room produce exactly
  one bot. Bots use the existing weapons, economy, navigation and difficulty behavior.
* If the owner leaves the lobby, ownership passes to the next player. If someone leaves
  a running match or loses their connection, a bot takes over their agent with its
  equipment and score. Running matches are closed to new joins; a dropped connection
  currently requires returning to the menu and joining another room.
* Escape, settings, buy menus and hidden tabs never pause the server. Stale input is
  neutralized after 250ms. Empty rooms are removed; completed matches are cleaned up
  after two minutes. A running match has a hard limit measured from its start (90 minutes
  for S&D, 3 hours for Zombies). At the limit it ends as a normal result: the S&D score
  leader wins (a tie is a draw), and everyone is credited as if the match finished.

## Run on this computer / LAN

```sh
npm ci
npm run dev:online
```

Open `http://localhost:5173` in two browsers. For a second computer on the same LAN,
open `http://<host-LAN-IP>:5173` and allow the development server through the Windows
firewall when prompted. Vite proxies `/online` to the game server on port 3001.
All players must use the same server. Pointer lock may require localhost or HTTPS,
depending on browser security rules; use HTTPS hosting for internet play.

To serve the production frontend and game server from one process:

```sh
npm run build
npm start
```

Open `http://localhost:3001`. `/health` returns process health plus room/player counts and
profile-storage status. It stays 200 during a storage outage so a host health check never
restarts live matches over a database blip; `/ready` returns 503 while saves are failing,
for monitoring and alerts.
`PORT` defaults to 3001; the server listens on `0.0.0.0`. The included Dockerfile also
builds the frontend and runs this production server as a non-root user.

## Keep the frontend on Vercel

Your existing GitHub → Vercel frontend auto-deploy can continue using `npm run build`
and output directory `dist`. No frontend framework migration is needed.

1. Deploy the game server as **one persistent Node/container instance** on your chosen
   host, with WebSocket upgrades enabled, HTTPS/WSS termination, and idle timeouts long
   enough for a match. Use `npm ci`, `npm run build`, `npm start`, or the Dockerfile.
   Configure the host to redeploy this same GitHub repository when desired.
2. Set its `ALLOWED_ORIGINS` to the exact frontend origins, comma-separated, for example
   `https://your-game.vercel.app,https://ceenguyen05.github.io`. An origin contains no
   path or trailing slash. Add preview/custom domains explicitly if you use them.
   This server checks the browser Origin during the WebSocket upgrade. If the variable
   is empty, origins are unrestricted for convenient local development.
3. In Vercel's project environment settings, add
   `VITE_MULTIPLAYER_URL=wss://your-game-server.example/online` for Production (and
   Preview if wanted), then redeploy. Vite embeds this public address at build time;
   it is not a secret. Never use a localhost address in a deployed frontend.
   To configure the GitHub Pages build too, set the repository Actions variable
   `VITE_MULTIPLAYER_URL` to the same value; the build workflow reads it.
4. Open the Vercel URL on two different devices. Choose **Play Online**, create a
   private room, share its code, join, then choose **Play now**. You can inspect/change
   the endpoint under **Game server connection** in the online menu without rebuilding;
   that override is saved only in the current browser.

Pushing the frontend alone does **not** provision this game server or configure that
environment variable. A `vercel.json` that turns the existing in-memory server into a
Function would not make rooms reliable. Current Vercel WebSocket support still closes
connections at the Function duration limit, and new connections can reach different
instances. Vercel recommends external storage/pub-sub for shared room state. See
[Vercel WebSockets](https://vercel.com/docs/functions/websockets) and
[Services on Fluid compute](https://vercel.com/kb/guide/vercel-services-fluid-compute).
This implementation deliberately uses a persistent process for long-running 64Hz matches.
Do not horizontally replicate it behind a load balancer: room codes and simulations
are held in that process. Multi-region/large-scale hosting needs a shared room directory
and routing to the process that owns each match. Process restarts/deployments end current
rooms; there is no match persistence yet.

## Networking and boundaries

* Node + [`ws`](https://github.com/websockets/ws), native browser WebSocket, bounded
  compression for larger snapshots and persistent anonymous device profiles.
* The server runs the same DOM/WebGL-free `Match` simulation at 64 ticks/second.
  Clients send commands and purchases, never position, damage, health or elapsed time.
* Snapshots and ordered simulation events are sent at 20Hz. State includes agents,
  weapons/attachments, bomb, score, inventory, grenades, smoke/fire, gadgets, projectiles,
  damage reports and dynamic colliders. Static map geometry stays bundled in the client.
  Each room's snapshot is serialized once and shared by its clients. Idle pooled zombies
  (dead for over 30 seconds) are sent as identity only. After the result, snapshots drop to 1Hz.
* Movement prediction uses the same collision/stance/slide/mantle code as the server.
  Sequence acknowledgments reconcile the local agent and replay pending movement.
  Other players' positions and look interpolate toward authoritative state. Mouse look
  remains responsive. Combat, hit confirmation, buying and round transitions wait for
  the server. Online killcams are disabled so local replay never obscures live rounds.
* This is a first playable multiplayer implementation, not competitive netcode parity:
  there is no historical hitbox rewind/lag compensation, no local weapon-fire prediction,
  no active-match reconnect/resume, party/team selection, voice chat or cross-process
  matchmaking. High latency affects firing feedback; test with intended players/regions
  before treating it as a competitive release.
* Inbound JSON is size-limited to 4KiB; commands and purchases are allow-listed and
  clamped; input queues, message rates, rooms, connections and slow-client buffering
  are bounded. The room owner has lobby start authority only. Heartbeats remove dead
  sockets, and a reconnect after a silent drop (no message for 6 seconds) replaces the
  dead session instead of being refused. An exception in one room's simulation or message
  handling closes only that room, without abandon penalties; other rooms keep running.
  These are baseline protections, not a complete anti-cheat/DDoS system.
* **Known limitation: no visibility culling.** Every client receives the full state of
  every agent, including enemies behind walls. A modified client can therefore reveal
  enemy positions and loadouts. Server-side interest management (sending only what each
  player could see or hear) is the fix and the main remaining Ranked-integrity task.
  Snapshots also repeat static per-agent data (names, looks, stats) at 20Hz; sending that
  once at match start would further cut bandwidth and server CPU.
* Defaults: at most 16 rooms, 128 sockets, 16 sockets per network peer IP per process.
  Capacity depends on host CPU and bandwidth; load-test before increasing these limits.
  The network-peer limit sees the proxy IP behind some hosts; set
  `MAX_CONNECTIONS_PER_IP=128` there and configure real client-IP limits at the trusted
  ingress before serving many users. Do not trust arbitrary
  `X-Forwarded-For` headers as a substitute.

Research basis: [authoritative client/server architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html),
[prediction and reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html),
[entity interpolation](https://www.gabrielgambetta.com/entity-interpolation.html),
[`ws` heartbeat guidance](https://github.com/websockets/ws#how-to-detect-and-close-broken-connections),
and [Vite WebSocket proxy configuration](https://vite.dev/config/server-options#server-proxy).

## Verification

```sh
npm run test:online     # lobby/queue/prediction tests plus real WebSocket integration
npm run test:online:browser  # production browser flow with two browsers + three peers
npm run verify         # typecheck, full tests, build, boot, offline smoke/keys/Zombies
```

The browser test creates a 3v3 private room, joins five humans, starts with one bot,
checks replicated players and movement/combat, verifies background/pause behavior,
and exercises public matching and failed connections. Evidence is written to
`screenshots/online/`. It runs its own ephemeral production server, so it needs a
current `dist` build (the command builds automatically).
It also verifies online Zombies with two human clients and one ally, shared gates/power,
forged weapon stats, a real-key teammate revive, Armory purchases, XP/streak results,
identity resume, the Career page and separate offline XP. Persistent online profiles
use MySQL on the free deployment, or a persistent `DATA_DIR` for the file-storage alternative;
see [progression storage](PROGRESSION.md#persistence-and-trust-boundaries).
