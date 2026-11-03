import type { Match } from '../sim/mode/Match';
import { ZombiesMatch } from '../sim/zombies/ZombiesMatch';
import { awardAction, completeMatch, type Award, type Career, type XpAction } from './career';

/** Rewards observe authoritative simulation events. Never accepts a claimed client score. */
export class MatchRewards {
  private off: (() => void)[] = [];
  private finished = false;
  private awards: Award[] = [];
  constructor(private m: Match, private agentId: number, private career: Career, private matchId: string,
    private now = Date.now, private multiplier = 1, private changed: (awards: Award[]) => void = () => {}) {
    const action = (kind: XpAction, mul = this.multiplier) => { const awards = awardAction(career, kind, now(), mul); this.awards.push(...awards); changed(awards); };
    const ev = m.events;
    this.off.push(ev.on('kill', e => {
      const me = m.getAgent(agentId), victim = m.getAgent(e.victimId);
      if (!me || !victim || me.team === victim.team) return;
      if (e.killerId === agentId) { action(victim.zombie ? 'zombieKill' : 'kill', this.multiplier * (!victim.zombie && victim.isBot ? .5 : 1)); if (e.headshot) action('headshot'); }
      else if (e.assisterId === agentId) action('assist');
    }), ev.on('bombPlanted', e => { if (e.agentId === agentId) action('plant'); }),
    ev.on('bombDefused', e => { if (e.agentId === agentId) action('defuse'); }),
    ev.on('roundEnd', e => { if (m.getAgent(agentId)?.team === e.winner) action('roundWin'); }),
    ev.on('zWave', e => { if (e.state === 'end' && m.getAgent(agentId)?.alive) action('wave'); }),
    ev.on('zRevived', e => { if (e.byId === agentId && !e.self) action('revive'); }),
    ev.on('zGameOver', e => { if (e.won && m.getAgent(agentId)?.alive) action('exfil'); }));
  }
  finish(qualified: boolean) {
    if (this.finished) return [];
    this.finished = true;
    const won = this.m instanceof ZombiesMatch ? this.m.won : this.m.winner === this.m.getAgent(this.agentId)?.team;
    const awards = completeMatch(this.career, { id: this.matchId, won, qualified, multiplier: this.multiplier }, this.now());
    this.awards.push(...awards); this.changed(awards); return awards;
  }
  get summary() { return this.awards.reduce((n, a) => n + a.xp, 0); }
  dispose() { for (const off of this.off) off(); this.off = []; }
}
