import type { Team } from '../../config/rules';
import { rectCenter } from '../../core/math';
import type { Agent } from '../entities/Agent';
import type { HoldSpot, RouteDef, SiteId } from '../world/MapTypes';
import type { MatchQuery } from '../mode/types';
import type { BotController } from './BotController';

export type BotOrder =
  | { kind: 'idle' }
  | { kind: 'route'; via: [number, number][]; idx: number; stageIdx: number; site: SiteId; finalX: number; finalZ: number; executed: boolean; lurk: boolean }
  | { kind: 'hold'; spot: HoldSpot }
  | { kind: 'plant'; site: SiteId; x: number; z: number }
  | { kind: 'guard'; spot: HoldSpot }
  | { kind: 'retake'; x: number; z: number }
  | { kind: 'defuse' }
  | { kind: 'getBomb' }
  | { kind: 'hunt'; x: number; z: number };

export type TStrategy = 'execute' | 'split' | 'rush' | 'default';

/** Team-level brain: picks a plan each round and hands out orders to its bots. */
export class TeamCoach {
  readonly team: Team;
  private m: MatchQuery;
  private bots: Map<number, BotController>;
  site: SiteId = 'A';
  strategy: TStrategy = 'default';
  executeAt = 0;
  private nextUpdate = 0;
  private rotated = new Set<number>();
  private bombHandled = false;
  /** Defenders: true once enough players have gathered to retake together. */
  retakeGo = false;

  constructor(team: Team, m: MatchQuery, bots: Map<number, BotController>) {
    this.team = team; this.m = m; this.bots = bots;
  }

  private myBots(): BotController[] {
    return [...this.bots.values()].filter((b) => b.agent.team === this.team && b.agent.alive);
  }

  planRound(): void {
    this.rotated.clear();
    this.bombHandled = false;
    this.retakeGo = false;
    const m = this.m;
    const map = m.world.map;
    const bots = m.rng.shuffle(this.myBots());
    if (this.team === 'T') {
      this.site = m.rng.chance(0.5) ? 'A' : 'B';
      this.strategy = m.rng.pick(['execute', 'split', 'rush', 'default', 'default'] as const);
      const routes = map.ai.routes.filter((r) => r.site === this.site);
      const main = m.rng.pick(routes);
      const alt = routes.find((r) => r !== main) ?? main;
      const delay = { rush: 0, execute: m.rng.range(10, 18), split: m.rng.range(14, 22), default: m.rng.range(26, 40) }[this.strategy];
      this.executeAt = m.liveStart + delay;
      // carrier first so it's on the main route
      bots.sort((a, b) => Number(b.agent.hasBomb) - Number(a.agent.hasBomb));
      bots.forEach((bot, i) => {
        let route: RouteDef = main;
        if (this.strategy === 'split' && i % 2 === 1 && !bot.agent.hasBomb) route = alt;
        if (this.strategy === 'default' && i === bots.length - 1 && bots.length > 2 && !bot.agent.hasBomb) {
          // lurker: takes a route to the *other* site and holds there
          const lurk = m.rng.pick(map.ai.routes.filter((r) => r.site !== this.site));
          bot.setOrder(this.routeOrder(lurk, Infinity, bot.agent));
          return;
        }
        bot.setOrder(this.routeOrder(route, this.executeAt, bot.agent));
      });
    } else {
      const zones: ('A' | 'B' | 'mid')[] = m.rng.shuffle(['A', 'B', 'A', 'B', 'mid']);
      const taken = new Set<string>();
      bots.forEach((bot, i) => {
        const zone = zones[i % zones.length];
        const spot = this.pickHold(zone, taken);
        if (spot) { taken.add(spot.id); bot.setOrder({ kind: 'hold', spot }); }
      });
    }
  }

  private routeOrder(route: RouteDef, executeAt: number, a: Agent): BotOrder {
    const site = route.site;
    const map = this.m.world.map;
    let final: { x: number; z: number };
    if (a.hasBomb) final = this.m.rng.pick(map.plantSpots[site]);
    else {
      const g = this.m.rng.pick(map.ai.postPlant[site]);
      final = { x: (g.x + rectCenter(map.sites[site]).x) / 2, z: (g.z + rectCenter(map.sites[site]).z) / 2 };
    }
    const lurk = executeAt === Infinity;
    const stageIdx = lurk ? route.via.length - 1 : Math.max(0, route.via.length - 2);
    return { kind: 'route', via: route.via, idx: 0, stageIdx, site, finalX: final.x, finalZ: final.z, executed: false, lurk };
  }

  private pickHold(zone: SiteId | 'mid', taken: Set<string>): HoldSpot | null {
    const spots = this.m.world.map.ai.holds.filter((h) => h.zone === zone && !taken.has(h.id));
    if (spots.length) return this.m.rng.pick(spots);
    const any = this.m.world.map.ai.holds.filter((h) => !taken.has(h.id));
    return any.length ? this.m.rng.pick(any) : null;
  }

