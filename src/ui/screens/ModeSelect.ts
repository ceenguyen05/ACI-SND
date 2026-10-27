import { DIFFICULTY, type BotDifficulty } from '../../config/difficulty';
import { MATCH_LENGTHS, TEAM_NAMES, type MatchLength, type Team } from '../../config/rules';
import { ZDIFF, ZLENGTHS, ZOMBIE_ORDER, type ZDifficulty, type ZLength } from '../../config/zombies';
import type { Profile } from '../../app/Profile';
import type { GameMode } from '../../app/GameSession';
import { ACI_HQ } from '../../sim/maps/aciHq';
import { renderOverview } from '../hud/Radar';
import { sfx } from '../../audio/Sfx';
import { h } from '../dom';
import { optRow, seg, toggle } from '../components';
import { zombieArt } from './art';

export interface ModeSelectCallbacks {
  back(): void;
  start(mode: GameMode, spectate: boolean): void;
  changed(): void;
  /** Which mode is highlighted (the menu backdrop shows a zombie for Zombies). */
  focus(mode: GameMode | null): void;
}

/**
 * "Play Now": two big tilting mode cards. Picking one slides its setup panel in; Enter
 * starts, Esc goes back. Mouse, keyboard (← → Enter Esc) and touch all work.
 */
export class ModeSelect {
  readonly el: HTMLDivElement;
  private cards: Record<GameMode, HTMLElement>;
  private setup: HTMLElement;
  private hover: GameMode = 'snd';
  private picked: GameMode | null = null;

  constructor(private profile: Profile, private cb: ModeSelectCallbacks, preselect?: GameMode) {
    this.cards = { snd: this.sndCard(), zombies: this.zombiesCard() };
    this.setup = h('div', { class: 'ms-setup' });
    this.el = h('div', { class: 'ms' },
      h('div', { class: 'ms-head' },
        h('button', { class: 'mm-back', onclick: () => { sfx.ui_click(); this.back(); }, onmouseenter: () => sfx.ui_hover() }, h('i', null, '◀'), 'Back'),
        h('div', null, h('div', { class: 'ms-kicker' }, 'Play now'), h('h1', { class: 'page-title' }, 'Select a mode'))),
      h('div', { class: 'ms-stage' }, h('div', { class: 'ms-cards' }, this.cards.snd, this.cards.zombies), this.setup),
      h('div', { class: 'ms-hint' }, '← → choose · Enter select · Esc back'));
    this.setHover(preselect ?? 'snd', false);
    if (preselect) this.pick(preselect, false);
  }

  dispose() { /* listeners are on our own elements */ }

