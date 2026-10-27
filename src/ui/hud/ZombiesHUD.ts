import { Vector3, type PerspectiveCamera } from 'three';
import type { ZombiesMatch, Interaction } from '../../sim/zombies/ZombiesMatch';
import type { Agent } from '../../sim/entities/Agent';
import type { Settings } from '../../app/Profile';
import { PERKS, POWERUPS, ZOMBIES, ZOMBIE_TUNING, POWERUP_ORDER, type PowerUpId } from '../../config/zombies';
import { keyLabel } from '../../config/controls';
import { formatTime, clamp } from '../../core/math';
import { h, setText } from '../dom';

const TIMED: PowerUpId[] = POWERUP_ORDER.filter((k) => POWERUPS[k].duration > 0);

/**
 * Zombies overlay on top of the shared HUD: wave counter (CoD tally marks for 1–5), squad
 * points with floating "+10"s, perks, timed power-ups, the interaction prompt, revive and
 * bleed-out bars, teammate markers, the boss health bar, the exfil objective and the
 * gas / nuke / insta-kill screen effects.
 */
export class ZombiesHUD {
  readonly el: HTMLDivElement;
  private wave: HTMLElement; private waveSub: HTMLElement;
  private squad: HTMLElement; private perks: HTMLElement; private pups: HTMLElement;
  private popLayer: HTMLElement;
  private top: HTMLElement;
  private prompt: HTMLElement;
  private bar: HTMLElement; private barLabel: HTMLElement; private barFill: HTMLElement;
  private down: HTMLElement; private downTitle: HTMLElement; private downSub: HTMLElement; private downFill: HTMLElement;
  private banner: HTMLElement; private bannerUntil = 0;
  private markers: HTMLElement;
  private boss: HTMLElement; private bossFill: HTMLElement; private bossName: HTMLElement;
  private exfil: HTMLElement;
  private directive: HTMLElement; private threat: HTMLElement; private protection: HTMLElement;
  private gasOv: HTMLElement; private flashOv: HTMLElement; private instaOv: HTMLElement;
  private pointsEl: HTMLElement | null = null;
  private flash = 0;
  private lastWave = -1;
  private unsub: (() => void)[] = [];
  private tmp = new Vector3();

  constructor(private m: ZombiesMatch, private settings: () => Settings, private viewer: () => Agent | null) {
    this.el = h('div', { class: 'zhud' },
      this.gasOv = h('div', { class: 'z-gas' }),
      this.instaOv = h('div', { class: 'z-insta' }),
      this.flashOv = h('div', { class: 'z-flash' }),
      this.markers = h('div', { class: 'z-markers' }),
      this.popLayer = h('div', { class: 'z-pops' }),
      h('div', { class: 'z-left' },
        this.perks = h('div', { class: 'z-perks' }),
        this.squad = h('div', { class: 'z-squad' }),
        h('div', { class: 'z-wave-wrap' }, this.wave = h('div', { class: 'z-wave' }), this.waveSub = h('div', { class: 'z-wave-sub' }))),
      this.top = h('div', { class: 'z-top' }),
      this.directive = h('div', { class: 'z-directive' }),
      this.threat = h('div', { class: 'z-threat hidden' }),
      this.protection = h('div', { class: 'z-protection hidden' }),
      this.boss = h('div', { class: 'z-boss hidden' }, this.bossName = h('b', null, 'JUGGERNAUT'), h('div', { class: 'z-boss-bar' }, this.bossFill = h('i'))),
      this.exfil = h('div', { class: 'z-exfil hidden' }),
      this.pups = h('div', { class: 'z-pups' }),
      this.prompt = h('div', { class: 'z-prompt hidden' }),
      this.bar = h('div', { class: 'z-bar hidden' }, this.barLabel = h('div'), h('div', { class: 'z-bar-track' }, this.barFill = h('i'))),
      this.down = h('div', { class: 'z-down hidden' },
        this.downTitle = h('div', { class: 'z-down-title' }, 'YOU ARE DOWN'),
        this.downSub = h('div', { class: 'z-down-sub' }),
        h('div', { class: 'z-down-track' }, this.downFill = h('i'))),
      this.banner = h('div', { class: 'z-banner hidden' }),
    );
    this.wire();
  }

