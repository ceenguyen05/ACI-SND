import { HEADGEAR_OPTIONS, FINISHES, OUTFITS, PALETTE, RARITY_COLORS, SKIN_TONES, STYLE_OPTIONS, type AgentLook } from '../../config/cosmetics';
import { DIFFICULTY, type BotDifficulty } from '../../config/difficulty';
import { MATCH_LENGTHS, TEAM_NAMES, type MatchLength, type Team } from '../../config/rules';
import { WEAPON_LIST, type WeaponId } from '../../config/weapons';
import { UTILITIES, UTILITY_ORDER } from '../../config/utilities';
import { STREAKS, STREAK_ORDER } from '../../sim/mode/Killstreaks';
import { GADGETS, GADGET_ORDER } from '../../config/gadgets';
import { keyLabel } from '../../config/controls';
import type { Profile, Settings } from '../../app/Profile';
import type { Input } from '../../app/Input';
import { ACI_HQ } from '../../sim/maps/aciHq';
import { sfx } from '../../audio/Sfx';
import { h } from '../dom';
import { optRow, seg, swatches, toggle } from '../components';
import { renderOverview } from '../hud/Radar';
import { SettingsPanel } from './SettingsPanel';

export type MenuPage = 'play' | 'agents' | 'loadout' | 'settings' | 'help';

export interface MenuCallbacks {
  start(spectate: boolean): void;
  profileChanged(): void;
  settingsChanged(s: Settings): void;
  pageChanged(page: MenuPage, ctx: { team: Team; weapon: WeaponId }): void;
}

export class TitleScreen {
  readonly el: HTMLDivElement;
  constructor(onContinue: () => void) {
    let done = false;
    const go = () => { if (done) return; done = true; window.removeEventListener('keydown', go); onContinue(); };
    this.el = h('div', { class: 'title-screen', onclick: go },
      h('div', { class: 'logo' }, 'ACI', h('span', null, ':'), ' S&D'),
      h('div', { class: 'logo-sub' }, 'Search & Destroy'),
      h('div', { class: 'press-any' }, 'Click or press any key'),
      h('div', { class: 'title-foot' }, 'Map: ACI HQ · Offline 5v5 vs bots · Built with Three.js'));
    window.addEventListener('keydown', go);
  }
}

export class MainMenu {
  readonly el: HTMLDivElement;
  private page: HTMLDivElement;
  private nav: HTMLElement[] = [];
  private current: MenuPage = 'play';
  private agentTeam: Team = 'T';
  private loadoutWeapon: WeaponId = 'ravager';
  private settingsPanel: SettingsPanel;

  constructor(private profile: Profile, private cb: MenuCallbacks, input: Input) {
    this.page = h('div', { class: 'menu-page' });
    const item = (id: MenuPage, label: string) => {
      const b = h('button', { class: 'nav-item', onclick: () => { sfx.ui_click(); this.show(id); }, onmouseenter: () => sfx.ui_hover() }, label);
      b.dataset.id = id;
      this.nav.push(b);
      return b;
    };
    this.settingsPanel = new SettingsPanel(() => this.profile.settings, (s) => cb.settingsChanged(s), input);
    this.el = h('div', { class: 'menu' },
      h('div', { class: 'menu-nav' },
        h('div', { class: 'logo' }, 'ACI', h('span', null, ':'), 'S&D'),
        h('div', { class: 'logo-sub' }, 'Search & Destroy'),
        item('play', 'Play'), item('agents', 'Agents'), item('loadout', 'Loadout'), item('settings', 'Settings'), item('help', 'How to play'),
        h('div', { class: 'menu-foot' }, `Signed in as `, h('b', null, profile.name), h('br'), 'v0.1 · offline vs bots')),
      this.page);
    this.show('play');
  }

  show(p: MenuPage) {
    this.current = p;
    for (const b of this.nav) b.classList.toggle('active', b.dataset.id === p);
    this.page.innerHTML = '';
    ({ play: () => this.renderPlay(), agents: () => this.renderAgents(), loadout: () => this.renderLoadout(), settings: () => this.renderSettings(), help: () => this.renderHelp() })[p]();
    this.cb.pageChanged(p, { team: this.agentTeam, weapon: this.loadoutWeapon });
  }

