import { h } from '../dom';
import type { Profile } from '../../app/Profile';
import { levelAt, PLACEMENTS, RANKED_LEVEL, rankLabel, TIERS, type Career } from '../../progression/career';

function card(c: Career, title: string, online: boolean) {
  const l = levelAt(c.xp), day = Math.floor(Date.now() / 86_400_000), daily = c.daily.day === day ? c.daily : { kills: 0, objectives: 0, matches: 0, claimed: [] };
  const streak = c.lastDay !== null && day - c.lastDay <= 1 ? c.streak : 0;
  return h('section', { class: 'career-card card' }, h('span', { class: 'tag' }, title),
    h('div', { class: 'career-level' }, h('strong', null, `Level ${l.level}`), h('span', null, `${c.xp.toLocaleString()} lifetime XP`)),
    h('progress', { class: 'career-progress', max: l.needed, value: Math.min(l.current, l.needed), 'aria-label': `${title} level progress` }),
    h('p', { class: 'muted' }, `${l.current.toLocaleString()} / ${l.needed.toLocaleString()} XP to level ${l.level + 1}`),
    h('div', { class: 'career-stats' }, ...[[c.matches, 'Matches'], [c.wins, 'Wins'], [c.kills, 'Kills'], [c.objectives, 'Objectives'], [streak, 'Day streak'], [c.bestStreak, 'Best streak']].map(([n, label]) => h('div', null, h('b', null, String(n)), h('span', null, label)))),
    online ? h('div', { class: 'career-ranked' }, h('h3', null, rankLabel(c.rank)),
      c.rank.placements < PLACEMENTS ? h('p', { class: 'muted' }, `Complete ${PLACEMENTS} eligible Ranked matches for your placement. Ranked unlocks at online level ${RANKED_LEVEL} and 5 completed online matches.`)
        : c.rank.points >= 2100 ? h('p', null, `${c.rank.points - 2100} Champion RP · ${c.rank.games} rated games`)
        : h('div', null, h('progress', { max: 100, value: c.rank.points % 100, class: 'career-progress', 'aria-label': 'Rank points' }),
          h('p', null, `${c.rank.points % 100}/100 RP · ${c.rank.shields} tier shield · ${c.rank.games} rated games`)))
      : h('p', { class: 'muted' }, 'Offline progress stays on this browser. Competitive rank comes from online Ranked Search & Destroy.'),
    h('h3', null, 'Daily challenges'),
    ...([['kills', 10, 'Get 10 kills'], ['objectives', 2, 'Complete 2 objectives / waves / revives'], ['matches', 2, 'Finish 2 active matches']] as const).map(([key, target, label]) =>
      h('div', { class: 'career-daily' }, h('span', null, label), h('b', null, `${Math.min(daily[key], target)}/${target}${daily.claimed.includes(key as never) ? ' · Complete' : ''}`))),
    h('p', { class: 'muted' }, '250 XP per challenge + 500 XP for all three. Resets at 00:00 UTC. Finish a match to advance your daily streak.'));
}
export function careerScreen(profile: Profile) {
  return h('div', { class: 'career-page' },
    h('p', { class: 'muted' }, 'Earn XP from combat, objectives, match completion, wins and daily play. Levels show experience; matchmaking uses skill. All gameplay equipment remains available.'),
    h('div', { class: 'career-grid' }, card(profile.career, 'Offline career', false), profile.onlineCareer ? card(profile.onlineCareer, 'Online career · last connected server', true)
      : h('section', { class: 'career-card card' }, h('h2', null, 'Online career'), h('p', null, 'Connect through Play Online to load your saved online level and competitive rank.'))),
    h('div', { class: 'career-ladder' }, ...TIERS.map((tier, i) => h('span', { class: `rank-badge rank-${i}` }, tier, i < 7 ? ' I–III' : ''))),
    h('p', { class: 'muted' }, 'Ranked: 3v3–5v5 public S&D, full human teams, 5 placements, 100 RP per division. Wins, losses and opponent strength drive rank. Private, bot-filled, offline and Zombies matches earn XP without changing competitive rank.'));
}