  /** Called every tick; does real work ~8x per second. */
  update(): void {
    const m = this.m;
    if (m.time < this.nextUpdate || (m.phase !== 'live' && m.phase !== 'planted')) return;
    this.nextUpdate = m.time + 0.125;
    const bots = this.myBots();
    if (!bots.length) return;
    const map = m.world.map;
    const bomb = m.bomb;

    if (this.team === 'T') {
      if (bomb.state === 'planted' && bomb.site) {
        if (!this.bombHandled) {
          this.bombHandled = true;
          const spots = m.rng.shuffle([...map.ai.postPlant[bomb.site]]);
          bots.forEach((b, i) => b.setOrder({ kind: 'guard', spot: spots[i % spots.length] }));
        }
        return;
      }
      if (bomb.state === 'dropped') {
        const fetching = bots.find((b) => b.order.kind === 'getBomb');
        if (!fetching) {
          const nearest = bots.reduce((best, b) => (b.agent.pos.distanceTo(bomb.pos) < best.agent.pos.distanceTo(bomb.pos) ? b : best));
          nearest.setOrder({ kind: 'getBomb' });
        }
      } else if (bomb.state === 'carried') {
        for (const b of bots) {
          if (b.order.kind === 'getBomb' || (b.agent.hasBomb && b.order.kind !== 'plant' && b.order.kind !== 'route')) {
            const spot = m.rng.pick(map.plantSpots[this.site]);
            b.setOrder({ kind: 'route', via: [], idx: 0, stageIdx: -1, site: this.site, finalX: spot.x, finalZ: spot.z, executed: true, lurk: false });
          }
        }
      }
      // late round: everybody goes now
      if (m.timeLeft() < 35 || this.strategy === 'rush') this.executeAt = Math.min(this.executeAt, m.time);
      return;
    }

    // ---------------- defenders ----------------
    if (bomb.state === 'planted') {
      const tAlive = m.agents.some((a) => a.alive && a.team === 'T');
      const leftNow = bomb.plantedAt + m.rules.bombTimer - m.time;
      const gathered = bots.filter((b) => b.agent.pos.distanceTo(bomb.pos) < 22).length;
      if (!this.retakeGo && (gathered >= Math.min(3, bots.length) || leftNow < 22 || !tAlive)) this.retakeGo = true;
      let defuser = bots.find((b) => b.order.kind === 'defuse');
      for (const b of bots) {
        if (b === defuser) continue;
        const d = b.agent.pos.distanceTo(bomb.pos);
        if (!defuser && (d < 7 || !tAlive) && !b.hasVisibleEnemy()) { b.setOrder({ kind: 'defuse' }); defuser = b; continue; }
        if (b.order.kind !== 'retake') b.setOrder({ kind: 'retake', x: bomb.pos.x, z: bomb.pos.z });
      }
      // urgency: not enough time for anyone else – the closest goes regardless
      const left = bomb.plantedAt + m.rules.bombTimer - m.time;
      if (!defuser && left < 14 && left > m.rules.defuseTimeKit + 1) {
        const closest = bots.reduce((best, b) => (b.agent.pos.distanceTo(bomb.pos) < best.agent.pos.distanceTo(bomb.pos) ? b : best));
        closest.setOrder({ kind: 'defuse' });
      }
      return;
    }
    // rotations: enemies spotted near a site pull defenders from elsewhere
    for (const site of ['A', 'B'] as SiteId[]) {
      const c = rectCenter(map.sites[site]);
      const near = m.agents.filter((a) => a.alive && a.team === 'T' && a.spottedUntil > m.time &&
        Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 26).length;
      const fallen = m.agents.some((a) => !a.alive && a.team === 'CT' && m.time - a.deathTime < 6 &&
        Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 24);
      if (near >= 2 || fallen) {
        const helpers = bots.filter((b) => !this.rotated.has(b.agent.id) && b.order.kind === 'hold' && b.order.spot.zone !== site);
        for (const h of helpers.slice(0, 2)) {
          this.rotated.add(h.agent.id);
          const spot = this.pickHold(site, new Set(bots.filter((b) => b.order.kind === 'hold').map((b) => (b.order as { spot: HoldSpot }).spot.id)));
          if (spot) h.setOrder({ kind: 'hold', spot }); else h.setOrder({ kind: 'retake', x: c.x, z: c.z });
        }
      }
    }
    // bomb seen on the ground → camp it
    if (bomb.state === 'dropped' && m.time - bomb.spottedByCT < 2 && !bots.some((b) => b.order.kind === 'hunt')) {
      bots[0].setOrder({ kind: 'hunt', x: bomb.pos.x, z: bomb.pos.z });
    }
    // late game: if we outnumber attackers and nobody planted, go hunting
    const tAlive = m.agents.filter((a) => a.alive && a.team === 'T');
    if (tAlive.length > 0 && bots.length >= tAlive.length + 2 && m.timeLeft() < 50) {
      const target = tAlive.find((a) => a.spottedUntil > m.time - 5) ?? null;
      if (target) for (const b of bots.slice(0, 2)) if (b.order.kind !== 'hunt') b.setOrder({ kind: 'hunt', x: target.pos.x, z: target.pos.z });
    }
  }

  onBombPlanted(): void { this.bombHandled = false; this.nextUpdate = 0; }
}
