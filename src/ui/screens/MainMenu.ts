import { HEADGEAR_OPTIONS, FINISHES, OUTFITS, PALETTE, RARITY_COLORS, SKIN_TONES, STYLE_OPTIONS, type AgentLook } from '../../config/cosmetics';
import { TEAM_NAMES, type Team } from '../../config/rules';
import { WEAPON_LIST, type WeaponId } from '../../config/weapons';
import { UTILITIES, UTILITY_ORDER } from '../../config/utilities';
import { STREAKS, STREAK_ORDER } from '../../sim/mode/Killstreaks';
import { GADGETS, GADGET_ORDER } from '../../config/gadgets';
import { ZOMBIES, ZOMBIE_ORDER, PERKS, PERK_ORDER, POWERUPS, POWERUP_ORDER, ZDIFF } from '../../config/zombies';
import { keyLabel } from '../../config/controls';
import type { Profile, Settings } from '../../app/Profile';
import type { Input } from '../../app/Input';
import type { GameMode } from '../../app/GameSession';
import { sfx } from '../../audio/Sfx';
import { h } from '../dom';
import { optRow, seg, swatches } from '../components';
import { SettingsPanel } from './SettingsPanel';
import { ModeSelect } from './ModeSelect';
import { zombieArt } from './art';

export type MenuPage = 'home' | 'play' | 'agents' | 'loadout' | 'settings' | 'about' | 'help';

export const GAME_TITLE = 'ACI: Series 1';
export const GAME_VERSION = 'v1.1';

export interface MenuCallbacks {
  start(mode: GameMode, spectate: boolean): void;
  profileChanged(): void;
  settingsChanged(s: Settings): void;
  /** Page / showcase context changed (3D showcase in the lobby behind the menu). */
  pageChanged(page: MenuPage, ctx: { team: Team; weapon: WeaponId; mode: GameMode | null }): void;
}

/** ACI : SERIES 1 logo (letters animate in). */
function logo(cls = 'logo') {
  const letters = (s: string, d0: number) => [...s].map((c, i) => h('span', { class: 'lt', style: { animationDelay: `${d0 + i * 45}ms` } }, c === ' ' ? ' ' : c));
  return h('div', { class: cls }, h('span', { class: 'aci' }, ...letters('ACI', 0)), h('span', { class: 'colon' }, ':'), h('span', { class: 'series' }, ...letters('SERIES 1', 180)));
}

export class TitleScreen {
  readonly el: HTMLDivElement;
  constructor(onContinue: () => void) {
    let done = false;
    const go = () => { if (done) return; done = true; window.removeEventListener('keydown', go); this.el.classList.add('leaving'); setTimeout(onContinue, 260); };
    this.el = h('div', { class: 'title-screen', onclick: go },
      logo('title-logo'),
      h('div', { class: 'title-modes' }, h('span', null, 'Search & Destroy'), h('i'), h('span', null, 'Zombies')),
      h('div', { class: 'press-any' }, 'Click or press any key'),
      h('div', { class: 'title-foot' }, 'ACI HQ · Offline with bots · Built with Three.js'));
    window.addEventListener('keydown', go);
  }
}

export class MainMenu {
  readonly el: HTMLDivElement;
  private page: HTMLDivElement;
  private home: HTMLDivElement;
  private current: MenuPage = 'home';
  private agentTeam: Team = 'T';
  private loadoutWeapon: WeaponId = 'ravager';
  private settingsPanel: SettingsPanel;
  private modes: ModeSelect | null = null;
  private items: HTMLButtonElement[] = [];
  private focus = 0;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(private profile: Profile, private cb: MenuCallbacks, private input: Input) {
    this.settingsPanel = new SettingsPanel(() => this.profile.settings, (s) => cb.settingsChanged(s), input);
    this.page = h('div', { class: 'mm-page hidden' });
    this.home = h('div', { class: 'mm-home' });
    this.el = h('div', { class: 'menu mm' }, this.home, this.page);
    this.el.addEventListener('mousemove', (e) => {
      const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5;
      this.el.style.setProperty('--px', String(x)); this.el.style.setProperty('--py', String(y));
    });
    window.addEventListener('keydown', this.keyHandler);
    this.show('home');
  }

