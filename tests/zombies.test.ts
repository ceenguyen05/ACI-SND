import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ZombiesMatch, layoutColliders, layoutPlacements, type ZombiesConfig } from '../src/sim/zombies/ZombiesMatch';
import { ACI_HQ_ZOMBIES, cellRectWorld } from '../src/sim/maps/aciHqZombies';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { World, propBounds } from '../src/sim/world/World';
import { OUTFITS } from '../src/config/cosmetics';
import { WEAPONS } from '../src/config/weapons';
import {
  BOX_PRICE, FORGE_PRICE, PERKS, POINTS, ZDIFF, ZOMBIES, ZOMBIE_TUNING, frenzyCount, rollGait, teddyChance, waveCount, waveKind, zombieHealth,
} from '../src/config/zombies';
import { emptyCommand } from '../src/sim/entities/Agent';
import { CollisionWorld } from '../src/sim/physics/CollisionWorld';
import { createMotorState, stepMotor } from '../src/sim/physics/CharacterMotor';
import type { Agent } from '../src/sim/entities/Agent';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const DT = 1 / 64;

function game(over: Partial<ZombiesConfig> = {}) {
  return new ZombiesMatch({ layout: ACI_HQ_ZOMBIES, difficulty: 'normal', players: 1, length: 'short', playerName: 'P', playerLook: look, seed: 7, ...over });
}
const steps = (m: ZombiesMatch, seconds: number) => { for (let i = 0; i < seconds * 64; i++) m.step(DT); };
/** Stand the player at a spot looking at a point, then press use for one tick. */
function use(m: ZombiesMatch, p: Agent, x: number, z: number, lookX: number, lookZ: number) {
  m.debugTeleport(p, x, z, Math.atan2(-(lookX - x), -(lookZ - z)));
  const cmd = emptyCommand(); cmd.yaw = p.yaw; cmd.use = true;
  m.setPlayerCommand(cmd); m.step(DT);
  m.setPlayerCommand({ ...emptyCommand(), yaw: p.yaw }); m.step(DT);
}
const front = (p: { x: number; z: number; yaw: number }, d: number) => ({ x: p.x - Math.sin(p.yaw) * d, z: p.z - Math.cos(p.yaw) * d });

describe('zombies formulas (BO2 _zm.gsc)', () => {
  it('health, counts, gaits and special waves follow the classic curves', () => {
    const n = ZDIFF.normal;
    expect(zombieHealth(1, n)).toBe(150);
    expect(zombieHealth(9, n)).toBe(950);
    expect(zombieHealth(10, n)).toBe(1045);
    expect(waveCount(1, 1, n)).toBe(6);
    expect(waveCount(10, 1, n)).toBe(33);
    expect(waveCount(20, 1, n)).toBe(60);
    expect(waveCount(10, 5, n)).toBeGreaterThan(waveCount(10, 3, n));
    expect(rollGait(1, n, 0.99)).toBe('walk');
    expect(rollGait(9, n, 0)).toBe('sprint');
    expect(waveKind(6)).toBe('frenzy');
    expect(waveKind(10)).toBe('boss');
    expect(waveKind(7)).toBe('normal');
    expect(frenzyCount(6, 1, n)).toBe(6);
    expect(teddyChance(2, false)).toBe(0);
    expect(teddyChance(8, false)).toBe(1);
    expect(teddyChance(13, true)).toBe(0.5);
    expect(zombieHealth(40, ZDIFF.casual)).toBe(zombieHealth(20, ZDIFF.casual)); // casual caps growth
  });
});

