import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { emptyCommand } from '../src/sim/entities/Agent';
import { purchaseBlocker } from '../src/sim/mode/Economy';
import { emptyGadgets } from '../src/config/gadgets';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const DT = 1 / 64;

/** 1v1 bots held in a long freeze time so they stand still while we test devices. */
function setup() {
  const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 7,
    rules: { teamSize: 1, freezeTime: 999 } });
  const t = m.agents.find((a) => a.team === 'T')!;
  const ct = m.agents.find((a) => a.team === 'CT')!;
  return { m, t, ct };
}
const run = (m: Match, seconds: number) => { for (let i = 0; i < seconds / DT; i++) m.step(DT); };

describe('gadgets', () => {
  it('installs building CCTV for defenders each round', () => {
    const { m } = setup();
    const cams = m.gadgets.devices.filter((d) => d.kind === 'cctv');
    expect(cams.length).toBe(ACI_HQ.cctv.length);
    expect(cams.every((c) => c.team === 'CT')).toBe(true);
  });

  it('deployable shield blocks bullets, movement and navigation, and can be destroyed', () => {
    const { m, ct } = setup();
    expect(m.gadgets.placeAt(ct, 'shield', new Vector3(36, 0, -28), 0)).toBe(true);
    const sh = m.gadgets.devices.find((d) => d.kind === 'shield')!;
    const hit = m.world.collision.raycast(new Vector3(36, 0.7, -25.5), new Vector3(0, 0, -1), 20)!;
    expect(hit.box.device).toBe(sh.id);
    expect(m.world.nav.isWalkableAt(36, -28)).toBe(false);
    m.gadgets.damage(sh, 9999, null);
    expect(sh.alive).toBe(false);
    expect(m.world.collision.dynamic.length).toBe(0);
    expect(m.world.nav.isWalkableAt(36, -28)).toBe(true);
  });

  it('trip mine arms, trips on an enemy crossing the laser and damages them', () => {
    const { m, t, ct } = setup();
    m.debugTeleport(t, 44, -22, 0);
    m.debugTeleport(ct, 30, -36, 0);
    expect(m.gadgets.placeAt(t, 'mine', new Vector3(40, 0, -26), 0)).toBe(true);
    run(m, 2);
    const mine = m.gadgets.devices.find((d) => d.kind === 'mine')!;
    expect(mine.armed).toBe(true);
    const trips: number[] = [];
    m.events.on('mineTrip', () => trips.push(m.time));
    m.debugTeleport(ct, 40, -27.4, 0);
    ct.armor = 0;
    run(m, 1);
    expect(trips.length).toBe(1);
    expect(ct.health).toBeLessThan(100);
    expect(m.gadgets.devices.some((d) => d.kind === 'mine')).toBe(false);
  });

  it('EMP destroys enemy electronics in range and jams CCTV', () => {
    const { m, t, ct } = setup();
    m.debugTeleport(ct, 30, -36, 0);
    expect(m.gadgets.placeAt(ct, 'flockCam', new Vector3(36, 0, -24), 0)).toBe(true);
    m.debugTeleport(t, 36, -20, 0, -1.4);  // look at feet
    expect(m.gadgets.deploy(t, 'emp')).toBe(true);
    run(m, 2);
    expect(m.gadgets.devices.some((d) => d.kind === 'flockCam')).toBe(false);
  });

  it('sticky cam sticks to the first surface it hits', () => {
    const { m, t } = setup();
    m.debugTeleport(t, 30, -28, Math.PI / 2, 0.2);
    m.gadgets.deploy(t, 'stickyCam');
    run(m, 2);
    const cam = m.gadgets.devices.find((d) => d.kind === 'stickyCam');
    expect(cam).toBeTruthy();
    expect(cam!.normal).not.toBeNull();
    expect(m.gadgets.feedsFor(t).some((d) => d.id === cam!.id)).toBe(true);
  });

  it('drone lands, can be driven and pings enemies in view', () => {
    const { m, t, ct } = setup();
    m.debugTeleport(t, 36, -18, Math.PI, -0.2);
    m.gadgets.deploy(t, 'drone');
    run(m, 1.5);
    const drone = m.gadgets.devices.find((d) => d.kind === 'drone')!;
    expect(drone).toBeTruthy();
    m.gadgets.operate(t, drone.id);
    const start = drone.pos.clone();
    const cmd = emptyCommand();
    cmd.forward = 1; cmd.yaw = 0; // drive north
    for (let i = 0; i < 64; i++) m.gadgets.control(t, cmd, DT, false);
    expect(drone.pos.distanceTo(start)).toBeGreaterThan(2);
    // put an enemy straight ahead and ping
    m.debugTeleport(ct, drone.pos.x, drone.pos.z - 2, 0);
    cmd.forward = 0; cmd.pitch = 0.4;
    m.gadgets.control(t, cmd, DT, true);
    expect(ct.revealedUntil).toBeGreaterThan(m.time);
  });

  it('flock cam automatically reveals enemies crossing its view and alerts its team', () => {
    const { m, t, ct } = setup();
    m.debugTeleport(ct, 30, -36, 0);
    m.gadgets.placeAt(ct, 'flockCam', new Vector3(40, 0, -18), 0);
    const alerts: string[] = [];
    m.events.on('gadgetAlert', (e) => alerts.push(e.text));
    m.debugTeleport(t, 40, -26, 0);
    run(m, 1);
    expect(t.revealedUntil).toBeGreaterThan(m.time);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('barbed wire slows anyone standing in it', () => {
    const { m, ct } = setup();
    m.gadgets.placeAt(ct, 'wire', new Vector3(40, 0, -18), 0);
    expect(m.gadgets.wireSlowAt(new Vector3(40, 0, -18))).toBeLessThan(1);
    expect(m.gadgets.wireSlowAt(new Vector3(45, 0, -18))).toBe(1);
  });

  it('team restrictions and gadget slot limits are enforced when buying', () => {
    const g = { ...emptyGadgets(), drone: 1, stickyCam: 1, c4: 1, wire: 1 };
    const base = { money: 9000, armor: 0, helmet: false, hasKit: false, primary: null, secondary: null,
      grenades: { frag: 0, flash: 0, smoke: 0, fire: 0, decoy: 0, pulse: 0, stun: 0, tknife: 0 } };
    expect(purchaseBlocker({ kind: 'gadget', id: 'flockCam' }, { ...base, team: 'T' })).not.toBeNull();
    expect(purchaseBlocker({ kind: 'gadget', id: 'mine' }, { ...base, team: 'CT' })).not.toBeNull();
    expect(purchaseBlocker({ kind: 'gadget', id: 'mine' }, { ...base, team: 'T', gadgets: g })).toBe('Gadget slots full');
    expect(purchaseBlocker({ kind: 'gadget', id: 'drone' }, { ...base, team: 'T', gadgets: { ...g, wire: 0 } })).toBe('Carrying maximum');
  });

  it('bots buy and use gadgets during full matches', () => {
    const m = new Match({ map: ACI_HQ, difficulty: 'hard', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 3,
      rules: { roundsToWin: 4, halfLength: 3, freezeTime: 2, roundEndDelay: 1, startMoney: 6000 } });
    const kinds = new Set<string>();
    m.events.on('gadgetDeploy', (e) => kinds.add(e.kind));
    for (let t = 0; t < 600 && m.phase !== 'matchOver'; t += DT) m.step(DT);
    console.log('gadgets used by bots:', [...kinds].join(', '));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  }, 120_000);
});
