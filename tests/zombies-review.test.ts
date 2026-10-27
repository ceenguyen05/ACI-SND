import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ZombiesMatch, type ZombiesConfig } from '../src/sim/zombies/ZombiesMatch';
import { ACI_HQ_ZOMBIES } from '../src/sim/maps/aciHqZombies';
import { OUTFITS } from '../src/config/cosmetics';
import { ZOMBIES, ZOMBIE_TUNING as T } from '../src/config/zombies';
import { emptyCommand, type Agent } from '../src/sim/entities/Agent';

const DT = 1 / 64;
const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
function game(config: Partial<ZombiesConfig> = {}) {
  const m = new ZombiesMatch({ layout: ACI_HQ_ZOMBIES, difficulty: 'normal', players: 3, length: 'short', playerName: 'P', playerLook: look, seed: 31, ...config });
  m.wavePhase = 'intermission'; m.phaseUntil = 1e6;
  m.allies.clear();
  m.humans.forEach((h, i) => m.debugTeleport(h, 4 + i * 4, -30, 0));
  return m;
}
function steps(m: ZombiesMatch, seconds: number, dt = DT) {
  for (let t = 0; t < seconds - dt / 2; t += dt) m.step(dt);
}
function hurt(m: ZombiesMatch, h: Agent, amount = 99999) {
  m.applyDamage(h, null, { health: amount, armor: 0 }, 'chest', 'zombie', h.pos.clone(), new Vector3(0, 0, 1));
}
function wall(m: ZombiesMatch) {
  return m.world.collision.addDynamic({ minX: 2, maxX: 6, minZ: -29.4, maxZ: -29.2, minY: 0, maxY: 3, surface: 'wall' });
}

describe('Zombies combat fairness', () => {
  it.each(['attack', 'slam', 'charge'] as const)('%s cannot damage a player through cover', (mode) => {
    const m = game(); const p = m.player!;
    const z = m.spawnZombie(mode === 'attack' ? 'walker' : 'tank', 4, -28.6)!;
    wall(m);
    Object.assign(z.zombie!, { mode, modeAt: m.time - 0.5, modeUntil: m.time, attackTargetId: p.id, charge: { x: 0, z: -1, hit: [] } });
    m.step(DT);
    expect(p.health).toBe(100);
    expect(p.stunUntil).toBeLessThanOrEqual(m.time);
  });

  it('a committed swipe misses rather than switching to another player during its windup', () => {
    const m = game(); const p = m.player!, original = m.humans[1];
    const z = m.spawnZombie('walker', 4, -28.5)!;
    Object.assign(z.zombie!, { mode: 'attack', modeAt: -1, modeUntil: 0, attackTargetId: original.id });
    original.alive = false; original.zp!.dead = true;
    m.step(DT);
    expect(p.health).toBe(100);
    expect(z.zombie!.mode).toBe('chase');
  });

  it('a lure arriving mid-swipe cannot replace the actual victim distance', () => {
    const m = game(); const p = m.player!, z = m.spawnZombie('walker', 4, -24)!;
    Object.assign(z.zombie!, { mode: 'attack', modeAt: -1, modeUntil: 0, attackTargetId: p.id });
    m.utility.decoys.push({ id: 9000, pos: new Vector3(4, 0, -25), end: 100, nextShot: 100, burst: 0, ownerId: p.id, team: 'CT', sound: 'p30' });
    m.lureFlow.computedAt = m.time;
    m.step(DT);
    expect(z.zombie!.lured).toBe(true);
    expect(p.health).toBe(100);
  });

  it.each([['p30', 199], ['frag', 160]] as const)('nearly broken body armor absorbs only its remaining capacity (%s)', (source, damage) => {
    const m = game(); const z = m.spawnZombie('armored', 4, -24)!;
    z.health = z.maxHealth = 10000; z.zombie!.vest = 1;
    m.applyDamage(z, m.player!, { health: 100, armor: 0 }, 'chest', source, z.pos.clone(), new Vector3(0, 0, 1));
    expect(z.health).toBe(10000 - damage);
    expect(z.zombie!.vest).toBe(0);
  });

  it('armor-only hits report armor feedback, and player armor reports its actual absorption', () => {
    const m = game(); const p = m.player!, z = m.spawnZombie('armored', 4, -24)!;
    const hits: { amount: number; armorDamage: number }[] = [];
    m.events.on('hit', (e) => hits.push(e));
    m.applyDamage(z, p, { health: 10, armor: 0 }, 'head', 'p30', z.pos.clone(), new Vector3(0, 0, 1));
    expect(hits[0]).toMatchObject({ amount: 0, armorDamage: 20 });
    p.armor = 100; hurt(m, p, 40);
    expect(hits[1]).toMatchObject({ amount: 20, armorDamage: 20 });
    expect(p.armor).toBe(80);
  });
});