  dispose() { window.removeEventListener('keydown', this.keyHandler); this.modes?.dispose(); }

  private onKey(e: KeyboardEvent) {
    if (this.input.captureNext || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (this.modes) { this.modes.onKey(e); return; }
    if (this.current !== 'home') { if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); sfx.ui_click(); this.show('home'); } return; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.setFocus(this.focus + 1); e.preventDefault(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.setFocus(this.focus - 1); e.preventDefault(); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.items[this.focus]?.click(); }
  }

  private setFocus(i: number) {
    if (!this.items.length) return;
    this.focus = (i + this.items.length) % this.items.length;
    this.items.forEach((b, k) => b.classList.toggle('focus', k === this.focus));
    sfx.ui_hover();
  }

  show(p: MenuPage) {
    this.current = p;
    if (p === 'play') { this.openModes(); return; }
    this.home.classList.toggle('hidden', p !== 'home');
    this.page.classList.toggle('hidden', p === 'home');
    if (p === 'home') this.renderHome();
    else {
      this.page.innerHTML = '';
      const titles: Record<string, string> = { agents: 'Operators', loadout: 'Loadout', settings: 'Settings', about: 'About', help: 'How to play' };
      const body = h('div', { class: 'mm-page-body' });
      this.page.append(h('div', { class: 'mm-page-head' },
        h('button', { class: 'mm-back', onclick: () => { sfx.ui_click(); this.show('home'); }, onmouseenter: () => sfx.ui_hover() }, h('i', null, '◀'), 'Back'),
        h('h1', { class: 'page-title' }, titles[p] ?? p)), body);
      this.page.classList.remove('enter'); void this.page.offsetWidth; this.page.classList.add('enter');
      ({ agents: () => this.renderAgents(body), loadout: () => this.renderLoadout(body), settings: () => this.renderSettings(body), about: () => this.renderAbout(body), help: () => this.renderHelp(body) } as Record<string, () => void>)[p]?.();
    }
    this.cb.pageChanged(p, { team: this.agentTeam, weapon: this.loadoutWeapon, mode: null });
  }

  private save() { this.cb.profileChanged(); }

  // -------------------------------------------------------------- HOME
  private renderHome() {
    this.home.innerHTML = '';
    this.items = [];
    const item = (idx: string, label: string, desc: string, page: MenuPage, primary = false) => {
      const b = h('button', {
        class: 'mm-item' + (primary ? ' primary' : ''),
        onclick: () => { sfx.ui_click(); this.show(page); },
        onmouseenter: () => { const i = this.items.indexOf(b); if (i >= 0) { this.focus = i; this.items.forEach((x, k) => x.classList.toggle('focus', k === i)); } sfx.ui_hover(); },
      }, h('span', { class: 'mm-idx' }, idx), h('span', { class: 'mm-label' }, label), h('span', { class: 'mm-desc' }, desc), h('span', { class: 'mm-arrow' }, '›')) as HTMLButtonElement;
      this.items.push(b);
      return b;
    };
    const link = (label: string, page: MenuPage) => h('button', { class: 'mm-link', onclick: () => { sfx.ui_click(); this.show(page); }, onmouseenter: () => sfx.ui_hover() }, label);
    const st = this.profile.stats, zs = this.profile.zstats;
    const best = Math.max(0, ...Object.values(zs.best).map((x) => x ?? 0));
    const stat = (v: string | number, l: string) => h('div', null, h('b', null, String(v)), h('span', null, l));
    this.home.append(
      h('div', { class: 'mm-left' },
        logo('mm-logo'),
        h('div', { class: 'mm-tag' }, 'Tactical shooter · ACI HQ'),
        h('nav', { class: 'mm-nav' },
          item('01', 'Play Now', 'Search & Destroy or Zombies', 'play', true),
          item('02', 'Settings', 'Controls, video, audio, gameplay', 'settings'),
          item('03', 'About', 'Game modes, credits and version', 'about')),
        h('div', { class: 'mm-links' }, link('Operators', 'agents'), h('i'), link('Loadout', 'loadout'), h('i'), link('How to play', 'help')),
        h('div', { class: 'mm-foot' }, 'Signed in as ', h('b', null, this.profile.name), ` · ${GAME_VERSION} · ↑ ↓ Enter to navigate`)),
      h('div', { class: 'mm-right' },
        h('button', { class: 'mm-feature', onclick: () => { sfx.ui_click(); this.openModes('zombies'); }, onmouseenter: () => sfx.ui_hover() },
          h('div', { class: 'mm-feature-art' }, zombieArt(420, 200)),
          h('div', { class: 'mm-feature-body' },
            h('span', { class: 'tag' }, 'New mode'),
            h('h3', null, 'Zombies — ACI HQ: Outbreak'),
            h('p', null, 'Hold the building against endless waves with up to four bot teammates. Earn points, open the doors, find the Mystery Box, forge your guns.'),
            h('span', { class: 'mm-feature-cta' }, 'Play Zombies ›'))),
        h('div', { class: 'mm-career' },
          h('div', { class: 'mm-career-col' }, h('h4', null, 'Search & Destroy'), h('div', { class: 'stat-row' }, stat(st.matches, 'Matches'), stat(st.wins, 'Wins'), stat(st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills, 'K/D'))),
          h('div', { class: 'mm-career-col z' }, h('h4', null, 'Zombies'), h('div', { class: 'stat-row' }, stat(best || '—', 'Best wave'), stat(zs.kills, 'Kills'), stat(zs.exfils, 'Exfils'))))));
    this.setFocus(Math.min(this.focus, this.items.length - 1));
  }

