import { WEAPON_LIST, availableTo, type WeaponClass } from '../../config/weapons';
import { GEAR, UTILITIES, utilityName, type GearId, type UtilityId } from '../../config/utilities';
import { GADGETS, type GadgetId } from '../../config/gadgets';
import type { Team } from '../../config/rules';
import type { Match } from '../../sim/mode/Match';
import type { Agent } from '../../sim/entities/Agent';
import { priceOf, purchaseBlocker, type BuyItem } from '../../sim/mode/Economy';
import { h, money, setText } from '../dom';
import { sfx } from '../../audio/Sfx';
import { Gunsmith } from './Gunsmith';
import { ATTACHMENTS } from '../../config/attachments';

interface Entry { item: BuyItem; btn: HTMLButtonElement; price: HTMLElement; count: HTMLElement }
type Tab = 'weapons' | 'gadgets' | 'utilities' | 'gunsmith';
interface Group { title: string; sub?: string; items: BuyItem[] }

function itemInfo(item: BuyItem, team: Team): { name: string; blurb: string } {
  switch (item.kind) {
    case 'weapon': { const w = WEAPON_LIST.find((x) => x.id === item.id)!; return { name: w.name, blurb: w.blurb }; }
    case 'utility': return { name: utilityName(item.id, team), blurb: UTILITIES[item.id].blurb };
    case 'gadget': return { name: GADGETS[item.id].name, blurb: GADGETS[item.id].blurb };
    case 'gear': return { name: GEAR[item.id].name, blurb: GEAR[item.id].blurb };
    case 'attachment': return { name: ATTACHMENTS[item.id].name, blurb: ATTACHMENTS[item.id].pros.join(', ') };
  }
}

const weapons = (team: Team, ...classes: WeaponClass[]): BuyItem[] =>
  WEAPON_LIST.filter((w) => classes.includes(w.class) && availableTo(w, team)).map((w) => ({ kind: 'weapon', id: w.id }));
const gadgets = (team: Team, ...ids: GadgetId[]): BuyItem[] =>
  ids.filter((id) => availableTo(GADGETS[id], team)).map((id) => ({ kind: 'gadget', id }));
const utils = (...ids: UtilityId[]): BuyItem[] => ids.map((id) => ({ kind: 'utility', id }));
const gear = (team: Team, ...ids: GearId[]): BuyItem[] => ids.filter((id) => availableTo(GEAR[id], team)).map((id) => ({ kind: 'gear', id }));

/** What's in each tab, organised by class (CS-style columns). */
function layout(tab: Tab, team: Team): Group[] {
  switch (tab) {
    case 'weapons': return [
      { title: 'Pistols', items: weapons(team, 'pistol') },
      { title: 'SMGs', items: weapons(team, 'smg') },
      { title: 'Shotguns', items: weapons(team, 'shotgun') },
      { title: 'Assault Rifles', items: weapons(team, 'rifle') },
      { title: 'LMGs', items: weapons(team, 'lmg') },
      { title: 'Snipers', items: weapons(team, 'sniper') },
      { title: 'Launchers', sub: 'Grenade launcher · RPG', items: weapons(team, 'launcher') },
    ];
    case 'gadgets': return [
      { title: 'Grenades', sub: 'Max 4 total', items: utils('frag', 'flash', 'smoke', 'fire', 'stun', 'decoy', 'pulse', 'tknife') },
      { title: 'Recon', sub: 'Cameras, drones, sensors', items: gadgets(team, 'drone', 'stickyCam', 'flockCam', 'heartbeat') },
      { title: 'Explosives', items: gadgets(team, 'c4', 'mine', 'emp') },
      { title: 'Support', items: gadgets(team, 'stim') },
    ];
    case 'utilities': return [
      { title: 'Fortify', sub: 'Board up doorways', items: gadgets(team, 'barricade', 'steelBarricade', 'wire', 'shield') },
      { title: 'Breach & Supply', items: [...gear(team, 'crowbar'), ...gadgets(team, 'ammoBox')] },
      { title: 'Armor', items: gear(team, 'kevlar', 'helmet', 'plate', 'kit') },
    ];
    case 'gunsmith': return [];
  }
}