  private wire() {
    const ev = this.m.events;
    const mine = (id: number) => id === this.viewer()?.id;
    this.unsub.push(ev.on('zPoints', (e) => { if (mine(e.agentId)) this.pop(e.amount, e.reason); }));
    this.unsub.push(ev.on('zWave', (e) => {
      if (e.state === 'start') this.showBanner(`WAVE ${e.wave}`, e.kind === 'frenzy' ? 'FRENZY — they\'re fast and they\'re everywhere' : e.kind === 'boss' ? 'A JUGGERNAUT IS COMING' : `${e.count} zombies`, e.kind, 3.4);
      else this.showBanner(`WAVE ${e.wave} CLEARED`, `+${e.bonus} points to every survivor`, 'clear', 3);
    }));
    this.unsub.push(ev.on('zPowerUp', (e) => {
      if (e.state !== 'grab') return;
      const d = POWERUPS[e.kind];
      this.showBanner(d.name.toUpperCase(), d.blurb, 'pu', 2.4, d.color);
      if (e.kind === 'nuke') this.flash = 1;
    }));
    this.unsub.push(ev.on('zPower', () => this.showBanner('POWER ON', 'Perk machines and the Prototype Forge are online', 'clear', 3)));
    this.unsub.push(ev.on('zDoor', (e) => { if (mine(e.byId)) this.showBanner(this.m.gates.find((g) => g.def.id === e.gateId)?.def.name.toUpperCase() ?? 'DOOR OPEN', 'New area unlocked', 'small', 1.8); }));
    this.unsub.push(ev.on('zPerk', (e) => { if (e.gained && mine(e.agentId)) this.showBanner(PERKS[e.perk].name.toUpperCase(), PERKS[e.perk].blurb, 'pu', 2.6, PERKS[e.perk].color); }));
    this.unsub.push(ev.on('zBox', (e) => { if (e.state === 'teddy' && mine(e.byId)) this.showBanner('BYE BYE!', 'The Mystery Box is moving — your points were refunded', 'small', 2.6); }));
    this.unsub.push(ev.on('zForge', (e) => { if (e.state === 'ready' && mine(e.byId)) this.showBanner('UPGRADE READY', 'Grab it from the Prototype Forge', 'pu', 2.4, '#b06aff'); }));
    this.unsub.push(ev.on('zExfil', (e) => {
      if (e.state === 'available') this.showBanner('EXFIL AVAILABLE', 'Call it on the radio at the lobby reception desk', 'pu', 3.2, '#40ff60');
      else if (e.state === 'called') this.showBanner('EXFIL CALLED', 'Get to the landing zone in the Loading Yard!', 'boss', 3);
      else if (e.state === 'holding') this.showBanner('HOLD THE LZ', 'The chopper is on its way', 'boss', 2.6);
    }));
    this.unsub.push(ev.on('zDenied', (e) => { if (mine(e.agentId)) { this.prompt.classList.remove('deny'); void this.prompt.offsetWidth; this.prompt.classList.add('deny'); } }));
  }

  private pop(amount: number, reason: string) {
    if (!this.pointsEl) return;
    const r = this.pointsEl.getBoundingClientRect();
    const el = h('div', { class: 'z-pop' + (amount < 0 ? ' neg' : amount >= 100 ? ' big' : '') }, `${amount > 0 ? '+' : ''}${amount}`);
    el.style.left = `${r.right + 12 + Math.random() * 26}px`;
    el.style.top = `${r.top + r.height / 2 - 10 + (Math.random() - 0.5) * 14}px`;
    el.title = reason;
    this.popLayer.append(el);
    setTimeout(() => el.remove(), 1100);
    while (this.popLayer.children.length > 14) this.popLayer.firstElementChild?.remove();
  }

  showBanner(title: string, sub: string, kind: string, seconds: number, color?: string) {
    this.banner.innerHTML = '';
    this.banner.className = `z-banner ${kind}`;
    if (color) this.banner.style.setProperty('--c', color); else this.banner.style.removeProperty('--c');
    this.banner.append(h('b', null, title), sub ? h('small', null, sub) : '');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerUntil = performance.now() + seconds * 1000;
  }

