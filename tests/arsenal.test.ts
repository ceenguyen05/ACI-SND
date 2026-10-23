import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { emptyCommand, makeWeapon } from '../src/sim/entities/Agent';
import { healWithStim } from '../src/sim/combat/Ordnance';
import { knifeAttack } from '../src/sim/combat/Ballistics';
import { purchaseBlocker } from '../src/sim/mode/Economy';
import { emptyGadgets } from '../src/config/gadgets';
import { equip, updateWeapon } from '../src/sim/combat/WeaponSystem';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const DT = 1 / 64;

/** 2v2 bots frozen in a long freeze so we can stage scenarios; `live()` starts the round. */
function setup(teamSize = 2) {
  const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 11,
    rules: { teamSize, freezeTime: 999 } });
  const ts = m.agents.filter((a) => a.team === 'T'), cts = m.agents.filter((a) => a.team === 'CT');
  for (const a of m.agents) a.armor = 0;
  return { m, t: ts[0], t2: ts[1], ct: cts[0], ct2: cts[1] };
}
const run = (m: Match, s: number) => { for (let i = 0; i < s / DT; i++) m.step(DT); };
/** Step one agent's weapon logic with a command (no bots / phases involved). */
function act(m: Match, a: ReturnType<typeof setup>['t'], c: Partial<ReturnType<typeof emptyCommand>>) {
  const cmd = { ...emptyCommand(), yaw: a.yaw, pitch: a.pitch, ...c };
  updateWeapon(m, a, cmd, DT);
}

describe('stim pistol', () => {
  it('heals teammates 60 over 5s, yourself 15, with diminishing returns', () => {
    const { m, t, t2 } = setup();
    t2.health = 20;
    healWithStim(m, t2, t, false);
    run(m, 5.2);
    expect(t2.health).toBeGreaterThanOrEqual(78);
    expect(t2.health).toBeLessThanOrEqual(81);
    t2.health = 20;
    healWithStim(m, t2, t, false); // second stim within 12s is weaker
    run(m, 5.2);
    expect(t2.health).toBeLessThan(60);
    t.health = 50;
    healWithStim(m, t, t, true);
    run(m, 5.2);
    expect(t.health).toBeGreaterThanOrEqual(64);
    expect(t.health).toBeLessThanOrEqual(66);
  });

  it('fires a gravity dart that heals the teammate it hits', () => {
    const { m, t, t2 } = setup();
    m.skipFreeze(); m.step(DT);
    m.debugTeleport(t, 36, -20, 0, 0);
    m.debugTeleport(t2, 36, -30, 0, 0);
    t2.health = 30;
    m.debugGiveGadget(t, 'stim', 3);
    t.wpn.drawUntil = 0;
    t.pitch = Math.atan2(t2.pos.y + 1.2 - (t.pos.y + t.eyeHeight), 10) + 0.02;
    act(m, t, {}); act(m, t, { fire: true });
    expect(m.ordnance.shots.length).toBe(1);
    for (let i = 0; i < 64 && m.ordnance.shots.length; i++) m.ordnance.update(DT);
    expect(t2.heals.length).toBe(1);
  });
});