describe('character motor', () => {
  it('a hull pushed into a long wall is pushed back out, never tunnelled to the far side', () => {
    const w = new CollisionWorld();
    w.add({ minX: -60, minY: -1, minZ: -60, maxX: 60, maxY: 0, maxZ: 60, surface: 'floor' });
    w.add({ minX: -16, minY: 0, minZ: -16, maxX: -4, maxY: 3, maxZ: -14, surface: 'wall' }); // 12 m long wall
    w.build(4);
    const s = createMotorState(-16.3, 0, -15); // overlapping the wall's west end by 0.1 m
    s.vel.set(-0.2, 0, 0);
    stepMotor(w, s, { forward: 0, right: 0, jump: false, crouch: false, walk: false, yaw: 0, maxSpeed: 6, frozen: false }, 1 / 64);
    expect(s.pos.x).toBeLessThan(-16);
    expect(Math.abs(s.pos.x + 16.4)).toBeLessThan(0.2);
  });
});

describe('ACI HQ: Outbreak layout', () => {
  const pl = layoutPlacements(ACI_HQ_ZOMBIES);
  const map = ACI_HQ;
  const cell = (x: number, z: number) => map.grid[Math.floor((z - map.originZ) / map.cellSize)][Math.floor((x - map.originX) / map.cellSize)];

  it('every machine and wall-buy sits on a floor cell against a wall, clear of props', () => {
    const all = [...pl.perks, ...pl.boxes, pl.forge, pl.power, pl.armory, ...pl.wallBuys];
    for (const p of all) {
      expect(cell(p.x, p.z), `${p.x},${p.z}`).not.toBe('#');
      const back = { x: p.x + Math.sin(p.yaw) * 1.2, z: p.z + Math.cos(p.yaw) * 1.2 };
      expect(cell(back.x, back.z), `wall behind ${p.x},${p.z}`).toBe('#');
    }
    const boxes = layoutColliders(ACI_HQ_ZOMBIES).slice(0, pl.perks.length + pl.boxes.length + 3);
    for (const b of boxes) {
      for (const prop of map.props) {
        if (prop.solid === false) continue;
        const q = propBounds(prop);
        const overlap = b.minX < q.maxX && b.maxX > q.minX && b.minZ < q.maxZ && b.maxZ > q.minZ;
        expect(overlap, `machine at ${b.minX},${b.minZ} overlaps ${prop.kind}`).toBe(false);
      }
    }
  });

  it('gates and blocked doorways sit exactly on map doorways, and zones cover the floor', () => {
    const doors = map.doors.map((d) => `${d.c0},${d.r0},${d.c1},${d.r1}`);
    for (const g of ACI_HQ_ZOMBIES.gates) expect(doors).toContain(g.cells.join(','));
    for (const b of ACI_HQ_ZOMBIES.blocked) expect(doors).toContain(b.join(','));
    const m = game();
    // every floor cell that isn't a doorway belongs to a zone
    for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
      if (map.grid[r][c] === '#') continue;
      const x = map.originX + c * 2 + 1, z = map.originZ + r * 2 + 1;
      const isDoor = map.doors.some((d) => c >= d.c0 && c <= d.c1 && r >= d.r0 && r <= d.r1);
      if (!isDoor) expect(m.zoneAt(x, z), `cell ${c},${r}`).not.toBeNull();
    }
    for (const z of ACI_HQ_ZOMBIES.zones) expect(m.spawnPoints.some((p) => p.zone === z.id), z.id).toBe(true);
  });

  it('opening every gate connects the whole building; closed gates block the nav grid', () => {
    const m = game();
    const nav = m.world.nav;
    const lobby = { x: 4, z: -30 };
    const plant = { x: 40, z: -5 };
    expect(nav.findPath(lobby.x, lobby.z, plant.x, plant.z)).toBeNull();
    m.debugOpenAll();
    for (const z of ACI_HQ_ZOMBIES.zones) {
      const sp = m.spawnPoints.find((p) => p.zone === z.id)!;
      expect(nav.findPath(lobby.x, lobby.z, sp.x, sp.z), z.id).not.toBeNull();
    }
    void cellRectWorld; void World;
  });
});