const TABS: { id: Tab; label: string }[] = [{ id: 'weapons', label: 'Weapons' }, { id: 'gadgets', label: 'Gadgets' }, { id: 'utilities', label: 'Utilities' }, { id: 'gunsmith', label: 'Gunsmith' }];

/** CS-style buy menu: tabs for weapons / gadgets / utilities, columns per class, click to buy. */
export class BuyMenu {
  readonly el: HTMLDivElement;
  private moneyEl: HTMLElement;
  private timeEl: HTMLElement;
  private infoEl: HTMLElement;
  private tabsEl: HTMLElement;
  private entries: Entry[] = [];
  private builtFor = '';
  private cols: HTMLElement;
  private tab: Tab = 'weapons';
  private quick: HTMLElement;
  private gunsmith: Gunsmith;
  visible = false;

  constructor(private match: Match, private onClose: () => void) {
    this.moneyEl = h('span', { class: 'money' });
    this.timeEl = h('span', { class: 'muted' });
    this.infoEl = h('span');
    this.tabsEl = h('div', { class: 'buy-tabs' });
    this.quick = h('div', { class: 'buy-quick' },
      h('button', { class: 'buy-qbtn', title: 'Buy what you bought last round (R)', onclick: () => this.quickBuy('rebuy') }, h('span', { class: 'k' }, 'R'), 'Rebuy'),
      h('button', { class: 'buy-qbtn', title: 'Best rifle, armor, kit and grenades you can afford (A)', onclick: () => this.quickBuy('auto') }, h('span', { class: 'k' }, 'A'), 'Auto-buy'));
    this.cols = h('div', { class: 'buy-cols' });
    this.gunsmith = new Gunsmith(match, (n) => { this.infoEl.innerHTML = ''; this.infoEl.append(n); });
    this.el = h('div', { class: 'overlay-dim hidden', onmousedown: (e: MouseEvent) => { if (e.target === this.el) this.onClose(); } },
      h('div', { class: 'buy panel' },
        h('div', { class: 'buy-head' }, h('div', { class: 'row' }, h('b', { style: 'font-size:22px;letter-spacing:.15em' }, 'BUY MENU'), this.timeEl), this.tabsEl, h('div', { class: 'row', style: 'gap:14px' }, this.quick, this.moneyEl)),
        this.cols,
        h('div', { class: 'buy-foot' }, this.infoEl, h('span', null, '1–4 switch tabs · B / ESC to close · buying a gun drops the one in that slot'))));
  }

  /** Rebuy last round's loadout or auto-buy the best affordable one. */
  quickBuy(kind: 'rebuy' | 'auto') {
    const p = this.match.player;
    if (!p) return;
    const before = p.money;
    const n = kind === 'rebuy' ? this.match.rebuy(p) : this.match.autoBuy(p);
    if (n > 0) sfx.buy(); else sfx.denied();
    this.infoEl.textContent = n > 0 ? `${kind === 'rebuy' ? 'Rebought' : 'Auto-bought'} ${n} item${n > 1 ? 's' : ''} for $${before - p.money}`
      : kind === 'rebuy' ? (p.lastBuys.length ? 'Nothing left to rebuy (already owned or not enough money)' : 'Nothing to rebuy yet – buy something this round first')
        : 'Nothing affordable to auto-buy';
    this.refresh();
  }

  /** Number keys 1-4 switch tabs while the menu is open; R rebuys, A auto-buys. */
  key(code: string) {
    if (code === 'KeyR') { this.quickBuy('rebuy'); return; }
    if (code === 'KeyA') { this.quickBuy('auto'); return; }
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (i >= 0) this.setTab(TABS[i].id);
  }

  private setTab(t: Tab) {
    if (this.tab === t) return;
    this.tab = t;
    this.builtFor = '';
    sfx.ui_click();
    this.build();
    this.refresh();
  }

