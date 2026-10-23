import { MATCH_LENGTHS, type MatchRules, type Team } from '../config/rules';
import { MOVE } from '../config/movement';
import { Match } from '../sim/mode/Match';
import { ACI_HQ } from '../sim/maps/aciHq';
import type { Agent } from '../sim/entities/Agent';
import { MatchView } from '../render/MatchView';
import type { GameRenderer } from '../render/Renderer';
import { HUD } from '../ui/hud/HUD';
import { BuyMenu } from '../ui/hud/BuyMenu';
import { MatchEndScreen, PauseMenu, Scoreboard } from '../ui/hud/Overlays';
import { SettingsPanel } from '../ui/screens/SettingsPanel';
import { h } from '../ui/dom';
import { sfx } from '../audio/Sfx';
import type { Input } from './Input';
import { PlayerController } from './PlayerController';
import { makeAimAssist } from './AimAssist';
import { keyLabel } from '../config/controls';
import { announcer } from '../audio/Announcer';
import type { Profile, Settings } from './Profile';

export interface SessionOptions {
  spectate?: boolean;
  timeScale?: number;
  rules?: Partial<MatchRules>;
  seed?: number;
}

const DT = 1 / MOVE.tickRate;

/** One running match: fixed-tick simulation + view + HUD + overlays + input routing. */
export class GameSession {
  readonly match: Match;
  readonly view: MatchView;
  private hud: HUD;
  private buy: BuyMenu;
  private scoreboard: Scoreboard;
  private pause: PauseMenu;
  private settingsOverlay: HTMLDivElement;
  private clickToPlay: HTMLDivElement;
  private root: HTMLDivElement;
  private ctrl: PlayerController;
  private acc = 0;
  private paused = false;
  private ended = false;
  private expectUnlock = false;
  private spectateIdx = 0;
  private freeYaw = 0;
  /** performance.now() when the killcam should start (0 = none pending). */
  private killcamAt = 0;
  timeScale: number;
  onExit: () => void = () => {};

  constructor(private r: GameRenderer, private input: Input, private profile: Profile, uiRoot: HTMLElement,
    private saveProfile: () => void, private applySettings: (s: Settings) => void, opts: SessionOptions = {}) {
    const mp = profile.match;
    const len = MATCH_LENGTHS[mp.length];
    const side: Team | 'spectator' = opts.spectate ? 'spectator' : mp.side === 'auto' ? (Math.random() < 0.5 ? 'T' : 'CT') : mp.side;
    this.match = new Match({
      map: ACI_HQ, difficulty: mp.difficulty, playerTeam: side, playerName: profile.name, playerLook: profile.looks, seed: opts.seed,
      rules: { roundsToWin: len.roundsToWin, halfLength: len.halfLength, teamSize: mp.teamSize, freezeTime: mp.freezeTime, friendlyFire: mp.friendlyFire, killstreaks: mp.killstreaks ?? true, ...opts.rules },
    });
    this.timeScale = opts.timeScale ?? 1;
    this.ctrl = new PlayerController(input, profile.settings);
    this.ctrl.assist = makeAimAssist(this.match, () => this.profile.settings.aimAssist ?? 'off');
    const settings = () => this.profile.settings;
    this.view = new MatchView(r, this.match, profile.finishes, () => settings());
    this.hud = new HUD(this.match, settings, () => this.view.viewAgent);
    this.view.onLocalHit = (head) => this.hud.onHit(head);
    this.view.onLocalKill = (hs) => this.hud.onKill(hs);
    this.view.onLocalHurt = (yaw) => this.hud.onHurt(yaw);
    this.view.onLocalFlash = (s, d) => this.hud.onFlash(s, d);
    this.hud.view = this.view;
    this.buy = new BuyMenu(this.match, () => this.closeBuy());
    this.scoreboard = new Scoreboard(this.match);
    this.pause = new PauseMenu(() => this.resume(), () => this.openSettings(), () => this.quit());
    const panel = new SettingsPanel(settings, (s) => { this.applySettings(s); this.ctrl.setSettings(s); }, input);
    this.settingsOverlay = h('div', { class: 'overlay-dim hidden' },
      h('div', { class: 'panel', style: 'padding:22px;max-height:90vh;overflow:auto' }, panel.el,
        h('button', { class: 'btn primary', style: 'margin-top:14px', onclick: () => { this.settingsOverlay.classList.add('hidden'); this.pause.show(true); } }, 'Back')));
    this.clickToPlay = h('div', { class: 'click-to-play', onclick: () => this.lock() }, 'CLICK TO PLAY');
    this.root = h('div', { style: 'position:absolute;inset:0' },
      this.hud.el, this.scoreboard.el, this.buy.el, this.pause.el, this.settingsOverlay, this.clickToPlay);
    uiRoot.append(this.root);

    if (this.match.player) this.ctrl.syncFrom(this.match.player);
    this.match.events.on('roundStart', () => { if (this.match.player) this.ctrl.syncFrom(this.match.player); this.spectateIdx = 0; });
    this.match.events.on('matchEnd', () => this.onMatchEnd());
    this.match.events.on('roundEnd', (e) => {
      // CoD S&D: the round-winning elimination is replayed from the killer's eyes
      this.killcamAt = e.reason === 'elimination' && (this.profile.settings.killcam ?? true) && this.timeScale <= 1 ? performance.now() + 1300 : 0;
    });
    this.match.events.on('roundStart', (e) => {
      this.killcamAt = 0; this.view.stopKillcam();
      const tip = this.tipFor(e.round);
      if (tip && this.match.player) setTimeout(() => this.hud.showTip(tip), 600);
    });
    this.match.events.on('operate', (e) => {
      const me = this.match.player;
      if (!me || e.agentId !== me.id) return;
      const d = this.match.gadgets.get(e.deviceId);
      if (d) { this.ctrl.yaw = d.yaw; this.ctrl.pitch = d.pitch; } else this.ctrl.syncFrom(me);
    });
    this.input.gameFocus = true;
    this.input.onLockChange = (locked) => {
      if (locked) { this.clickToPlay.classList.add('hidden'); return; }
      if (this.expectUnlock || this.ended) { this.expectUnlock = false; return; }
      if (!this.paused) this.setPaused(true);
    };
    if (opts.spectate) this.clickToPlay.classList.add('hidden');
    // round 1 started inside the Match constructor, before we were listening
    const firstTip = this.tipFor(this.match.round);
    if (firstTip && this.match.player) setTimeout(() => { if (!this.ended) this.hud.showTip(firstTip, 12); }, 900);
    this.pickView();
  }

