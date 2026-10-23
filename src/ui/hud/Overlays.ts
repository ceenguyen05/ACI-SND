import { TEAM_NAMES, type Team } from '../../config/rules';
import type { Match } from '../../sim/mode/Match';
import { h, money } from '../dom';
import { sfx } from '../../audio/Sfx';

/** Hold-Tab scoreboard. */
export class Scoreboard {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;
  constructor(private match: Match) {
    this.body = h('div', { class: 'scoreboard panel' });
    this.el = h('div', { class: 'overlay-dim hidden', style: 'background:rgba(4,6,8,.35)' }, this.body);
  }
  show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
    if (on) this.render();
  }
  render() {
    const m = this.match, me = m.player;
    this.body.innerHTML = '';
    const order: Team[] = me?.team === 'T' ? ['T', 'CT'] : ['CT', 'T'];
    for (const team of order) {
      const rows = m.teamOf(team).sort((a, b) => b.stats.score - a.stats.score);
      const color = team === 'T' ? 'var(--t)' : 'var(--ct)';
      this.body.append(h('div', { class: 'sb-team' },
        h('h3', { style: { color } }, h('span', null, TEAM_NAMES[team].toUpperCase()), h('span', null, String(m.score[team]))),
        h('table', { class: 'sb-table' },
          h('tr', null, h('th', null, 'PLAYER'), h('th', null, 'MONEY'), h('th', null, 'K'), h('th', null, 'A'), h('th', null, 'D'), h('th', null, 'HS%'), h('th', null, 'ADR'), h('th', null, '★'), h('th', null, 'SCORE')),
          rows.map((a) => h('tr', { class: (a.alive ? '' : 'dead') + (a === me ? ' me' : '') },
            h('td', null, (a.hasBomb && (!me || me.team === 'T') ? '💣 ' : '') + a.name),
            h('td', null, !me || a.team === me.team ? money(a.money) : ''),
            h('td', null, String(a.stats.kills)), h('td', null, String(a.stats.assists)), h('td', null, String(a.stats.deaths)),
            h('td', null, a.stats.kills ? Math.round((a.stats.headshots / a.stats.kills) * 100) + '%' : '-'),
            h('td', null, String(Math.round(a.stats.damage / Math.max(1, m.history.length)))),
            h('td', null, a.stats.mvps ? String(a.stats.mvps) : ''),
            h('td', null, String(a.stats.score)))))));
    }
    const hist = h('div', { class: 'sb-history' }, h('span', { class: 'muted', style: 'margin-right:8px;font-size:12px' }, 'ROUNDS'));
    for (const r of m.history) {
      const sym = { elimination: '✖', bomb: '✹', defuse: '✂', time: '⏱' }[r.reason];
      hist.append(h('i', { style: { background: r.winner === 'T' ? 'var(--t)' : 'var(--ct)' }, title: `Round ${r.round}: ${TEAM_NAMES[r.winner]} (${r.reason})` }, sym));
    }
    this.body.append(hist);
  }
}

export class PauseMenu {
  readonly el: HTMLDivElement;
  constructor(onResume: () => void, onSettings: () => void, onQuit: () => void) {
    const b = (label: string, fn: () => void, cls = 'btn') => h('button', { class: cls, onclick: () => { sfx.ui_click(); fn(); } }, label);
    this.el = h('div', { class: 'overlay-dim hidden' },
      h('div', { class: 'pause panel' }, h('h2', null, 'PAUSED'),
        b('Resume', onResume, 'btn primary'), b('Settings', onSettings), b('Quit to Main Menu', onQuit),
        h('div', { class: 'muted', style: 'font-size:12px;text-align:center;margin-top:8px' }, 'The match is paused while this menu is open.')));
  }
  show(on: boolean) { this.el.classList.toggle('hidden', !on); }
}

export class MatchEndScreen {
  readonly el: HTMLDivElement;
  constructor(match: Match, onDone: () => void) {
    const me = match.player;
    const w = match.winner;
    const won = !!me && w === me.team;
    const title = w === null ? 'DRAW' : me ? (won ? 'VICTORY' : 'DEFEAT') : `${TEAM_NAMES[w]} WIN`;
    const top = [...match.agents].sort((a, b) => b.stats.score - a.stats.score)[0];
    this.el = h('div', { class: 'overlay-dim' },
      h('div', { class: 'match-end panel' },
        h('div', { class: 'big', style: { color: w === null ? '#ccc' : won || !me ? 'var(--good)' : 'var(--bad)' } }, title),
        h('div', { style: 'font-size:30px;margin:10px 0' },
          h('span', { class: 't-color' }, `${TEAM_NAMES.T} ${match.score.T}`), '  :  ', h('span', { class: 'ct-color' }, `${match.score.CT} ${TEAM_NAMES.CT}`)),
        top ? h('div', { class: 'mvp' }, `TOP FRAGGER: ${top.name} — ${top.stats.kills} kills / ${top.stats.deaths} deaths`) : null,
        me ? h('div', { class: 'muted', style: 'margin-top:10px' }, `Your match: ${me.stats.kills} K · ${me.stats.assists} A · ${me.stats.deaths} D · ${me.stats.mvps} MVP`) : null,
        h('button', { class: 'btn primary', style: 'margin-top:24px', onclick: () => { sfx.ui_click(); onDone(); } }, 'Continue')));
  }
}