  private save() { this.cb.profileChanged(); }

  // -------------------------------------------------------------- PLAY
  private renderPlay() {
    const mp = this.profile.match;
    const card = h('div', { class: 'map-card' });
    const ov = renderOverview(ACI_HQ, 2);
    card.append(ov, h('div', { class: 'mode' }, h('span', { class: 'tag', style: 'background:var(--accent);color:#111;border-color:var(--accent)' }, 'SEARCH & DESTROY')),
      h('div', { class: 'label' }, 'ACI HQ'));
    const grid = h('div', { class: 'opt-grid' });
    const add = (l: string, c: HTMLElement) => grid.append(...optRow(l, c));
    add('Your side', seg<Team | 'auto'>([{ value: 'T', label: TEAM_NAMES.T }, { value: 'CT', label: TEAM_NAMES.CT }, { value: 'auto', label: 'Auto' }], mp.side, (v) => { mp.side = v; this.save(); }));
    add('Team size', seg([1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}v${n}` })), mp.teamSize, (v) => { mp.teamSize = v; this.save(); }));
    add('Bot difficulty', seg((Object.keys(DIFFICULTY) as BotDifficulty[]).map((d) => ({ value: d, label: DIFFICULTY[d].label })), mp.difficulty, (v) => { mp.difficulty = v; this.save(); }));
    add('Match length', seg((Object.keys(MATCH_LENGTHS) as MatchLength[]).map((k) => ({ value: k, label: MATCH_LENGTHS[k].label })), mp.length, (v) => { mp.length = v; this.save(); }));
    add('Freeze time', seg([5, 10, 15].map((n) => ({ value: n, label: n + 's' })), mp.freezeTime, (v) => { mp.freezeTime = v; this.save(); }));
    add('Friendly fire', toggle(mp.friendlyFire, (v) => { mp.friendlyFire = v; this.save(); }));
    add('Killstreaks (UAV, drones, missiles)', toggle(mp.killstreaks ?? true, (v) => { mp.killstreaks = v; this.save(); }));
    const st = this.profile.stats;
    this.page.append(
      h('h1', { class: 'page-title' }, 'Play'),
      h('div', { class: 'play-hero' },
        h('div', { class: 'col' }, card,
          h('div', { class: 'card' }, h('h3', null, 'About the map'),
            h('div', { class: 'muted', style: 'line-height:1.5;font-size:14px' },
              'A single-story headquarters. West wing: engineering bullpen (B site), conference rooms, cubicles, break room, server room and mail room. East wing: assembly line (A site), factory floor, warehouse racks and shipping docks. Attackers spawn in the loading yard; Defenders in the main lobby.'))),
        h('div', { class: 'card' }, h('h3', null, 'Match setup'), grid,
          h('div', { class: 'row', style: 'margin-top:20px' },
            h('button', { class: 'btn primary', style: 'font-size:20px;padding:14px 40px', onclick: () => { sfx.ui_click(); this.cb.start(false); } }, 'Start match'),
            h('button', { class: 'btn', onclick: () => { sfx.ui_click(); this.cb.start(true); } }, 'Watch bots')))),
      h('div', { class: 'card', style: 'margin-top:18px;max-width:858px' }, h('h3', null, 'Career'),
        h('div', { class: 'stat-row' },
          ...[['Matches', st.matches], ['Wins', st.wins], ['Kills', st.kills], ['Deaths', st.deaths], ['K/D', st.deaths ? (st.kills / st.deaths).toFixed(2) : st.kills], ['MVPs', st.mvps]]
            .map(([l, v]) => h('div', null, h('b', null, String(v)), h('span', null, String(l)))))));
  }

  // -------------------------------------------------------------- AGENTS
  private renderAgents() {
    const team = this.agentTeam;
    const look = this.profile.looks[team];
    const changed = () => { this.save(); this.cb.pageChanged('agents', { team: this.agentTeam, weapon: this.loadoutWeapon }); };
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
    this.page.append(
      h('h1', { class: 'page-title' }, 'Agents'),
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('span', { class: 'muted' }, 'Callsign'), nameInput),
      seg<Team>([{ value: 'T', label: TEAM_NAMES.T }, { value: 'CT', label: TEAM_NAMES.CT }], team, (t) => { this.agentTeam = t; this.show('agents'); }),
      h('div', { class: 'row', style: 'align-items:flex-start;margin-top:14px;gap:16px;max-width:700px' },
        h('div', { class: 'card', style: 'width:220px;flex:none' }, h('h3', null, 'Presets'), presets),
        h('div', { class: 'card grow' }, h('h3', null, 'Customize'), grid)));
  }

  // -------------------------------------------------------------- LOADOUT
  private renderLoadout() {
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
    this.page.append(h('h1', { class: 'page-title' }, 'Loadout'),
      h('div', { class: 'card', style: 'max-width:620px;margin-bottom:14px' }, h('h3', null, def.name),
        h('div', { class: 'muted', style: 'font-size:14px' }, def.blurb),
        def.class !== 'knife' ? h('div', { class: 'stat-row', style: 'margin-top:12px' },
          ...[['Price', '$' + def.price], ['Damage', def.damage], ['Fire rate', def.rpm + ' rpm'], ['Magazine', def.mag + ' / ' + def.reserve], ['Armor pen.', Math.round(def.armorPen * 100) + '%'], ['Move', Math.round(def.moveSpeed / 0.0254) + ' u/s']]
            .map(([l, v]) => h('div', null, h('b', { style: 'font-size:20px' }, String(v)), h('span', null, String(l))))) : null),
      h('div', { class: 'card', style: 'max-width:620px;margin-bottom:14px' }, h('h3', null, 'Weapons'), grid),
      h('div', { class: 'card', style: 'max-width:620px' }, h('h3', null, 'Finishes'), list));
  }

  // -------------------------------------------------------------- SETTINGS
  private renderSettings() {
    this.page.append(h('h1', { class: 'page-title' }, 'Settings'), this.settingsPanel.el);
    this.settingsPanel.render();
  }

  // -------------------------------------------------------------- HELP
  private renderHelp() {
    const b = this.profile.settings.bindings;
    const k = (code: string) => h('span', { class: 'kbd' }, keyLabel(code));
    const li = (...c: (Node | string)[]) => h('li', null, ...c);
    this.page.append(h('h1', { class: 'page-title' }, 'How to play'),
      h('div', { class: 'help-cols' },
        h('div', { class: 'card' }, h('h3', null, 'Objective'), h('ul', null,
          li(h('b', { class: 't-color' }, 'Attackers'), ' carry the bomb. Plant it at site ', h('b', null, 'A'), ' (assembly line) or ', h('b', null, 'B'), ' (engineering bullpen) and defend it for 40 seconds, or eliminate all Defenders.'),
          li(h('b', { class: 'ct-color' }, 'Defenders'), ' stop the plant, defuse a planted bomb (10s, 5s with a kit), or survive until the 1:55 round timer expires.'),
          li('Sides switch at halftime. Money resets to $800.'),
          li('Win: $3,250 (elimination or time) / $3,500 (bomb or defuse). Losing streaks pay $1,400 → $3,400. Kills pay by weapon class.'))),
        h('div', { class: 'card' }, h('h3', null, 'Movement & aiming'), h('ul', null,
          li(k(b.forward), k(b.left), k(b.back), k(b.right), 'move · ', k(b.jump), 'jump'),
          li(k(b.walk), 'walk silently · ', k(b.crouch), 'crouch; keep holding while still to go prone (Settings: Toggle mode for CoD-style crouch)'),
          li(k(b.slide), 'slide while running forward. Slides make noise and reduce accuracy.'),
          li(k(b.leanLeft), k(b.leanRight), h('b', null, 'tilt / lean'), ' around corners to peek with less of your body exposed'),
          li('Left mouse fire · Right mouse ', h('b', null, 'aim down sights'), ' (scoped rifles zoom, knife stabs)'),
          li('Stand still to shoot accurately. Running and jumping add a lot of spread. Pull the mouse down against each gun\'s spray pattern.'),
          li('Press ', k(b.crouch), ' in mid-air to ', h('b', null, 'crouch-jump'), ' onto higher boxes. Spamming jump makes each hop lower.'),
          li('Hold ', k(b.jump), ' while moving into a chest-high ledge to ', h('b', null, 'mantle'), ' onto it.'),
          li('Bullets go through wood, glass and thin metal (', h('b', null, 'wallbangs'), '). Optional aim assist: Settings → Game.'))),
        h('div', { class: 'card' }, h('h3', null, 'Weapons & items'), h('ul', null,
          li(k(b.buy), 'buy menu (spawn area, first 20s of round) · in the menu: R rebuy, A auto-buy, 4 Gunsmith'),
          li(k(b.primary), k(b.secondary), k(b.melee), k(b.grenade), k(b.bomb), 'weapon slots · ', k(b.lastWeapon), 'last weapon · mouse wheel cycles'),
          li(k(b.reload), 'reload · ', k(b.drop), 'drop weapon · ', k(b.use), 'pick up / defuse / resupply at an ammo box'),
          li(k(b.quickMelee), h('b', null, 'quick melee'), ' — stab without switching weapons (breaks barricades and gadgets)'),
          li(k(b.stimSelf), 'stim yourself (needs a Stim Pistol) · ', k(b.detonate), 'detonate your C4'),
          li(k(b.ping), h('b', null, 'ping'), ' the enemy or spot under your crosshair for your team · ', k(b.inspect), 'inspect your weapon'),
          li(h('b', null, 'Gunsmith'), ' (buy menu tab 4): optics, suppressors, grips, lasers, mags and more – up to 5 per gun, kept for the half even if you die. ', k(b.light), ' toggles a weapon light.'),
          li('With a crowbar, hold ', k(b.use), ' at a barricade to pry it off.'),
          li('Bomb: equip with ', k(b.bomb), ', hold left mouse inside a site for 3.2s.'),
          li(k(b.scoreboard), 'scoreboard · Esc pause'))),
        h('div', { class: 'card' }, h('h3', null, 'Killstreaks'), h('ul', null,
          li('Kills in one life earn rewards. They are kept until you use them with ', k(b.killstreak), '. Dying resets the count.'),
          li('Rounds won by eliminating the other team end with a ', h('b', null, 'final killcam'), ' of the deciding kill (Space skips).'),
          ...STREAK_ORDER.map((id) => li(h('b', null, `${STREAKS[id].name} (${STREAKS[id].kills} kills)`), ` — ${STREAKS[id].blurb}`)))),
        h('div', { class: 'card' }, h('h3', null, 'Utilities & gadgets'), h('ul', null,
          ...UTILITY_ORDER.map((u) => li(h('b', null, UTILITIES[u].name), ` ($${UTILITIES[u].price}) — ${UTILITIES[u].blurb}`)),
          li('Left mouse = full throw, right mouse = underhand lob, both = medium.'))),
        h('div', { class: 'card' }, h('h3', null, 'Gadgets & cameras'), h('ul', null,
          li(k(b.gadget), 'cycle gadgets · left mouse throws / places the selected gadget'),
          li(k(b.cams), 'open camera & drone feeds · ', k(b.leanLeft), k(b.leanRight), 'switch feed · left mouse pings enemies'),
          li('Defenders always have the building CCTV network.'),
          ...GADGET_ORDER.map((g) => li(h('b', null, GADGETS[g].name), ` ($${GADGETS[g].price}${GADGETS[g].team === 'both' ? '' : ', ' + (GADGETS[g].team === 'T' ? 'Attackers' : 'Defenders')}) — ${GADGETS[g].blurb}`))))));
  }

  get page_(): MenuPage { return this.current; }
}