  private openModes(preselect?: GameMode) {
    this.home.classList.add('hidden');
    this.page.classList.add('hidden');
    this.modes = new ModeSelect(this.profile, {
      back: () => { this.modes?.dispose(); this.modes?.el.remove(); this.modes = null; this.show('home'); },
      start: (mode, spectate) => this.cb.start(mode, spectate),
      changed: () => this.save(),
      focus: (mode) => this.cb.pageChanged('play', { team: this.agentTeam, weapon: this.loadoutWeapon, mode }),
    }, preselect);
    this.el.append(this.modes.el);
    this.current = 'play';
    this.cb.pageChanged('play', { team: this.agentTeam, weapon: this.loadoutWeapon, mode: preselect ?? null });
  }

  // -------------------------------------------------------------- OPERATORS
  private renderAgents(body: HTMLElement) {
    const team = this.agentTeam;
    const look = this.profile.looks[team];
    const changed = () => { this.save(); this.cb.pageChanged('agents', { team: this.agentTeam, weapon: this.loadoutWeapon, mode: null }); };
    const nameInput = h('input', { class: 'text-input', value: this.profile.name, maxlength: '16' }) as HTMLInputElement;
    nameInput.addEventListener('change', () => { this.profile.name = nameInput.value.trim().slice(0, 16) || 'Player'; this.save(); });
    const presets = h('div', { class: 'col' });
    for (const o of OUTFITS.filter((x) => x.team === team)) {
      presets.append(h('button', {
        class: 'weapon-tile' + (look.outfit === o.id ? ' on' : ''),
        onclick: () => { this.profile.looks[team] = { ...o.look }; changed(); this.show('agents'); },
      }, h('div', { class: 'wn' }, o.name), h('div', { class: 'wf muted' }, o.desc)));
    }
    const set = <K extends keyof AgentLook>(k: K, v: AgentLook[K]) => { look[k] = v; changed(); };
    const grid = h('div', { class: 'opt-grid' });
    const add = (l: string, c: HTMLElement) => grid.append(...optRow(l, c));
    add('Gear', seg(STYLE_OPTIONS.map((s) => ({ value: s.id, label: s.name })), look.style, (v) => set('style', v)));
    add('Headgear', seg(HEADGEAR_OPTIONS.map((s) => ({ value: s.id, label: s.name })), look.headgear, (v) => set('headgear', v)));
    add('Jacket', swatches(PALETTE, look.primary, (c) => set('primary', c)));
    add('Trousers', swatches(PALETTE, look.secondary, (c) => set('secondary', c)));
    add('Accent', swatches(PALETTE, look.accent, (c) => set('accent', c)));
    add('Skin tone', swatches(SKIN_TONES, look.skin, (c) => set('skin', c)));
    body.append(
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('span', { class: 'muted' }, 'Callsign'), nameInput),
      h('div', { class: 'row', style: 'gap:12px;align-items:center' }, seg<Team>([{ value: 'T', label: TEAM_NAMES.T }, { value: 'CT', label: TEAM_NAMES.CT }], team, (t) => { this.agentTeam = t; this.show('agents'); }),
        h('span', { class: 'muted', style: 'font-size:13px' }, 'Your Defenders look is also used in Zombies.')),
      h('div', { class: 'row', style: 'align-items:flex-start;margin-top:14px;gap:16px;max-width:700px' },
        h('div', { class: 'card', style: 'width:220px;flex:none' }, h('h3', null, 'Presets'), presets),
        h('div', { class: 'card grow' }, h('h3', null, 'Customize'), grid)));
  }

  // -------------------------------------------------------------- LOADOUT
  private renderLoadout(body: HTMLElement) {
    const fin = this.profile.finishes;
    const grid = h('div', { class: 'weapon-grid' });
    for (const w of WEAPON_LIST) {
      const f = FINISHES.find((x) => x.id === (fin[w.id] ?? 'factory'))!;
      grid.append(h('button', {
        class: 'weapon-tile' + (w.id === this.loadoutWeapon ? ' on' : ''),
        onclick: () => { this.loadoutWeapon = w.id; this.show('loadout'); },
      }, h('div', { class: 'wn' }, w.name), h('div', { class: 'wf', style: { color: RARITY_COLORS[f.rarity] } }, f.name),
        h('div', { class: 'wf muted' }, w.team === 'both' ? 'Both teams' : TEAM_NAMES[w.team])));
    }
    const list = h('div', { class: 'finish-list' });
    const cur = fin[this.loadoutWeapon] ?? 'factory';
    for (const f of FINISHES) {
      list.append(h('button', {
        class: 'finish' + (f.id === cur ? ' on' : ''),
        onclick: () => { fin[this.loadoutWeapon] = f.id; this.save(); this.show('loadout'); },
      }, h('div', { class: 'chip', style: { background: `linear-gradient(135deg, ${f.base} 0 55%, ${f.accent} 55%)` } }),
        h('div', null, h('div', null, f.name), h('div', { class: 'rar', style: { color: RARITY_COLORS[f.rarity] } }, f.rarity))));
    }
    const def = WEAPON_LIST.find((w) => w.id === this.loadoutWeapon)!;
    body.append(
      h('div', { class: 'card', style: 'max-width:620px;margin-bottom:14px' }, h('h3', null, def.name),
        h('div', { class: 'muted', style: 'font-size:14px' }, def.blurb),
        def.class !== 'knife' ? h('div', { class: 'stat-row', style: 'margin-top:12px' },
          ...[['Price', '$' + def.price], ['Damage', def.damage], ['Fire rate', def.rpm + ' rpm'], ['Magazine', def.mag + ' / ' + def.reserve], ['Armor pen.', Math.round(def.armorPen * 100) + '%'], ['Move', Math.round(def.moveSpeed / 0.0254) + ' u/s']]
            .map(([l, v]) => h('div', null, h('b', { style: 'font-size:20px' }, String(v)), h('span', null, String(l))))) : null),
      h('div', { class: 'card', style: 'max-width:620px;margin-bottom:14px' }, h('h3', null, 'Weapons'), grid),
      h('div', { class: 'card', style: 'max-width:620px' }, h('h3', null, 'Finishes'), list));
  }

  // -------------------------------------------------------------- SETTINGS
  private renderSettings(body: HTMLElement) {
    body.append(this.settingsPanel.el);
    this.settingsPanel.render();
  }

  // -------------------------------------------------------------- ABOUT
  private renderAbout(body: HTMLElement) {
    const li = (...c: (Node | string)[]) => h('li', null, ...c);
    body.append(h('div', { class: 'help-cols about' },
      h('div', { class: 'card about-hero' }, logo('about-logo'),
        h('p', null, `${GAME_TITLE} is a browser tactical shooter set in ACI HQ — a single-story headquarters with offices to the west and a manufacturing plant to the east.`),
        h('div', { class: 'stat-row', style: 'margin-top:10px' },
          ...[[GAME_VERSION, 'Version'], ['2', 'Game modes'], ['23', 'Weapons'], [String(ZOMBIE_ORDER.length), 'Zombie types']].map(([v, l]) => h('div', null, h('b', null, v), h('span', null, l))))),
      h('div', { class: 'card' }, h('h3', null, 'Search & Destroy'), h('ul', null,
        li('CS-style bomb defusal: Attackers plant at A or B, Defenders defuse. One life per round.'),
        li('Teams from 1v1 to 5v5 against bots, a full economy, gadgets, killstreaks and the Gunsmith.'),
        li('Tilt-aim, slides, prone, mantling, wallbangs and a final killcam.'))),
      h('div', { class: 'card' }, h('h3', null, 'Zombies'), h('ul', null,
        li('Round-based co-op survival on ', h('b', null, 'ACI HQ: Outbreak'), ' — squads of 1, 3 or 5 (your teammates are bots).'),
        li('Start with a knife and a pistol. Earn points to open doors, buy wall weapons and perks, roll the Mystery Box and upgrade guns in the Prototype Forge.'),
        li(`${ZOMBIE_ORDER.length} zombie types, frenzy waves, Juggernaut boss waves, power-ups and an exfil to escape.`))),
      h('div', { class: 'card' }, h('h3', null, 'Credits'), h('ul', null,
        li('Design, code, models, animation and sound: generated procedurally in TypeScript — no audio or model files.'),
        li('Rendering: Three.js · Build: Vite · Tests: Vitest + Playwright.'),
        li('Scanned surface textures: CC0 (see docs/ASSETS.md).'),
        li('Inspired by Counter-Strike, Call of Duty Zombies, Rainbow Six Siege, Killing Floor and Roblox Operation One.'))),
      h('div', { class: 'card' }, h('h3', null, 'Your records'), h('ul', null,
        li(`Search & Destroy: ${this.profile.stats.matches} matches, ${this.profile.stats.wins} wins, ${this.profile.stats.kills} kills.`),
        ...(['casual', 'normal', 'hardened', 'nightmare'] as const).map((d) => li(`Zombies ${ZDIFF[d].label}: best wave ${this.profile.zstats.best[d] ?? '—'}`)),
        li(`Zombies: ${this.profile.zstats.games} games, ${this.profile.zstats.kills} kills, ${this.profile.zstats.revives} revives, ${this.profile.zstats.exfils} exfils.`)))));
  }

  // -------------------------------------------------------------- HELP
  private renderHelp(body: HTMLElement) {
    const b = this.profile.settings.bindings;
    const k = (code: string) => h('span', { class: 'kbd' }, keyLabel(code));
    const li = (...c: (Node | string)[]) => h('li', null, ...c);
    body.append(
      h('div', { class: 'help-cols' },
        h('div', { class: 'card' }, h('h3', null, 'Search & Destroy'), h('ul', null,
          li(h('b', { class: 't-color' }, 'Attackers'), ' carry the bomb. Plant it at site ', h('b', null, 'A'), ' (assembly line) or ', h('b', null, 'B'), ' (engineering bullpen) and defend it for 40 seconds, or eliminate all Defenders.'),
          li(h('b', { class: 'ct-color' }, 'Defenders'), ' stop the plant, defuse a planted bomb (10s, 5s with a kit), or survive until the 1:55 round timer expires.'),
          li('Sides switch at halftime. Money resets to $800.'),
          li('Win: $3,250 (elimination or time) / $3,500 (bomb or defuse). Losing streaks pay $1,400 → $3,400. Kills pay by weapon class.'))),
        h('div', { class: 'card' }, h('h3', null, 'Zombies'), h('ul', null,
          li('Survive the waves. Zombies get faster and tougher every wave; specials join in as you go.'),
          li('Points: 10 per hit, 50–130 per kill (headshot 100, knife 130) and a bonus for every cleared wave.'),
          li(k(b.use), ' buys: wall weapons (ammo at half price), shutters to new areas, perks, the Mystery Box, the Prototype Forge (5,000 upgrade, needs power) and the Armory.'),
          li('Turn on the ', h('b', null, 'power'), ' in the Server Room to switch on the perk machines and the forge.'),
          li('Going down isn\'t the end: hold ', k(b.use), ' next to a downed teammate to revive them. Solo? Buy Second Wind or a Self-Revive Kit.'),
          li('From wave 10 (Short) or 20 (Long) the radio in the lobby calls an ', h('b', null, 'exfil'), ': reach the landing zone in the Loading Yard and hold it.'))),
        h('div', { class: 'card' }, h('h3', null, 'Movement & aiming'), h('ul', null,
          li(k(b.forward), k(b.left), k(b.back), k(b.right), 'move · ', k(b.jump), 'jump'),
          li(k(b.walk), 'walk silently · ', k(b.crouch), 'crouch; keep holding while still to go prone (Settings: Toggle mode for CoD-style crouch)'),
          li(k(b.slide), 'slide while running forward. Slides make noise and reduce accuracy.'),
          li(k(b.leanLeft), k(b.leanRight), h('b', null, 'tilt / lean'), ' around corners to peek with less of your body exposed'),
          li('Left mouse fire · Right mouse ', h('b', null, 'aim down sights'), ' (scoped rifles zoom, knife stabs)'),
          li('Stand still to shoot accurately. Running and jumping add a lot of spread.'),
          li('Hold ', k(b.jump), ' while moving into a chest-high ledge to ', h('b', null, 'mantle'), ' onto it.'))),
        h('div', { class: 'card' }, h('h3', null, 'Weapons & items'), h('ul', null,
          li(k(b.buy), 'buy menu (S&D: spawn area, first 20s of round) · R rebuy, A auto-buy, 4 Gunsmith'),
          li(k(b.primary), k(b.secondary), k(b.melee), k(b.grenade), k(b.bomb), 'weapon slots · ', k(b.lastWeapon), 'last weapon · mouse wheel cycles'),
          li(k(b.reload), 'reload · ', k(b.drop), 'drop weapon · ', k(b.use), 'use / pick up / defuse'),
          li(k(b.quickMelee), h('b', null, 'quick melee'), ' — stab without switching weapons'),
          li(k(b.stimSelf), 'stim yourself · ', k(b.detonate), 'detonate your C4 · ', k(b.ping), 'ping · ', k(b.inspect), 'inspect'),
          li(k(b.scoreboard), 'scoreboard · Esc pause'))),
        h('div', { class: 'card' }, h('h3', null, 'Zombie field guide'), h('ul', null,
          ...ZOMBIE_ORDER.map((z) => li(h('b', { style: { color: ZOMBIES[z].eye } }, ZOMBIES[z].name), ` — ${ZOMBIES[z].blurb} `, h('i', { class: 'muted' }, ZOMBIES[z].counter))))),
        h('div', { class: 'card' }, h('h3', null, 'Perks & power-ups'), h('ul', null,
          ...PERK_ORDER.map((p) => li(h('b', { style: { color: PERKS[p].color } }, `${PERKS[p].name} (${PERKS[p].price.toLocaleString('en-US')})`), ` — ${PERKS[p].blurb}`)),
          ...POWERUP_ORDER.map((p) => li(h('b', { style: { color: POWERUPS[p].color } }, POWERUPS[p].name), ` — ${POWERUPS[p].blurb}`)))),
        h('div', { class: 'card' }, h('h3', null, 'Killstreaks (S&D)'), h('ul', null,
          li('Kills in one life earn rewards. They are kept until you use them with ', k(b.killstreak), '. Dying resets the count.'),
          ...STREAK_ORDER.map((id) => li(h('b', null, `${STREAKS[id].name} (${STREAKS[id].kills} kills)`), ` — ${STREAKS[id].blurb}`)))),
        h('div', { class: 'card' }, h('h3', null, 'Utilities & gadgets'), h('ul', null,
          ...UTILITY_ORDER.map((u) => li(h('b', null, UTILITIES[u].name), ` ($${UTILITIES[u].price}) — ${UTILITIES[u].blurb}`)),
          li(k(b.gadget), 'cycle gadgets · ', k(b.cams), 'camera & drone feeds'),
          ...GADGET_ORDER.map((g) => li(h('b', null, GADGETS[g].name), ` ($${GADGETS[g].price}${GADGETS[g].team === 'both' ? '' : ', ' + (GADGETS[g].team === 'T' ? 'Attackers' : 'Defenders')}) — ${GADGETS[g].blurb}`))))));
  }

  get page_(): MenuPage { return this.current; }
}