  update(dt: number, camera: PerspectiveCamera) {
    const m = this.m, now = m.time, nowMs = performance.now();
    const me = m.player, v = this.viewer() ?? me;
    const s = this.settings();
    const F = keyLabel(s.bindings.use);
    // ---- wave counter: tally marks for 1–5, then a blood-red number
    if (m.wave !== this.lastWave) {
      this.lastWave = m.wave;
      this.wave.innerHTML = '';
      if (m.wave >= 1 && m.wave <= 5) {
        const tally = h('span', { class: 'z-tally' });
        for (let i = 0; i < m.wave; i++) tally.append(h('i', { class: i === 4 ? 'strike' : '' }));
        this.wave.append(tally);
      } else this.wave.append(String(Math.max(0, m.wave)));
      this.wave.classList.remove('bump'); void this.wave.offsetWidth; this.wave.classList.add('bump');
    }
    const phase = m.wavePhase;
    setText(this.waveSub, phase === 'pre' ? `GET READY · ${Math.ceil(m.timeLeft())}` : phase === 'intermission' ? `NEXT WAVE · ${Math.ceil(m.timeLeft())}` : phase === 'exfil' ? 'EXFIL' : m.waveKindNow === 'frenzy' ? 'FRENZY' : m.waveKindNow === 'boss' ? 'BOSS WAVE' : 'WAVE');
    // ---- top line
    const left = m.zombiesLeft();
    setText(this.top, phase === 'active' ? `${left} ZOMBIE${left === 1 ? '' : 'S'} LEFT` : phase === 'intermission' ? 'WAVE CLEARED — RESUPPLY' : phase === 'pre' ? 'HOLD THE LOBBY' : '');
    this.top.style.setProperty('--progress', `${phase === 'active' ? clamp(m.killedThisWave / Math.max(1, m.waveTotal), 0, 1) * 100 : 0}%`);
    this.updateGuidance(v, phase, left);
    // ---- squad points
    const key = m.humans.map((a) => `${a.id}:${a.money}:${a.alive ? (a.zp!.downed ? 'd' : 'a') : 'x'}`).join('|') + (now < m.timers.doublePoints ? 'x2' : '');
    if (this.squad.dataset.k !== key) {
      this.squad.dataset.k = key;
      this.squad.innerHTML = '';
      this.pointsEl = null;
      for (const a of m.humans) {
        const zp = a.zp!;
        const row = h('div', { class: 'z-row' + (a === me ? ' me' : '') + (zp.downed ? ' downed' : '') + (!a.alive ? ' dead' : '') },
          h('i', { style: { background: zp.color } }),
          h('span', { class: 'n' }, a.name),
          h('b', null, a.money.toLocaleString('en-US')),
          a === me && now < m.timers.doublePoints ? h('em', null, 'x2') : null,
          zp.downed ? h('span', { class: 'st' }, '✚ DOWN') : !a.alive ? h('span', { class: 'st' }, '✖') : null);
        if (a === me) this.pointsEl = row.querySelector('b');
        this.squad.append(row);
      }
    }
    // ---- perks of whoever we're watching
    const pk = v?.zp ? v.zp.perks.join(',') + (v.zp.reviveKit ? '+kit' : '') : '';
    if (this.perks.dataset.k !== pk) {
      this.perks.dataset.k = pk;
      this.perks.innerHTML = '';
      for (const p of v?.zp?.perks ?? []) this.perks.append(h('i', { class: 'z-perk', title: PERKS[p].name, style: { background: PERKS[p].color } }, PERKS[p].glyph));
      if (v?.zp?.reviveKit) this.perks.append(h('i', { class: 'z-perk kit', title: 'Self-Revive Kit' }, '♥'));
    }
    // ---- timed power-ups
    const active = TIMED.filter((k) => m.timerLeft(k as 'instaKill' | 'doublePoints' | 'fireSale') > 0);
    const puKey = active.map((k) => `${k}:${Math.ceil(m.timerLeft(k as 'instaKill'))}`).join('|');
    if (this.pups.dataset.k !== puKey) {
      this.pups.dataset.k = puKey;
      this.pups.innerHTML = '';
      for (const k of active) {
        const left2 = m.timerLeft(k as 'instaKill');
        this.pups.append(h('div', { class: 'z-pu' + (left2 < 5 ? ' blink' : ''), style: { borderColor: POWERUPS[k].color, color: POWERUPS[k].color } },
          h('b', null, POWERUPS[k].glyph), h('small', null, String(Math.ceil(left2)))));
      }
    }
    this.instaOv.style.opacity = now < m.timers.instaKill ? '1' : '0';
    // ---- interaction prompt + hold bars
    const it = me && me.alive ? m.interactionFor(me) : null;
    this.renderPrompt(it, F);
    let bar: { label: string; p: number } | null = null;
    if (it?.kind === 'revive' && (it.progress ?? 0) > 0) bar = { label: `REVIVING ${it.label.toUpperCase()}`, p: it.progress ?? 0 };
    const meDown = !!me?.zp?.downed;
    if (meDown && me!.zp!.revive) bar = { label: `${m.getAgent(me!.zp!.revive.byId)?.name.toUpperCase() ?? 'A TEAMMATE'} IS REVIVING YOU`, p: me!.zp!.revive.progress };
    this.bar.classList.toggle('hidden', !bar);
    if (bar) { setText(this.barLabel, bar.label); this.barFill.style.width = `${Math.round(clamp(bar.p, 0, 1) * 100)}%`; }
    // ---- downed overlay
    this.down.classList.toggle('hidden', !meDown);
    this.el.classList.toggle('is-down', meDown);
    if (meDown && me) {
      const zp = me.zp!;
      if (zp.selfReviveAt > 0) {
        setText(this.downTitle, 'GETTING BACK UP');
        setText(this.downSub, zp.perks.length ? '' : 'Second Wind / your revive kit kicked in — keep shooting');
        this.downFill.style.width = `${Math.round(clamp(1 - (zp.selfReviveAt - now) / ZOMBIE_TUNING.selfReviveTime, 0, 1) * 100)}%`;
        this.downFill.className = 'up';
      } else {
        const bleed = Math.max(0, zp.bleedUntil - now);
        setText(this.downTitle, 'YOU ARE DOWN');
        setText(this.downSub, `Bleeding out in ${Math.ceil(bleed)}s — shoot with your pistol and wait for a teammate`);
        this.downFill.style.width = `${Math.round(clamp(bleed / m.diff.bleedOut, 0, 1) * 100)}%`;
        this.downFill.className = '';
      }
    }
    // ---- teammates that need a revive, power-up and exfil markers
    this.drawMarkers(camera, me);
    // ---- boss bar
    const tank = m.zombiePool.find((z) => z.alive && z.zombie!.boss);
    this.boss.classList.toggle('hidden', !tank);
    if (tank) {
      setText(this.bossName, `${ZOMBIES.tank.name.toUpperCase()}${tank.zombie!.mode === 'dazed' ? ' · DAZED — DOUBLE DAMAGE' : ''}`);
      this.bossFill.style.width = `${Math.round(clamp(tank.health / tank.maxHealth, 0, 1) * 1000) / 10}%`;
    }
    // ---- exfil objective
    const ex = m.exfil;
    const exOn = ex.phase === 'called' || ex.phase === 'holding' || ex.phase === 'available';
    this.exfil.classList.toggle('hidden', !exOn);
    if (exOn) {
      const inLz = m.humans.filter((a) => a.alive && !a.zp!.downed && m.inLz(a)).length;
      const txt = ex.phase === 'available' ? `EXFIL AVAILABLE — use the radio at the lobby reception (${F})`
        : ex.phase === 'called' ? `REACH THE LANDING ZONE · ${formatTime(ex.until - now)}`
          : `HOLD THE LZ · CHOPPER IN ${formatTime(ex.until - now)} · ${inLz} in the zone`;
      setText(this.exfil, txt);
      this.exfil.classList.toggle('urgent', ex.phase !== 'available' && ex.until - now < 15);
    }
    // ---- overlays
    const inGas = !!me && me.alive && m.gas.some((g) => Math.hypot(me.pos.x - g.pos.x, me.pos.z - g.pos.z) < g.radius && Math.abs(me.pos.y - g.pos.y) < 2.5);
    this.gasOv.style.opacity = inGas ? '1' : '0';
    this.flash = Math.max(0, this.flash - dt * 0.9);
    this.flashOv.style.opacity = String(this.flash);
    if (nowMs > this.bannerUntil) this.banner.classList.remove('show');
  }