  private build() {
    const p = this.match.player;
    if (!p) return;
    const key = p.team + this.tab;
    if (this.builtFor === key) return;
    this.builtFor = key;
    this.tabsEl.innerHTML = '';
    TABS.forEach((t, i) => this.tabsEl.append(h('button', { class: 'buy-tab' + (t.id === this.tab ? ' on' : ''), onclick: () => this.setTab(t.id) },
      h('span', { class: 'k' }, String(i + 1)), t.label)));
    this.cols.innerHTML = '';
    this.entries = [];
    if (this.tab === 'gunsmith') {
      this.cols.style.gridTemplateColumns = '1fr';
      this.cols.append(this.gunsmith.el);
      this.gunsmith.refresh(p);
      return;
    }
    const groups = layout(this.tab, p.team).filter((g) => g.items.length);
    this.cols.style.gridTemplateColumns = `repeat(${groups.length}, minmax(0, 1fr))`;
    for (const g of groups) {
      const col = h('div', { class: 'buy-col' }, h('h4', null, g.title), g.sub ? h('div', { class: 'buy-sub' }, g.sub) : null);
      for (const item of g.items) {
        const { name, blurb } = itemInfo(item, p.team);
        const price = h('span', { class: 'p' });
        const count = h('span', { class: 'c' });
        const btn = h('button', {
          class: 'buy-item',
          onclick: () => this.buy(item),
          onmouseenter: () => { setText(this.infoEl, `${name} — ${blurb}`); sfx.ui_hover(); },
        }, h('span', { class: 'n' }, name, count), price);
        col.append(btn);
        this.entries.push({ item, btn, price, count });
      }
      this.cols.append(col);
    }
  }

  private buy(item: BuyItem) {
    const p = this.match.player;
    if (!p) return;
    if (this.match.tryBuy(p, item)) sfx.buy(); else sfx.denied();
    this.refresh();
  }

  show() { this.build(); this.visible = true; this.el.classList.remove('hidden'); this.refresh(); }
  hide() { this.visible = false; this.el.classList.add('hidden'); }

  private owned(item: BuyItem, p: Agent): { owned: boolean; count: number } {
    switch (item.kind) {
      case 'weapon': return { owned: p.primary?.def.id === item.id || p.secondary?.def.id === item.id, count: 0 };
      case 'utility': return { owned: false, count: p.grenades[item.id] };
      case 'gadget': return { owned: item.id === 'stim' && p.gadgets.stim > 0, count: p.gadgets[item.id] };
      case 'attachment': return { owned: false, count: 0 };
      case 'gear': return {
        owned: (item.id === 'kit' && p.hasKit) || (item.id === 'helmet' && p.helmet && p.armor >= 100) || (item.id === 'kevlar' && p.armor >= 100)
          || (item.id === 'plate' && p.armor >= 150) || (item.id === 'crowbar' && p.hasCrowbar), count: 0,
      };
    }
  }

  refresh() {
    const p = this.match.player;
    if (!p || !this.visible) return;
    if (this.builtFor !== p.team + this.tab) this.build();
    setText(this.moneyEl, money(p.money));
    setText(this.timeEl, this.match.canBuyNow(p) ? `  ${Math.ceil(this.match.buyTimeLeft())}s left` : '  buy time over');
    if (this.tab === 'gunsmith') { this.gunsmith.refresh(p); return; }
    for (const e of this.entries) {
      setText(e.price, '$' + priceOf(e.item, p));
      const blocker = purchaseBlocker(e.item, p);
      const { owned, count } = this.owned(e.item, p);
      const fittedCount = e.item.kind === 'weapon' ? Object.values(p.loadouts[e.item.id]?.equipped ?? {}).filter(Boolean).length : 0;
      setText(e.count, count > 0 ? ` ×${count}` : fittedCount ? ` ⚙${fittedCount}` : '');
      e.btn.disabled = !!blocker && !owned;
      e.btn.title = blocker ?? '';
      e.btn.classList.toggle('owned', owned || count > 0);
    }
  }
}