describe('barricades, melee and crowbars', () => {
  it('a wooden barricade boards a doorway, blocks movement and breaks after 3 melee hits', () => {
    const { m, ct } = setup();
    // conference 2 → lobby door at col 24 row 4 (x -12..-10, z -32..-30)
    m.debugTeleport(ct, -7.5, -31, Math.PI / 2, 0);
    ct.yaw = Math.PI / 2; // face west into the door
    expect(m.gadgets.placeBarricade(ct, 'barricade', ct.eyePos(new Vector3()), ct.viewDir(new Vector3()))).toBe(true);
    const b = m.gadgets.devices.find((d) => d.kind === 'barricade')!;
    expect(m.world.collision.raycast(new Vector3(-7, 1, -31), new Vector3(-1, 0, 0), 10)?.box.device).toBe(b.id);
    m.debugTeleport(ct, b.pos.x + 1.0, b.pos.z, Math.PI / 2, -0.1);
    let hits = 0;
    while (b.alive && hits < 5) { knifeAttack(m, ct, false, true); hits++; }
    expect(b.alive).toBe(false);
    expect(hits).toBe(3);
  });

  it('steel barricades stop bullets; a crowbar pries one off in ~4s', () => {
    const { m, ct, t } = setup();
    m.debugTeleport(ct, -7.5, -31, Math.PI / 2, 0);
    expect(m.gadgets.placeBarricade(ct, 'steelBarricade', ct.eyePos(new Vector3()), ct.viewDir(new Vector3()))).toBe(true);
    const b = m.gadgets.devices.find((d) => d.kind === 'steelBarricade')!;
    t.hasCrowbar = true;
    m.debugTeleport(t, b.pos.x + 1.0, b.pos.z, Math.PI / 2, 0);
    m.debugTeleport(ct, -40, -36, 0, 0);
    const before = b.health;
    m.gadgets.damage(b, 500, t, 'bullet');
    expect(b.health).toBe(before);
    m.setPlayerCommand(emptyCommand());
    // hold use for 4.2s via the use logic (bots are frozen in freeze time)
    const cmd = { ...emptyCommand(), use: true, yaw: t.yaw, pitch: 0 };
    (m as unknown as { updateUse(a: unknown, c: unknown): void });
    for (let i = 0; i < 4.2 / DT; i++) (m as unknown as { updateUse(a: unknown, c: unknown): void }).updateUse(t, cmd);
    expect(b.alive).toBe(false);
  });
});

describe('launchers and explosives', () => {
  it('RPG rockets fly, arm and explode with splash damage', () => {
    const { m, t, ct } = setup();
    m.skipFreeze(); m.step(DT);
    m.debugTeleport(t, 36, -18, 0, 0);
    m.debugTeleport(ct, 36, -34, 0, 0);
    t.primary = makeWeapon('hammer');
    t.active = 'secondary'; equip(m, t, 'primary'); t.wpn.drawUntil = 0;
    t.pitch = Math.atan2(ct.pos.y + 0.9 - (t.pos.y + t.eyeHeight), 16);
    const blasts: unknown[] = [];
    m.events.on('explosion', (e) => blasts.push(e));
    act(m, t, {}); act(m, t, { fire: true });
    for (let i = 0; i < 64 && m.ordnance.shots.length; i++) m.ordnance.update(DT);
    expect(blasts.length).toBe(1);
    expect(ct.health).toBeLessThan(100);
  });

  it('40mm shells do not arm inside 5 m', () => {
    const { m, t, ct } = setup();
    m.skipFreeze(); m.step(DT);
    m.debugTeleport(t, 36, -18, 0, 0);
    m.debugTeleport(ct, 36, -21, 0, 0);
    t.primary = makeWeapon('thumper');
    t.active = 'secondary'; equip(m, t, 'primary'); t.wpn.drawUntil = 0;
    t.pitch = Math.atan2(ct.pos.y + 1.0 - (t.pos.y + t.eyeHeight), 3);
    const blasts: unknown[] = [];
    m.events.on('explosion', (e) => blasts.push(e));
    act(m, t, {}); act(m, t, { fire: true });
    for (let i = 0; i < 64 && m.ordnance.shots.length; i++) m.ordnance.update(DT);
    expect(blasts.length).toBe(0);
    expect(ct.health).toBeGreaterThan(60);
  });

  it('C4 sticks where thrown and detonates on command', () => {
    const { m, t, ct } = setup();
    m.debugTeleport(t, 30, -28, Math.PI / 2, -0.4);
    m.debugGiveGadget(t, 'c4');
    expect(m.gadgets.deploy(t, 'c4')).toBe(true);
    run(m, 1.5);
    const c4 = m.gadgets.devices.find((d) => d.kind === 'c4');
    expect(c4).toBeTruthy();
    m.debugTeleport(ct, c4!.pos.x + 1, c4!.pos.z, 0, 0);
    expect(m.gadgets.detonateC4(t)).toBe(true);
    expect(ct.health).toBeLessThan(100);
    expect(m.gadgets.devices.some((d) => d.kind === 'c4')).toBe(false);
  });
});