  private renderPrompt(it: Interaction | null, F: string) {
    const key = it ? `${F}|${it.kind}|${it.label}|${it.price}|${it.ok}|${it.reason}` : '';
    if (this.prompt.dataset.k === key) return;
    this.prompt.dataset.k = key;
    this.prompt.classList.toggle('hidden', !it);
    this.prompt.innerHTML = '';
    if (!it) return;
    const price = it.price > 0 ? h('span', { class: 'cost' + (it.ok ? '' : ' no') }, `${it.price.toLocaleString('en-US')}`) : null;
    this.prompt.classList.toggle('blocked', !it.ok);
    for (const el of [
      h('span', { class: 'key' }, F),
      h('span', null, `${it.hold ? 'Hold' : 'Press'} to ${it.verb} `),
      h('b', null, it.label),
      price,
      !it.ok && it.reason ? h('small', null, it.reason) : null,
    ]) if (el) this.prompt.append(el);
  }

  private drawMarkers(camera: PerspectiveCamera, me: Agent | null) {
    const m = this.m;
    const marks: { x: number; y: number; z: number; cls: string; label: string; icon: string }[] = [];
    for (const a of m.humans) {
      if (a === me || !a.alive || !a.zp!.downed) continue;
      const left = a.zp!.selfReviveAt > 0 ? 'getting up' : `${Math.ceil(Math.max(0, a.zp!.bleedUntil - m.time))}s`;
      marks.push({ x: a.pos.x, y: a.pos.y + 0.9, z: a.pos.z, cls: 'revive', label: `${a.name} · ${left}`, icon: '✚' });
    }
    if (m.exfil.phase === 'called' || m.exfil.phase === 'holding') marks.push({ x: m.layout.lz.x, y: 1.5, z: m.layout.lz.z, cls: 'lz', label: 'LZ', icon: 'H' });
    if (m.exfil.phase === 'available') marks.push({ x: m.layout.radio.x, y: 1.6, z: m.layout.radio.z, cls: 'radio', label: 'EXFIL RADIO', icon: '☎' });
    // Once the full wave has spawned, make the last stragglers easy to find.
    if (m.wavePhase === 'active' && m.spawned >= m.waveTotal && m.zombiesLeft() <= 3) {
      for (const z of m.aliveZombies()) marks.push({ x: z.pos.x, y: z.pos.y + 1.5, z: z.pos.z, cls: 'last', label: ZOMBIES[z.zombie!.kind].name.toUpperCase(), icon: '◇' });
    }
    while (this.markers.children.length < marks.length) this.markers.append(h('div', { class: 'z-mark' }, h('i'), h('span')));
    [...this.markers.children].forEach((el, i) => {
      const e = el as HTMLElement, mk = marks[i];
      if (!mk) { e.style.display = 'none'; return; }
      const at = this.tmp.set(mk.x, mk.y, mk.z);
      const dist = at.distanceTo(camera.position);
      const p = at.project(camera);
      let x = (p.x * 0.5 + 0.5) * window.innerWidth, y = (-p.y * 0.5 + 0.5) * window.innerHeight;
      const behind = p.z > 1;
      if (behind) { x = window.innerWidth - x; y = window.innerHeight * 0.8; }
      x = Math.max(30, Math.min(window.innerWidth - 30, x)); y = Math.max(60, Math.min(window.innerHeight - 80, y));
      e.style.display = '';
      e.className = `z-mark ${mk.cls}${behind ? ' behind' : ''}`;
      e.style.transform = `translate(${x}px, ${y}px)`;
      setText(e.firstElementChild as HTMLElement, mk.icon);
      setText(e.lastElementChild as HTMLElement, `${mk.label} · ${Math.round(dist)}m`);
    });
  }