describe('zombies simulation', () => {
  it('wave 1 spawns walkers in the lobby that walk up and hurt the player', () => {
    const m = game();
    const p = m.player!;
    steps(m, ZOMBIE_TUNING.firstWaveDelay + 0.2);
    expect(m.wave).toBe(1);
    expect(m.waveTotal).toBe(6);
    steps(m, 30);
    expect(m.spawned).toBeGreaterThan(0);
    for (const z of m.aliveZombies()) expect(m.zoneAt(z.pos.x, z.pos.z)).toBe('lobby');
    // stand still: they reach and swipe you
    let hurt = false;
    for (let i = 0; i < 64 * 60 && !hurt; i++) { m.step(DT); hurt = p.health < 100 || p.zp!.downed; }
    expect(hurt).toBe(true);
  }, 60_000);

  it('points: +10 per hit, 100 for a headshot kill, x2 with double points; wave clear pays the team', () => {
    const m = game();
    const p = m.player!;
    m.debugTeleport(p, 4, -30, 0);
    const z = m.spawnZombie('walker', 4, -25)!;
    z.zombie!.mode = 'chase';
    const before = p.money;
    m.applyDamage(z, p, { health: 20, armor: 0 }, 'chest', 'p30', z.pos.clone(), new Vector3(0, 0, 1));
    expect(p.money).toBe(before + POINTS.hit);
    m.applyDamage(z, p, { health: 999, armor: 0 }, 'head', 'p30', z.pos.clone(), new Vector3(0, 0, 1));
    expect(z.alive).toBe(false);
    expect(p.money).toBe(before + POINTS.hit + POINTS.head);
    m.timers.doublePoints = m.time + 30;
    const z2 = m.spawnZombie('walker', 4, -25)!;
    const b2 = p.money;
    m.applyDamage(z2, p, { health: 9999, armor: 0 }, 'chest', 'knife', z2.pos.clone(), new Vector3(0, 0, 1));
    expect(p.money).toBe(b2 + POINTS.melee * 2);
  });

  it('player guns do zombie-scale damage; armored zombies need their helmet shot off', () => {
    const m = game({ startWave: 12 });
    const p = m.player!;
    const z = m.spawnZombie('armored', 4, -25)!;
    const hp = z.health;
    m.applyDamage(z, p, { health: 100, armor: 0 }, 'head', 'ravager', z.pos.clone(), new Vector3(0, 0, 1));
    expect(z.health).toBe(hp); // helmet soaked it
    expect(z.zombie!.helmet).toBeLessThan(z.zombie!.helmetMax);
    const w = m.spawnZombie('walker', 6, -25)!;
    const h2 = w.health;
    m.applyDamage(w, p, { health: 30, armor: 0 }, 'chest', 'ravager', w.pos.clone(), new Vector3(0, 0, 1));
    expect(h2 - w.health).toBe(30 * ZOMBIE_TUNING.gunMult);
  });

  it('wall-buys, ammo, doors, power, perks and their effects', () => {
    const m = game({ startPoints: 30000 });
    const p = m.player!;
    // Judge on the lobby north wall
    const wb = m.wallBuys.findIndex((w) => w.weapon === 'judge');
    const W = m.wallBuys[wb];
    const f = front({ x: W.pos.x, z: W.pos.z, yaw: W.yaw }, 1);
    use(m, p, f.x, f.z, W.pos.x, W.pos.z);
    expect(p.primary?.def.id).toBe('judge');
    expect(p.money).toBe(30000 - 500);
    p.primary!.reserve = 0;
    use(m, p, f.x, f.z, W.pos.x, W.pos.z);
    expect(p.primary!.reserve).toBe(p.primary!.def.reserve);
    expect(p.money).toBe(30000 - 500 - 250);
    // the Security Doors
    const gi = m.gates.findIndex((g) => g.def.id === 'lobbyMid');
    const g = m.gates[gi];
    use(m, p, g.center.x, g.center.z - 1.4, g.center.x, g.center.z);
    expect(g.open).toBe(true);
    expect(m.zoneOpen.mid).toBe(true);
    // perks need power (except Second Wind)
    m.debugOpenAll();
    const jug = m.perkMachines.findIndex((x) => x.perk === 'ironGut');
    expect(m.buyPerk(p, jug)).toBe(false);
    m.turnOnPower(p);
    expect(m.buyPerk(p, jug)).toBe(true);
    expect(p.maxHealth).toBe(250);
    const qh = m.perkMachines.findIndex((x) => x.perk === 'quickHands');
    const reload = p.primary!.def.reloadTime;
    m.buyPerk(p, qh);
    expect(p.primary!.def.reloadTime).toBeCloseTo(reload * 0.5);
    const price = PERKS.ironGut.price + PERKS.quickHands.price;
    expect(p.money).toBe(30000 - 750 - 750 - price);
  });

  it('downed players bleed out unless revived; a bot teammate revives you', () => {
    const m = game({ players: 3, seed: 3 });
    const p = m.player!;
    const bot = m.humans[1];
    m.debugTeleport(p, 0, -30, 0);
    m.debugTeleport(bot, 2, -30, 0);
    m.applyDamage(p, null, { health: 500, armor: 0 }, 'chest', 'zombie', p.pos.clone(), new Vector3(0, 0, 1));
    expect(p.zp!.downed).toBe(true);
    expect(p.alive).toBe(true);
    let up = false;
    for (let i = 0; i < 64 * 12 && !up; i++) { m.step(DT); up = !p.zp!.downed; }
    expect(up).toBe(true);
    expect(bot.zp!.stats.revives).toBe(1);
    // solo: the free starting kit gets you back up once; after that, a down without Second Wind is game over
    const m2 = game({ players: 1 });
    const p2 = m2.player!;
    expect(p2.zp!.reviveKit).toBe(true);
    m2.applyDamage(p2, null, { health: 500, armor: 0 }, 'chest', 'zombie', p2.pos.clone(), new Vector3(0, 0, 1));
    expect(p2.zp!.downed).toBe(true);
    steps(m2, ZOMBIE_TUNING.selfReviveTime + 0.2);
    expect(p2.zp!.downed).toBe(false);
    expect(p2.zp!.reviveKit).toBe(false);
    steps(m2, ZOMBIE_TUNING.reviveProtection);
    m2.applyDamage(p2, null, { health: 500, armor: 0 }, 'chest', 'zombie', p2.pos.clone(), new Vector3(0, 0, 1));
    m2.step(DT);
    expect(m2.gameOver).toBe(true);
  }, 60_000);

  it('Second Wind lets a solo player get back up (and costs 500 solo)', () => {
    const m = game({ startPoints: 5000 });
    const p = m.player!;
    p.zp!.reviveKit = false;
    const i = m.perkMachines.findIndex((x) => x.perk === 'secondWind');
    expect(m.buyPerk(p, i)).toBe(true);
    expect(p.money).toBe(5000 - 500);
    m.applyDamage(p, null, { health: 500, armor: 0 }, 'chest', 'zombie', p.pos.clone(), new Vector3(0, 0, 1));
    expect(p.zp!.downed).toBe(true);
    steps(m, ZOMBIE_TUNING.selfReviveTime + 0.2);
    expect(p.zp!.downed).toBe(false);
    expect(m.gameOver).toBe(false);
    expect(p.zp!.perks).toEqual([]);
  });

  it('bombers blow up nearby zombies (credit to whoever shot them); bloaters leave gas', () => {
    const m = game({ startWave: 8 });
    const p = m.player!;
    m.debugTeleport(p, 4, -36, 0);
    const bomber = m.spawnZombie('bomber', 0, -28)!;
    const near = m.spawnZombie('walker', 1, -28)!;
    m.applyDamage(bomber, p, { health: 99999, armor: 0 }, 'chest', 'p30', bomber.pos.clone(), new Vector3(0, 0, 1));
    const pts = p.money;
    steps(m, 0.3);
    expect(near.alive).toBe(false);
    expect(p.money).toBeGreaterThan(pts);
    const bloat = m.spawnZombie('bloater', 10, -28)!;
    m.applyDamage(bloat, p, { health: 99999, armor: 0 }, 'chest', 'p30', bloat.pos.clone(), new Vector3(0, 0, 1));
    expect(m.gas.length).toBe(1);
  });

  it('power-ups: max ammo refills, insta-kill one-shots, nuke clears the map and pays 400', () => {
    const m = game();
    const p = m.player!;
    m.debugTeleport(p, 4, -30, 0);
    p.secondary!.reserve = 0;
    m.dropPowerUp('maxAmmo', p.pos.clone());
    m.step(DT);
    expect(p.secondary!.reserve).toBe(p.secondary!.def.reserve);
    m.dropPowerUp('instaKill', p.pos.clone());
    m.step(DT);
    const z = m.spawnZombie('brute', 4, -24)!;
    m.applyDamage(z, p, { health: 5, armor: 0 }, 'legs', 'p30', z.pos.clone(), new Vector3(0, 0, 1));
    expect(z.alive).toBe(false);
    for (let i = 0; i < 4; i++) m.spawnZombie('walker', -6 + i * 2, -25);
    const before = p.money;
    m.dropPowerUp('nuke', p.pos.clone());
    m.step(DT);
    expect(m.aliveZombies().length).toBe(0);
    expect(p.money).toBe(before + POINTS.nuke);
  });

  it('the Mystery Box rolls a weapon you take; the forge upgrades a gun', () => {
    const m = game({ startPoints: 20000 });
    const p = m.player!;
    expect(m.useBox(p)).toBe(true);
    expect(p.money).toBe(20000 - BOX_PRICE);
    steps(m, 4.5);
    expect(m.box.state === 'ready' || m.box.state === 'teddy').toBe(true);
    if (m.box.state === 'ready') {
      const wid = m.box.weapon!;
      expect(m.takeBoxWeapon(p)).toBe(true);
      expect([p.primary?.def.id, p.secondary?.def.id]).toContain(wid);
    }
    m.turnOnPower(p);
    p.active = 'secondary';
    const dmg = p.secondary!.def.damage;
    expect(m.startForge(p)).toBe(true);
    expect(p.money).toBeLessThanOrEqual(20000 - BOX_PRICE - FORGE_PRICE);
    steps(m, 4);
    expect(m.takeForged(p)).toBe(true);
    const forged = [p.primary, p.secondary].find((w) => (w?.def.tier ?? 0) > 0)!;
    expect(forged.def.damage).toBe(dmg * 2);
    expect(forged.def.name).not.toBe(WEAPONS[forged.def.id].name);
  });

  it('a bot squad survives the first waves on its own and earns points', () => {
    const m = game({ players: 5, spectate: true, seed: 11 });
    steps(m, 150);
    expect(m.wave).toBeGreaterThanOrEqual(2);
    expect(m.humans.some((h) => h.money > ZDIFF.normal.startPoints)).toBe(true);
    expect(m.totalKills).toBeGreaterThan(5);
  }, 120_000);

  it('every zombie kind spawns, moves and can be killed', () => {
    for (const kind of Object.keys(ZOMBIES) as (keyof typeof ZOMBIES)[]) {
      const m = game({ startWave: 15 });
      const p = m.player!;
      m.debugOpenAll();
      m.debugTeleport(p, 4, -34, Math.PI);
      const z = m.spawnZombie(kind, 4, -26)!;
      expect(z, kind).not.toBeNull();
      steps(m, 2);
      expect(z.alive, kind).toBe(true);
      m.applyDamage(z, p, { health: 999999, armor: 0 }, 'chest', 'frag', z.pos.clone(), new Vector3(0, 0, 1));
      expect(z.alive, kind).toBe(false);
    }
  }, 60_000);
});