  /** Rotating gameplay tips for the first rounds of a match. */
  private tipFor(round: number): string | null {
    const k = (a: keyof Settings['bindings']) => `<kbd>${keyLabel(this.profile.settings.bindings[a])}</kbd>`;
    const toggle = this.profile.settings.crouchMode === 'toggle';
    const tips = [
      `${k('buy')} buys gear. ${k('buy')} then <kbd>R</kbd> rebuys last round, <kbd>A</kbd> auto-buys, <kbd>4</kbd> opens the Gunsmith.`,
      toggle ? `Tap ${k('crouch')} to crouch, hold it to go prone. ${k('slide')} slides while running.` : `Hold ${k('crouch')} while standing still to go prone. ${k('slide')} slides while running forward.`,
      `${k('ping')} pings an enemy or a spot for your team. ${k('leanLeft')} ${k('leanRight')} lean around corners.`,
      `Kills in one life earn killstreaks – press ${k('killstreak')}. Hold ${k('jump')} into a ledge to mantle.`,
      `Unsuppressed shots show you on the enemy radar. Suppressors keep you hidden.`,
      `${k('quickMelee')} quick-melees, ${k('inspect')} inspects your gun, ${k('light')} toggles a weapon light.`,
    ];
    return round <= tips.length ? tips[round - 1] : null;
  }

  private lock() { sfx.resume(); this.input.requestLock(); }

  private setPaused(p: boolean) {
    this.paused = p;
    this.pause.show(p);
    if (p) { this.buy.hide(); this.input.gameFocus = false; }
  }
  private resume() { this.setPaused(false); this.input.gameFocus = true; this.lock(); }
  private openSettings() { this.pause.show(false); this.settingsOverlay.classList.remove('hidden'); }
  private quit() { this.ended = true; this.input.exitLock(); this.onExit(); }

  private openBuy() {
    const p = this.match.player;
    if (!p || !this.match.canBuyNow(p)) { this.hud.showCenter('You can only buy in your spawn during buy time', 1.5); return; }
    this.expectUnlock = true;
    this.input.exitLock();
    this.input.gameFocus = false;
    this.buy.show();
  }
  private closeBuy() {
    this.buy.hide();
    this.input.gameFocus = true;
    if (!this.paused) this.lock();
  }

  private onMatchEnd() {
    this.ended = true;
    this.input.exitLock();
    this.input.gameFocus = false;
    const me = this.match.player;
    if (me) {
      const st = this.profile.stats;
      st.matches++; st.kills += me.stats.kills; st.deaths += me.stats.deaths; st.mvps += me.stats.mvps;
      if (this.match.winner === me.team) st.wins++;
      this.saveProfile();
    }
    const scr = new MatchEndScreen(this.match, () => { scr.el.remove(); this.onExit(); });
    this.root.append(scr.el);
  }