  private updateGuidance(v: Agent | null, phase: ZombiesMatch['wavePhase'], left: number) {
    const m = this.m, now = m.time;
    const hint = phase === 'over' ? '' : phase === 'exfil' ? 'EXTRACTION\nReach the Loading Yard. Stay inside the landing zone.'
      : phase === 'active' && m.spawned >= m.waveTotal && left <= 3 ? 'CLEAR THE WAVE\nLast enemies marked. Finish them to resupply.'
        : !m.power ? 'RESTORE POWER\nOpen a route to the Server Room to activate perks and the forge.'
          : phase === 'intermission' ? 'RESUPPLY\nRefill ammo, repair armor and collect your upgrades.'
            : 'POWER ONLINE\nPerks and the Prototype Forge are ready.';
    setText(this.directive, hint);
    this.directive.classList.toggle('hidden', !hint);
    const grace = v?.zp && !v.zp.downed ? v.zp.protectedUntil - now : 0;
    this.protection.classList.toggle('hidden', grace <= 0);
    if (grace > 0) setText(this.protection, `REVIVE PROTECTION · ${grace.toFixed(1)}s`);
    // Only warn about a nearby, unobstructed windup. World-space rings show the area.
    let warning = '';
    if (v?.alive && !v.zp?.downed && phase !== 'over') {
      let nearest = Infinity;
      for (const z of m.zombiePool) {
        if (!z.alive) continue;
        const mode = z.zombie!.mode;
        const text = mode === 'fuse' ? 'BOMBER — GET CLEAR' : mode === 'roar' || mode === 'charge' ? 'JUGGERNAUT — SIDESTEP'
          : mode === 'slam' ? 'GROUND SLAM — BACK UP' : mode === 'scream' ? 'SHRIEKER — PRIORITY TARGET' : '';
        if (!text) continue;
        const d = z.pos.distanceTo(v.pos);
        if (d < nearest && d < 18 && !m.world.collision.segmentBlocked(v.eyePos(this.tmp), z.centerPos(new Vector3()))) { nearest = d; warning = text; }
      }
    }
    setText(this.threat, warning);
    this.threat.classList.toggle('hidden', !warning);
  }

  dispose() { for (const u of this.unsub) u(); this.el.remove(); }
}