describe('killstreaks', () => {
  it('3 kills in one life earn a UAV that reveals enemies on radar', () => {
    const { m, t, ct } = setup(1);
    m.skipFreeze(); m.step(DT);
    for (let i = 0; i < 3; i++) m.killstreaks.onKill(t, 'ravager');
    expect(t.streaks).toEqual(['uav']);
    m.debugTeleport(ct, -50, -30, 0, 0);
    m.debugTeleport(t, 30, 30, 0, 0);
    ct.spottedUntil = 0;
    expect(m.killstreaks.activate(t)).toBe(true);
    m.step(DT);
    expect(ct.spottedUntil).toBeGreaterThan(m.time);
  });

  it('counter-UAV jams the enemy radar', () => {
    const { m, t, ct } = setup(1);
    m.skipFreeze(); m.step(DT);
    m.debugGiveStreak(t, 'counterUav');
    m.killstreaks.activate(t);
    m.step(DT);
    expect(ct.radarScrambledUntil).toBeGreaterThan(m.time);
    expect(t.radarScrambledUntil).toBeLessThanOrEqual(m.time);
  });

  it('hunter drone tracks down and damages the nearest enemy', () => {
    const { m, t, ct } = setup(1);
    m.skipFreeze(); m.step(DT);
    m.debugTeleport(t, 36, -18, 0, 0);
    m.debugTeleport(ct, 40, -30, 0, 0);
    m.debugGiveStreak(t, 'hunter');
    m.killstreaks.activate(t);
    for (let i = 0; i < 6 / DT && ct.health === 100; i++) { m.debugTeleport(ct, 40, -30, 0, 0); m.gadgets.update(DT); m.step(0); }
    expect(ct.health).toBeLessThan(100);
  });

  it('cruise missile punches through the roof and detonates on target', () => {
    const { m, t, ct } = setup(1);
    m.skipFreeze(); m.step(DT);
    m.debugTeleport(ct, -44, -26, 0, 0); // B site, under the office ceiling
    m.debugTeleport(t, 0, 33, 0, 0);
    t.isBot = true; // autopilot onto the spotted enemy
    ct.spottedUntil = m.time + 5;
    m.debugGiveStreak(t, 'missile');
    expect(m.killstreaks.activate(t)).toBe(true);
    for (let i = 0; i < 10 / DT && m.gadgets.devices.some((d) => d.kind === 'missile'); i++) m.gadgets.update(DT);
    expect(ct.health).toBeLessThan(100);
  });

  it('streak kills do not count toward further streaks and reset on death', () => {
    const { m, t } = setup(1);
    m.killstreaks.onKill(t, 'missile');
    expect(t.streakKills).toBe(0);
    m.killstreaks.onKill(t, 'ravager');
    expect(t.streakKills).toBe(1);
  });
});

describe('utilities economy', () => {
  const base = { money: 9000, armor: 0, helmet: false, hasKit: false, primary: null, secondary: null,
    grenades: { frag: 0, flash: 0, smoke: 0, fire: 0, decoy: 0, pulse: 0, stun: 0, tknife: 0 }, gadgets: emptyGadgets() };
  it('armor plates stack to 150; steel barricades are defenders-only; one stim pistol', () => {
    expect(purchaseBlocker({ kind: 'gear', id: 'plate' }, { ...base, team: 'T', armor: 150 })).toBe('Armor is maxed');
    expect(purchaseBlocker({ kind: 'gadget', id: 'steelBarricade' }, { ...base, team: 'T' })).not.toBeNull();
    expect(purchaseBlocker({ kind: 'gadget', id: 'stim' }, { ...base, team: 'T', gadgets: { ...emptyGadgets(), stim: 2 } })).toBe('Already owned');
  });
  it('an ammo box refills a teammate once per round', () => {
    const { m, t, t2 } = setup();
    m.debugTeleport(t, 36, -20, 0, 0);
    m.gadgets.placeAt(t, 'ammoBox', new Vector3(36, 0, -21), 0);
    t2.primary = makeWeapon('ravager'); t2.primary.reserve = 0;
    m.debugTeleport(t2, 36, -21.8, 0, 0);
    const press = { ...emptyCommand(), use: true };
    const upd = (m as unknown as { updateUse(a: unknown, c: unknown): void }).updateUse.bind(m);
    upd(t2, press);
    expect(t2.primary.reserve).toBe(90);
    t2.primary.reserve = 0;
    upd(t2, emptyCommand()); upd(t2, press);
    expect(t2.primary.reserve).toBe(0);
  });
});