describe('Zombies revival and recovery', () => {
  it('reviving requires an unobstructed teammate on the same level', () => {
    const m = game(); const p = m.player!, target = m.humans[1];
    m.debugTeleport(target, 4, -28.6, 0); hurt(m, target);
    expect(m.interactionFor(p)?.kind).toBe('revive');
    const cover = wall(m);
    expect(m.interactionFor(p)?.kind).not.toBe('revive');
    m.world.collision.removeDynamic(cover);
    target.pos.y = p.pos.y + 2;
    expect(m.interactionFor(p)?.kind).not.toBe('revive');
  });

  it('a downed reviver cancels progress and the abandoned teammate can still bleed out', () => {
    const m = game(); const p = m.player!, target = m.humans[1];
    m.debugTeleport(target, 4, -28.6, 0); hurt(m, target);
    m.setPlayerCommand({ ...emptyCommand(), use: true });
    steps(m, 0.5);
    expect(target.zp!.revive?.progress).toBeGreaterThan(0);
    hurt(m, p);
    expect(target.zp!.revive).toBeNull();
    target.zp!.bleedUntil = m.time + 0.1;
    steps(m, 0.2);
    expect(target.zp!.dead).toBe(true);
  });

  it.each([DT, 1 / 32])('revive duration follows simulation time at dt=%s', (dt) => {
    const m = game(); const p = m.player!, target = m.humans[1];
    m.debugTeleport(target, 4, -28.6, 0); hurt(m, target);
    m.setPlayerCommand({ ...emptyCommand(), use: true });
    steps(m, T.reviveTime - 0.2, dt);
    expect(target.zp!.downed).toBe(true);
    steps(m, 0.3, dt);
    expect(target.zp!.downed).toBe(false);
    expect(p.zp!.stats.revives).toBe(1);
  });

  it('successful revives have a visible recovery interval; repeated revive calls cannot award points', () => {
    const m = game(); const p = m.player!, target = m.humans[1];
    hurt(m, target); m.reviveHuman(target, p, false);
    const health = target.health, points = p.money;
    hurt(m, target);
    expect(target.health).toBe(health);
    expect(target.zp!.protectedUntil).toBe(m.time + T.reviveProtection);
    m.reviveHuman(target, p, false);
    expect(p.money).toBe(points);
    steps(m, T.reviveProtection + DT);
    hurt(m, target);
    expect(target.zp!.downed).toBe(true);
  });

  it('an active revive belongs to one teammate instead of being reset by competitors', () => {
    const m = game(); const p = m.player!, target = m.humans[1], other = m.humans[2];
    m.debugTeleport(target, 4, -28.6, 0); m.debugTeleport(other, 5, -28.6, 0);
    hurt(m, target);
    m.setPlayerCommand({ ...emptyCommand(), use: true }); m.step(DT);
    expect(target.zp!.revive?.byId).toBe(p.id);
    expect(m.interactionFor(other)?.kind).not.toBe('revive');
  });
});

describe('Zombies wave flow and extraction', () => {
  it('radar spotting runs during actual simulation ticks', () => {
    const m = game(); const z = m.spawnZombie('walker', 4, -24)!;
    steps(m, 0.1);
    expect(z.spottedUntil).toBeGreaterThan(m.time);
  });

  it('frenzy waves respect each type cap and wait when every frenzy slot is occupied', () => {
    const m = game(); m.wave = 11; m.waveKindNow = 'frenzy';
    m.wavePhase = 'active'; m.waveTotal = 100;
    for (const kind of ['runner', 'crawler', 'bomber'] as const) {
      for (let i = 0; i < ZOMBIES[kind].maxAlive; i++) m.spawnZombie(kind, 4 + i, -23);
    }
    m.step(DT);
    expect(m.spawned).toBe(0);
    expect(m.aliveZombies().some((z) => z.zombie!.kind === 'walker')).toBe(false);
  });

  it('calling exfil from a locked lobby opens a navigable route without charging points', () => {
    const m = game(); const p = m.player!;
    const lz = m.layout.lz;
    expect(m.world.nav.findPath(p.pos.x, p.pos.z, lz.x, lz.z)).toBeNull();
    m.exfil.phase = 'available'; const money = p.money;
    expect(m.callExfil(p)).toBe(true);
    expect(m.world.nav.findPath(p.pos.x, p.pos.z, lz.x, lz.z)).not.toBeNull();
    expect(p.money).toBe(money);
    expect(m.gates.filter((g) => g.open)).toHaveLength(2);
  });

  it('bots move to the landing zone, then stay to defend it instead of following the player', () => {
    const m = new ZombiesMatch({ layout: ACI_HQ_ZOMBIES, difficulty: 'normal', players: 3, length: 'short', playerName: 'P', playerLook: look, seed: 31 });
    m.wavePhase = 'intermission'; m.phaseUntil = 1e6;
    m.debugOpenAll(); m.exfil.phase = 'holding'; m.exfil.until = 1e6;
    const bot = m.humans[1], ai = m.allies.get(bot.id)!;
    m.debugTeleport(bot, m.layout.lz.x + 5, m.layout.lz.z, 0);
    const moving = ai.think(DT);
    expect(Math.hypot(moving.forward, moving.right)).toBeGreaterThan(0);
    m.debugTeleport(bot, m.layout.lz.x, m.layout.lz.z, 0);
    ai.reset(); const holding = ai.think(DT);
    expect(holding.forward).toBe(0); expect(holding.right).toBe(0);
  });

  it('power-ups cannot be collected through cover', () => {
    const m = game(); const p = m.player!;
    m.dropPowerUp('bonusPoints', new Vector3(4, 0, -28.8)); wall(m);
    const money = p.money;
    m.step(DT);
    expect(p.money).toBe(money);
    expect(m.powerUps).toHaveLength(1);
  });

  it('game-over locks combat and world updates while presentation time can continue', () => {
    const m = game(); const p = m.player!, z = m.spawnZombie('walker', 4, -24)!;
    m.endGame(true); const money = p.money, health = z.health, pos = z.pos.clone();
    m.dropPowerUp('bonusPoints', p.pos);
    m.applyDamage(z, p, { health: 99999, armor: 0 }, 'head', 'p30', z.pos.clone(), new Vector3(0, 0, 1));
    steps(m, 1);
    expect(z.health).toBe(health); expect(z.pos.equals(pos)).toBe(true);
    expect(p.money).toBe(money); expect(m.won).toBe(true);
  });
});