  /** Choose whose eyes we see through. */
  private pickView() {
    const m = this.match, me = m.player;
    if (me && me.alive) { this.view.viewAgent = me; this.view.freeCam = null; return; }
    if (me && !me.alive && m.time - me.deathTime < 3.2 && m.phase !== 'freeze') { this.view.viewAgent = me; this.view.freeCam = null; return; }
    const pool: Agent[] = m.agents.filter((a) => a.alive && (!me || a.team === me.team));
    const all = pool.length ? pool : m.agents.filter((a) => a.alive);
    if (!all.length) { return; }
    const target = all[this.spectateIdx % all.length];
    if (this.view.viewAgent !== target) {
      this.view.viewAgent = target;
      this.view.beforeStep(); this.view.afterStep();
    }
    this.view.freeCam = null;
  }

  update(frameDt: number) {
    const input = this.input, m = this.match, me = m.player;
    const s = this.profile.settings;

    // ---- menu keys --------------------------------------------------------------
    if (!this.ended) {
      if (this.buy.visible) {
        if (input.wasPressed(s.bindings.buy) || input.wasPressed('Escape')) this.closeBuy();
        for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyR', 'KeyA']) if (input.wasPressed(k)) this.buy.key(k);
        this.buy.refresh();
        if (me && !m.canBuyNow(me)) this.closeBuy();
      } else if (!this.paused) {
        if (input.actionPressed('buy')) this.openBuy();
      }
      this.scoreboard.show(input.isDown(s.bindings.scoreboard) && !this.paused);
      if ((!me || !me.alive) && input.wasPressed('Mouse0')) { this.spectateIdx++; }
    }

    // ---- final killcam ----------------------------------------------------------------
    if (this.killcamAt && performance.now() >= this.killcamAt && !this.paused && !this.ended) {
      this.killcamAt = 0;
      if (this.view.startKillcam(m.matchOver)) sfx.killcamWhoosh();
    }
    const kc = this.view.killcam;
    if (kc && (kc.done || input.wasPressed('Space') || input.wasPressed(s.bindings.use))) {
      this.view.stopKillcam();
      m.hurryRoundEnd(1.2);
    }

    // ---- simulation ---------------------------------------------------------------
    this.ctrl.sensMul = me && me.alive ? 1 - 0.55 * me.stunAt(m.time) : 1;
    this.ctrl.frame(me, this.view.zoomFactor(), Math.min(0.05, frameDt));
    if (this.ctrl.inspectPressed) {
      this.ctrl.inspectPressed = false;
      if (me && me.alive && me.operating === null && !this.view.killcam) this.r.viewModel.onInspect();
    }
    const look = { yaw: this.ctrl.yaw, pitch: this.ctrl.pitch };
    if (!this.paused && !this.view.killcam) {
      this.acc += Math.min(0.25, frameDt) * this.timeScale;
      let steps = 0;
      const maxSteps = Math.max(8, Math.ceil(this.timeScale * 6));
      while (this.acc >= DT && steps < maxSteps) {
        this.pickView();
        this.view.beforeStep();
        m.setPlayerCommand(this.ctrl.command(me));
        m.step(DT);
        this.view.afterStep();
        this.acc -= DT;
        steps++;
      }
      if (steps === maxSteps) this.acc = 0;
    }
    if (!me) { this.freeYaw += frameDt * 0.1; }
    const feed = me ? m.gadgets.get(me.operating) : null;
    if (feed) { this.ctrl.yaw = feed.yaw; this.ctrl.pitch = feed.pitch; } // cameras clamp their look
    const viewing = this.view.viewAgent;
    if (viewing && viewing !== me) { look.yaw = viewing.yaw; look.pitch = viewing.pitch; }
    this.view.frame(frameDt, this.paused ? 1 : this.acc / DT, look, { dx: this.ctrl.lastDX, dy: this.ctrl.lastDY });
    this.hud.update(frameDt, this.r.camera, look.yaw, this.view.smokeDensity(), this.buy.visible);
    if (!input.locked && !this.paused && !this.buy.visible && !this.ended && me) this.clickToPlay.classList.remove('hidden');
  }

  dispose() {
    announcer.stop();
    this.input.gameFocus = false;
    this.input.onLockChange = () => {};
    this.view.dispose();
    this.hud.dispose();
    this.root.remove();
    this.match.events.clear();
  }
}
