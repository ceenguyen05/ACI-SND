import { describe, expect, it } from 'vitest';
import { Agent, emptyCommand, makeWeapon } from '../src/sim/entities/Agent';
import { OUTFITS } from '../src/config/cosmetics';
import { WEAPONS, type WeaponId } from '../src/config/weapons';
import { MOVE } from '../src/config/movement';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { equip, updateWeapon } from '../src/sim/combat/WeaponSystem';
import { inaccuracy } from '../src/sim/combat/Ballistics';
import { createMotorState, stepMotor } from '../src/sim/physics/CharacterMotor';
import { CollisionWorld } from '../src/sim/physics/CollisionWorld';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const dt = 1 / 64;

function range(id: WeaponId) {
  const match = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'T', playerName: 'Test', playerLook: look, seed: 33, rules: { teamSize: 1 } });
  match.skipFreeze();
  match.step(dt);
  const player = match.player!;
  player.primary = makeWeapon(id); player.active = 'primary';
  // Weapon simulation only: face a wall so shots cannot accidentally end the round.
  player.pitch = -1.4;
  const command = emptyCommand(); command.fire = true;
  const tick = () => { match.time += dt; updateWeapon(match, player, command, dt); };
  return { match, player, command, tick };
}

describe('weapon handling', () => {
  it.each(['ravager', 'sentinel', 'hornet'] as WeaponId[])('%s preserves configured automatic cadence across ticks', (id) => {
    const { match, player, tick } = range(id);
    const times: number[] = [];
    match.events.on('shot', (e) => { if (!e.pellet) times.push(match.time); });
    for (let i = 0; i < 640 && player.primary!.mag > 0; i++) tick();
    expect(player.primary!.mag).toBe(0);
    const duration = times.at(-1)! - times[0];
    expect(Math.abs(duration - (times.length - 1) * 60 / WEAPONS[id].rpm)).toBeLessThanOrEqual(dt);
    expect(player.aimPunchPitch).toBeGreaterThan(0);
  });

  it('a semi-auto gun fires once per press and kicks on that same tick', () => {
    const { player, command, tick } = range('p30');
    tick();
    expect(player.aimPunchPitch).toBeGreaterThan(0);
    for (let i = 0; i < 64; i++) tick();
    expect(player.primary!.mag).toBe(WEAPONS.p30.mag - 1);
    command.fire = false; tick(); command.fire = true; tick();
    expect(player.primary!.mag).toBe(WEAPONS.p30.mag - 2);
  });

  it('reload transfers only available reserve, blocks firing, and clears the old spray', () => {
    const { player, command, tick } = range('ravager');
    player.primary!.mag = 4; player.primary!.reserve = 3;
    player.wpn.recoilIdx = 10; player.wpn.fireInacc = 20;
    command.reload = true; tick(); command.reload = false;
    for (let i = 0; i < 10; i++) tick();
    expect(player.primary!.mag).toBe(4);
    command.fire = false;
    for (let i = 0; i < 200; i++) tick();
    expect(player.primary!.mag).toBe(7);
    expect(player.primary!.reserve).toBe(0);
    expect(player.wpn.recoilIdx).toBe(0);
  });

  it('switching weapons cancels a reload without transferring its recoil or ammo', () => {
    const { match, player, command, tick } = range('ravager');
    player.primary!.mag = 5; player.secondary = makeWeapon('p30');
    command.reload = true; tick(); command.reload = false; command.fire = false;
    player.wpn.recoilIdx = 9; player.wpn.fireInacc = 20;
    equip(match, player, 'secondary');
    expect(player.wpn.reloadUntil).toBe(0);
    expect(player.aimPunchPitch).toBe(0);
    expect(player.wpn.fireInacc).toBe(0);
    for (let i = 0; i < 200; i++) tick();
    expect(player.primary!.mag).toBe(5);
    expect(player.secondary.mag).toBe(WEAPONS.p30.mag);
  });

  it('recovers rifle accuracy when counter-strafing and penalizes a real landing', () => {
    const a = new Agent('Test', 'T', false, look);
    a.primary = makeWeapon('ravager'); a.active = 'primary';
    const def = a.primary.def, standing = inaccuracy(def, a);
    const world = new CollisionWorld();
    world.add({ minX: -20, minY: -1, minZ: -20, maxX: 20, maxY: 0, maxZ: 20, surface: 'floor' }); world.build();
    a.motor = createMotorState(0, 0, 0); a.vel.x = def.moveSpeed;
    expect(inaccuracy(def, a)).toBeGreaterThan(standing * 5);
    for (let i = 0; i < 6; i++) stepMotor(world, a.motor, { forward: 0, right: -1, jump: false, crouch: false, walk: false, yaw: 0, maxSpeed: def.moveSpeed, frozen: false }, dt);
    expect(inaccuracy(def, a)).toBeCloseTo(standing, 6);
    a.vel.set(0, 0, 0); a.motor.landTime = 0; a.motor.landingImpact = 7.5;
    expect(inaccuracy(def, a)).toBeGreaterThan(standing * 2);
    a.motor.landTime = MOVE.landingRecovery;
    expect(inaccuracy(def, a)).toBeCloseTo(standing, 6);
    a.motor.landTime = 0; a.motor.landingImpact = 0.4;
    expect(inaccuracy(def, a)).toBeCloseTo(standing, 6);
  });
});