  onKey(e: KeyboardEvent) {
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); sfx.ui_click(); this.back(); return; }
    if (this.picked) {
      if (e.code === 'Enter') { e.preventDefault(); sfx.ui_click(); this.cb.start(this.picked, false); }
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this.setHover('snd'); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); this.setHover('zombies'); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.pick(this.hover); }
  }

  private back() {
    if (this.picked) {
      this.picked = null;
      this.el.classList.remove('picked');
      for (const c of Object.values(this.cards)) c.classList.remove('on');
      this.setHover(this.hover, false);
      this.cb.focus(null);
      return;
    }
    this.cb.focus(null);
    this.cb.back();
  }

  private setHover(mode: GameMode, sound = true) {
    if (this.picked) return;
    if (sound && mode !== this.hover) sfx.ui_hover();
    this.hover = mode;
    for (const [k, c] of Object.entries(this.cards)) c.classList.toggle('hot', k === mode);
  }

  private pick(mode: GameMode, sound = true) {
    if (sound) sfx.ui_click();
    this.picked = mode;
    this.hover = mode;
    for (const [k, c] of Object.entries(this.cards)) { c.classList.toggle('on', k === mode); c.classList.toggle('hot', k === mode); c.style.transform = ''; }
    this.setup.innerHTML = '';
    this.setup.append(mode === 'snd' ? this.sndSetup() : this.zombiesSetup());
    this.el.classList.remove('picked'); void this.el.offsetWidth; this.el.classList.add('picked');
    this.cb.focus(mode);
  }

  /** 3D tilt + moving glare under the mouse. */
  private tilt(card: HTMLElement) {
    card.addEventListener('mousemove', (e) => {
      if (this.picked) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 12}deg) rotateX(${(0.5 - y) * 9}deg) translateY(-6px)`;
      card.style.setProperty('--gx', `${x * 100}%`); card.style.setProperty('--gy', `${y * 100}%`);
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  }

  private card(mode: GameMode, art: HTMLElement, tag: string, title: string, desc: string, bullets: string[], extra: HTMLElement | null) {
    const c = h('button', { class: `ms-card ${mode}`, onclick: () => (this.picked === mode ? null : this.pick(mode)), onmouseenter: () => this.setHover(mode) },
      h('div', { class: 'ms-art' }, art),
      h('div', { class: 'ms-glare' }),
      h('div', { class: 'ms-body' },
        h('span', { class: 'ms-tag' }, tag),
        h('h2', null, title),
        h('p', null, desc),
        h('ul', null, ...bullets.map((b) => h('li', null, b))),
        extra,
        h('span', { class: 'ms-cta' }, 'Select ›')));
    this.tilt(c);
    return c;
  }

  private sndCard() {
    const art = h('div', { class: 'ms-snd-art' }, renderOverview(ACI_HQ, 3));
    const st = this.profile.stats;
    return this.card('snd', art, 'Tactical · round based', 'Search & Destroy',
      'Attackers plant the bomb at A or B; Defenders stop them. One life per round — every bullet counts.',
      ['1v1 up to 5v5 against bots', 'CS economy, gadgets, killstreaks and the Gunsmith', 'Final killcam and clutch moments'],
      h('div', { class: 'ms-chip' }, `${st.matches} matches · ${st.wins} wins`));
  }

  private zombiesCard() {
    const best = Math.max(0, ...Object.values(this.profile.zstats.best).map((x) => x ?? 0));
    return this.card('zombies', zombieArt(460, 230), 'Co-op survival · endless waves', 'Zombies',
      'Hold ACI HQ against the outbreak. Start with a knife and a pistol and earn your way to perks, wonder weapons and an escape.',
      [`Squads of 1, 3 or 5 · ${ZOMBIE_ORDER.length} zombie types and boss waves`, 'Wall weapons, Mystery Box, perks, Prototype Forge', 'Power-ups, frenzy waves and an exfil to win'],
      h('div', { class: 'ms-chip z' }, best ? `Best wave: ${best}` : 'New!'));
  }

  private start(mode: GameMode) {
    return h('div', { class: 'ms-start' },
      h('button', { class: 'btn primary ms-go', onclick: () => { sfx.ui_click(); this.cb.start(mode, false); } }, 'Start match'),
      h('button', { class: 'btn', onclick: () => { sfx.ui_click(); this.cb.start(mode, true); } }, 'Watch bots'));
  }

  private sndSetup() {
    const mp = this.profile.match;
    const save = () => this.cb.changed();
    const grid = h('div', { class: 'opt-grid' });
    const add = (l: string, c: HTMLElement) => grid.append(...optRow(l, c));
    add('Your side', seg<Team | 'auto'>([{ value: 'T', label: TEAM_NAMES.T }, { value: 'CT', label: TEAM_NAMES.CT }, { value: 'auto', label: 'Auto' }], mp.side, (v) => { mp.side = v; save(); }));
    add('Team size', seg([1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}v${n}` })), mp.teamSize, (v) => { mp.teamSize = v; save(); }));
    add('Bot difficulty', seg((Object.keys(DIFFICULTY) as BotDifficulty[]).map((d) => ({ value: d, label: DIFFICULTY[d].label })), mp.difficulty, (v) => { mp.difficulty = v; save(); }));
    add('Match length', seg((Object.keys(MATCH_LENGTHS) as MatchLength[]).map((k) => ({ value: k, label: MATCH_LENGTHS[k].label })), mp.length, (v) => { mp.length = v; save(); }));
    add('Freeze time', seg([5, 10, 15].map((n) => ({ value: n, label: n + 's' })), mp.freezeTime, (v) => { mp.freezeTime = v; save(); }));
    add('Friendly fire', toggle(mp.friendlyFire, (v) => { mp.friendlyFire = v; save(); }));
    add('Killstreaks', toggle(mp.killstreaks ?? true, (v) => { mp.killstreaks = v; save(); }));
    return h('div', { class: 'card ms-panel' }, h('h3', null, 'Search & Destroy · ACI HQ'), grid, this.start('snd'));
  }

  private zombiesSetup() {
    const zp = this.profile.zombies;
    const save = () => this.cb.changed();
    const diffNote = h('div', { class: 'ms-note' }, ZDIFF[zp.difficulty].blurb);
    const lenNote = h('div', { class: 'ms-note' }, ZLENGTHS[zp.length].blurb);
    const squadNote = h('div', { class: 'ms-note' });
    const squadText = () => { squadNote.textContent = zp.players === 1 ? 'Just you. Second Wind lets you get back up (3 times).' : `You and ${zp.players - 1} bot teammates — they revive you, share power-ups and buy their own gear.`; };
    squadText();
    const squad = h('div', { class: 'ms-squad' }, ...([1, 3, 5] as const).map((n) => h('button', {
      class: 'ms-squad-btn' + (zp.players === n ? ' on' : ''),
      onclick: (e: MouseEvent) => {
        zp.players = n; save(); sfx.ui_click(); squadText();
        for (const b of squad.children) b.classList.toggle('on', b === e.currentTarget);
      },
    }, h('span', { class: 'ms-dots' }, ...Array.from({ length: n }, (_, i) => h('i', { class: i === 0 ? 'me' : '' }))), h('b', null, n === 1 ? 'Solo' : `Squad of ${n}`))));
    const grid = h('div', { class: 'opt-grid' });
    const add = (l: string, c: HTMLElement) => grid.append(...optRow(l, c));
    add('Difficulty', h('div', null, seg((Object.keys(ZDIFF) as ZDifficulty[]).map((d) => ({ value: d, label: ZDIFF[d].label })), zp.difficulty, (v) => { zp.difficulty = v; diffNote.textContent = ZDIFF[v].blurb; save(); }), diffNote));
    add('Game length', h('div', null, seg((Object.keys(ZLENGTHS) as ZLength[]).map((k) => ({ value: k, label: ZLENGTHS[k].label })), zp.length, (v) => { zp.length = v; lenNote.textContent = ZLENGTHS[v].blurb; save(); }), lenNote));
    const best = this.profile.zstats.best[zp.difficulty];
    return h('div', { class: 'card ms-panel z' },
      h('h3', null, 'Zombies · ACI HQ: Outbreak'),
      h('div', { class: 'ms-label' }, 'Squad'), squad, squadNote,
      grid,
      h('div', { class: 'ms-note small' }, best ? `Your best on this difficulty: wave ${best}.` : 'Tip: open doors early — and find the power switch in the Server Room.'),
      this.start('zombies'));
  }
}
