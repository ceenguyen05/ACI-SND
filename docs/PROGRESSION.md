# Career, XP, ranks and fair matchmaking

## Research and design

The implementation separates **experience** (how much you play) from **skill** (how
likely you are to win). These are original ACI tuning values, not a claim to reproduce
another game's proprietary matchmaking algorithm.

* [Call of Duty progression](https://support.activision.com/uk/en/black-ops-6/articles/progression-in-black-ops-6)
  and [daily challenges](https://www.treyarch.com/game-intel/2020/12/Daily_Challenges_Have_Arrived):
  reward combat, objectives, challenges and play across Multiplayer/Zombies. ACI uses
  shared career XP across its two modes and three daily tasks, with a completion bonus.
  ACI does not lock gameplay equipment behind XP or add paid XP boosts.
* [Counter-Strike skill groups/profile ranks](https://help.steampowered.com/en/faqs/view/3204-9FB1-967F-1AC6):
  experience progression is separate from competitive results. ACI retains that distinction
  so a high level alone never makes someone a high-skill opponent.
* [Valorant RR](https://support.riotgames.com/en-us/valorant/gameplay/rank-rating-rr-for-iron-through-ascendant-ranks):
  visible divisions/100-point progress, placement matches, promotion buffers and limited
  rank protection inspired ACI's competitive ladder. Team results dominate ACI rank changes;
  kills/objectives give XP rather than letting stat farming cancel a loss.
* [Siege Ranked 2.0](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/1iJmqRLqYaCkhFJlhOEGYa/y7s4-ranked-20-update):
  separate matchmaking skill and visible rank, use uncertainty and account for opponent
  strength. ACI uses an uncertainty-scaled Elo estimate with gradual visible-rank convergence.
  Siege's dated article is used as a documented design reference, not a statement that
  every current Siege season has identical rules.
* [Roblox Operation One by Colorful Squares](https://www.roblox.com/games/72920620366355/Operation-One):
  the official page confirms its tactical 4v4/intel/teamplay focus. Its public description
  does not publish a verified XP curve/MMR formula. ACI takes that team/objective emphasis
  without inventing undocumented Operation One progression numbers.

## XP and levels

**Career & Rank** in the main menu shows level bars, lifetime XP, kills, objectives,
completed matches, wins, daily tasks, current/best play streak and online competitive rank.
The match HUD shows earned XP; end screens show XP/level and any rank-point result.

| Action | Base XP |
|---|---:|
| S&D kill / headshot bonus / assist | 100 / 25 / 50 |
| Plant / defuse | 250 / 300 |
| Round win | 75 |
| Active match completion / victory bonus | 400 / 600 |
| Zombie kill / wave clear / teammate revive | 20 / 100 / 150 |
| Successful exfil bonus | 800 |

Public online action/completion XP uses these base values; private/offline action and
completion XP uses 50%. S&D bot kills receive another 50% reduction. Daily challenge
and streak bonuses are fixed. Spectating and accelerated offline test sessions earn no XP.
Posthumous kills and assists still count. No XP or rank is awarded for friendly kills.

Level 1 starts at 0 XP. Level N starts at `1000 × (N−1) × N` XP: level 2 at 2,000,
level 3 at 6,000, level 4 at 12,000, level 5 at 20,000. The lifetime curve supports up
to level 1,000. XP is never spent or reset by rank changes, and levels grant no combat advantage.

Daily challenges reset at **00:00 UTC**:

* 10 kills, 2 objectives/waves/revives, 2 completed active matches.
* 250 XP for each task, plus 500 XP for all three; each reward is claimed once per day.
* The first qualifying match of the day grants a play-streak bonus: 200 XP on day one,
  +50/day up to 500 XP on day seven and later. Missing a day resets the current streak.
* Short/abandoned matches do not count as completed games or advance a daily streak.
  Online completion needs 90 simulated seconds and 30 seconds of meaningful player input.
  Action XP earned before leaving is retained. Result IDs prevent duplicate completion rewards.

## Competitive ladder

Ranks are **Iron → Bronze → Silver → Gold → Platinum → Emerald → Diamond → Champion**.
Each tier below Champion has **I / II / III**, with 100 RP per division. Five eligible
Ranked matches establish an initial rank; placements are capped at Platinum I. Ranked
unlocks at online level 5 and five completed online matches.

Only **public Ranked S&D with full human 3v3, 4v4 or 5v5 teams at the start** is rated.
The three-minute fallback and owner Play now still work: an incomplete room starts with
bots **unrated**, clearly stated in the lobby. Private rooms, casual S&D, offline and
Zombies earn XP without changing competitive rank. Starting bots never earn a human's XP.

* Hidden-from-UI matchmaking skill starts at 1,200; the server owns it. Match outcome,
  opponent-team average and uncertainty update it. New accounts adjust faster.
* Visible RP is normally about ±22, adjusted by skill/rank convergence, expected result
  and round margin, with bounded changes. Wins gain RP; losses lose RP; a draw does not
  change established visible RP. XP/kills cannot buy or boost rank.
* A promotion starts with at least 10 RP. A loss crossing a division floor first leaves
  you at zero; another loss can demote. Reaching a new peak tier grants one tier shield.
  Repeated demotion/re-promotion cannot replenish that shield at an already-achieved tier.
* Abandonment in a rated match counts as a loss once; disconnecting cannot avoid it.
  Prolonged inactivity also makes a result a loss for that player. Server shutdown itself
  does not create abandonment penalties. A Ranked match that ends in under 90 simulated
  seconds is unrated for everyone, and the server's match time limit counts as a normal finish. A teammate disconnect is replaced by AI, but
  does not erase the original rated result for the remaining human players.

## Public matchmaking

Rooms must agree on mode, size and playlist, plus S&D match length or Zombies
difficulty/survival length. Public S&D searches start within 150 MMR, widening 50 every
30 seconds to a **450-MMR maximum**. New players (under five completed games) initially
search together; that restriction relaxes after 90 seconds within the same skill bounds.
Levels are displayed but do not determine opponents.

Waiting public rooms are reconsidered once a second and can merge as compatibility
expands, without cancel/requeue. The older room/code/deadline survives; private codes
never merge. Public teams are balanced using server-owned skill while keeping team sizes
equal. Ranked code joins cannot bypass the skill range or eligibility checks. Matches
may start with bots after three minutes instead of forcing an extreme skill mismatch.

## Persistence and trust boundaries

* Offline career is stored in the browser profile. Online career/rank is a distinct,
  server-owned record. Editing local storage or claiming XP/MMR in a network message
  does not change the server's record, ranked eligibility or matchmaking skill.
* The browser keeps a randomly generated device credential for each server endpoint.
  The server stores only its SHA-256 hash. WSS protects the credential in production;
  it is passed as a WebSocket subprotocol rather than placed in a URL query string.
  One active connection per online identity prevents simultaneous sessions farming
  the same profile. Closing/reopening the menu or restarting the server resumes progress.
* This is an **anonymous device profile**, not an email/Steam/Riot account integration.
  Clearing browser storage loses the credential; another device/browser gets a separate
  profile. There is no recovery/transfer flow yet, nor a complete anti-smurf/anti-cheat system.
* The free deployment uses `ACCOUNT_STORAGE=mysql` and backend-only `MYSQL_*`
  settings. `server/MySqlPersistence.ts` verifies TLS certificates/hostnames, creates
  `aci_accounts` and loads profiles before accepting players. Only changed profiles
  are written, every 15 seconds and on explicit completion/flush/shutdown; failed
  writes stay in memory for retry and make `/health` return 503. Startup database
  failures stop startup instead of silently creating empty file saves. An abrupt
  crash can lose recent unsaved progress. See [free setup](ONLINE_DEPLOYMENT.md).
* Without MySQL configuration, `npm start` writes `server-data/accounts.json` (or `DATA_DIR/accounts.json`) through
  an atomic temporary-file/rename, periodically and on match completion/shutdown.
  Only profiles with progress are written: a connection that never earns anything is never
  stored, and at most 5,000 such idle profiles stay in memory for quick reconnects.
  This file-storage alternative requires a persistent volume; it is not suitable
  for Render Free. Keep `DATA_DIR` on that volume and back it up. Corrupt/unsupported stored data
  fails startup rather than silently resetting careers. Do not commit/copy this directory
  into frontend builds or container images. The Dockerfile exposes a writable data volume.
* As in the first multiplayer implementation, run one authoritative server process.
  Horizontal scaling needs a shared account store, room routing and account-session locks.
  Public internet deployment still needs that persistent host and Vercel's
  `VITE_MULTIPLAYER_URL`; pushing frontend code alone does not provision the backend.

## Implementation and verification

`src/progression/` contains pure XP/rank calculations and simulation-event rewards.
`server/AccountStore.ts` owns saved online records. `server/LobbyService.ts` enforces
eligibility, input ownership, rating, search windows, room merging and completion.
`src/net/RemoteZombiesMatch.ts` reuses a prediction/replication driver without running
AI or local machine purchases. Snapshots preserve pooled zombie identities, dynamic
gates, power, perks, forged stats, revives, hazards, waves and extraction.

Run `npm run test:online` for progression, account, room, ranked, coop and actual
WebSocket integration tests; `npm run test:online:browser` for two-browser S&D + Zombies,
XP/results, shared machinery, teammate revival, Armory and saved-profile checks.
`npm run verify` also checks the complete regression suite, build/boot, offline smoke,
real input bindings and Zombies visuals. Full interactive checks require a GPU; CI's
unit/network tests and software-rendered boot check cover its GPU-less environment.
