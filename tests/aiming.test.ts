import { describe, expect, it, vi } from 'vitest';
import { Mesh, Raycaster, Vector3, type Material, type Object3D } from 'three';
import { OUTFITS } from '../src/config/cosmetics';
import { WEAPONS, WEAPON_LIST, adsOptic, scopedView, type WeaponId } from '../src/config/weapons';
import { fits } from '../src/config/attachments';
import { DEG, dirFromAngles, yawTo } from '../src/core/math';
import { makeAimAssist } from '../src/app/AimAssist';
import { emptyCommand, makeWeapon } from '../src/sim/entities/Agent';
import { inaccuracy, shotAngles, spreadCone } from '../src/sim/combat/Ballistics';
import { launcherHoldover } from '../src/sim/combat/Ordnance';
import { updateWeapon } from '../src/sim/combat/WeaponSystem';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { weaponModel } from '../src/render/WeaponModels';
import { aimedEye } from '../src/render/ViewModel';

// Weapon models only need textures for looks; node has no canvas to paint them.
vi.mock('../src/render/Textures', () => {
  const info = () => ({ tex: null, worldW: 1, worldH: 1 });
  return { TEX: new Proxy({}, { get: () => info }), surfaceDetail: () => ({ normal: null, roughness: null }), finishTexture: () => null, flareSprite: () => null };
});

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const DT = 1 / 64;

/** Every gun you aim over its own sights or a reflex optic (scopes replace the view model). */
const aimedOverSights = WEAPON_LIST.filter((w) => w.class !== 'knife' && !scopedView(w, true, 1));
const opticVariants = aimedOverSights.flatMap((w) => (['reddot', 'holo'] as const).filter((o) => fits(w.id, o)).map((o) => [w.id, o] as const));

function sightPicture(id: WeaponId, optic = '') {
  const model = weaponModel(id, undefined, optic);
  model.updateMatrixWorld(true);
  const eye = aimedEye(model.userData, WEAPONS[id].class === 'pistol');
  const opaque: Object3D[] = [];
  model.traverse((o) => { if (o instanceof Mesh && !(o.material as Material).transparent) opaque.push(o); });
  const cast = (dy: number, yawDeg = 0, pitchDeg = 0) => {
    const dir = new Vector3(Math.sin(-yawDeg * DEG), Math.sin(pitchDeg * DEG), -1).normalize();
    // the view model camera's near plane is 1 cm
    const hit = new Raycaster(eye.clone().setY(eye.y + dy), dir, 0.01, 3).intersectObjects(opaque, false)[0];
    return hit ? { point: hit.point, at: hit.point.toArray().map((v) => +v.toFixed(4)).join(', ') } : null;
  };
  return { model, eye, cast };
}

describe('sight pictures', () => {
  it.each(aimedOverSights.map((w) => w.id))('%s: nothing on the gun covers the aim point', (id) => {
    const { cast } = sightPicture(id);
    // straight down the sight line and the field just above / beside it is open
    for (const [yaw, pitch] of [[0, 0], [0, 0.6], [0, 1.5], [0.3, 0.2], [-0.3, 0.2]]) expect(cast(0.0008, yaw, pitch)?.at, `${yaw},${pitch}`).toBeUndefined();
  });

  it.each(aimedOverSights.map((w) => w.id))('%s: the front post tip sits on the sight line', (id) => {
    const { cast, eye } = sightPicture(id);
    // a hair under the line, the ray passes the rear notch and stops on the front post, well forward
    const hit = cast(-0.0015);
    expect(hit).not.toBeNull();
    expect(hit!.point.z).toBeLessThan(eye.z - 0.25);
    expect(Math.abs(hit!.point.x)).toBeLessThan(0.004);
  });

  it.each(opticVariants)('%s with a %s: the optic window is clear', (id, optic) => {
    const { cast } = sightPicture(id, optic);
    // iron sights may co-witness low in the window, but never near the dot
    for (const [yaw, pitch] of [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -0.5]]) expect(cast(0, yaw, pitch)?.at, `${yaw},${pitch}`).toBeUndefined();
  });

  it('the rocket launcher aims through its own scope', () => {
    expect(adsOptic(WEAPONS.hammer)).toBe('pgo');
    expect(scopedView(WEAPONS.hammer, true, 0)).toBe(true);
    expect(scopedView(WEAPONS.hammer, false, 0)).toBe(false);
    expect(WEAPONS.hammer.ads!.zoom).toBeGreaterThan(1.5);
  });
});

describe('where the shot goes', () => {
  function range(id: WeaponId) {
    const match = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'T', playerName: 'Test', playerLook: look, seed: 33, rules: { teamSize: 1 } });
    match.skipFreeze(); match.step(DT);
    const player = match.player!;
    player.primary = makeWeapon(id); player.active = 'primary';
    player.pitch = -1.4; // into the floor
    const command = emptyCommand(); command.fire = true;
    return { match, player, command, tick: () => { match.time += DT; updateWeapon(match, player, command, DT); } };
  }

  it.each(['sentinel', 'ravager', 'bulwark', 'breacher', 'viper'] as WeaponId[])('%s: every bullet lands inside the crosshair (aim point + spread cone), not around the view centre', (id) => {
    const { match, player, tick } = range(id);
    const def = player.primary!.def;
    let shots = 0, outsideCentre = 0;
    match.events.on('shot', (e) => {
      if (e.agentId !== player.id) return;
      const eye = player.eyePos(new Vector3());
      const bullet = e.end.clone().sub(eye).normalize();
      const aim = shotAngles(player);
      expect(bullet.angleTo(dirFromAngles(aim.yaw, aim.pitch))).toBeLessThanOrEqual(spreadCone(def, player) + 1e-4);
      // the old crosshair (view centre: view + the camera's share of the punch) misses later shots
      const centre = dirFromAngles(player.yaw + player.aimPunchYaw * 0.45 * DEG, player.pitch + player.aimPunchPitch * 0.45 * DEG);
      if (bullet.angleTo(centre) > spreadCone(def, player)) outsideCentre++;
      shots++;
    });
    for (let i = 0; i < 160 && player.primary!.mag > 0; i++) tick();
    expect(shots).toBeGreaterThan(5);
    if (def.auto && !def.pellets) expect(outsideCentre).toBeGreaterThan(0);
  });

  it('shotgun crosshair covers the pellet pattern; single-bullet guns use the plain inaccuracy', () => {
    const { player } = range('breacher');
    expect(spreadCone(WEAPONS.breacher, player)).toBeCloseTo(inaccuracy(WEAPONS.breacher, player) + WEAPONS.breacher.spread.base / 1000, 9);
    expect(spreadCone(WEAPONS.sentinel, player)).toBe(inaccuracy(WEAPONS.sentinel, player));
  });

  it.each([['thumper', [10, 20, 35]], ['hammer', [25, 50, 90]]] as const)('%s range marks match where the shell really flies', (id, ranges) => {
    const match = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'T', playerName: 'Test', playerLook: look, seed: 4, rules: { teamSize: 1 } });
    match.skipFreeze();
    const p = match.player!, def = WEAPONS[id];
    for (const a of match.agents) if (a !== p) a.alive = false;
    // the yard's long east-west lane (open sky, 110 m)
    const spot = [-57, 29, -Math.PI / 2] as const;
    match.debugTeleport(p, spot[0], spot[1], spot[2], 0);
    const lane = p.eyePos(new Vector3());
    for (const dy of [-0.1, 1.5]) expect(match.world.collision.raycast(lane.clone().setY(lane.y + dy), dirFromAngles(spot[2], 0), Math.max(...ranges) + 4)).toBeNull();
    for (const r of ranges) {
      match.debugTeleport(p, spot[0], spot[1], spot[2], 0);
      const eye = p.eyePos(new Vector3());
      // aim level at a point r metres out, raised by the holdover the HUD marks show
      const hold = launcherHoldover(def, 0, r);
      expect(hold).toBeGreaterThan(0);
      p.yaw = spot[2]; p.pitch = hold; p.aimPunchPitch = p.aimPunchYaw = p.flinchPitch = p.flinchYaw = 0;
      match.ordnance.shots.length = 0;
      match.ordnance.fireLauncher(p, def, 0);
      const shell = match.ordnance.shots[0];
      let y: number | null = null, prev = shell.pos.clone();
      for (let i = 0; i < 400 && match.ordnance.shots.includes(shell); i++) {
        prev.copy(shell.pos);
        match.ordnance.update(DT);
        const d0 = Math.hypot(prev.x - eye.x, prev.z - eye.z), d1 = Math.hypot(shell.pos.x - eye.x, shell.pos.z - eye.z);
        if (d1 >= r) { y = prev.y + (shell.pos.y - prev.y) * (r - d0) / (d1 - d0); break; }
      }
      expect(y, `${id} reaches ${r} m`).not.toBeNull();
      expect(Math.abs(y! - eye.y), `${id} at ${r} m`).toBeLessThan(0.06 + r * 0.002);
    }
  });
});

describe('aim assist', () => {
  function stage() {
    const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'CT', playerName: 'P', playerLook: look, seed: 3, rules: { teamSize: 2, freezeTime: 999 } });
    const p = m.player!, e = m.agents.find((a) => a.team === 'T')!;
    m.debugTeleport(p, 36, -20, 0); m.debugTeleport(e, 36, -30, 0);
    for (const a of m.agents) if (a !== p && a !== e) a.alive = false;
    p.yaw = 0; p.pitch = 0;
    const eye = p.eyePos(new Vector3());
    const angles = (pt: Vector3) => ({ yaw: yawTo(pt.x - eye.x, pt.z - eye.z), pitch: Math.atan2(pt.y - eye.y, Math.hypot(pt.x - eye.x, pt.z - eye.z)) });
    return { m, p, e, head: angles(e.eyePos(new Vector3())), chest: angles(e.aimPoint(false, new Vector3())) };
  }

  it('never drags you off a headshot: no vertical pull anywhere on the body, a pull down from above the head', () => {
    const { m, head, chest } = stage();
    const assist = makeAimAssist(m, () => 'high');
    for (const t of [head, chest]) {
      const r = assist(t.yaw + 0.02, t.pitch, 1 / 60, true)!;
      expect(r).not.toBeNull();
      expect(Math.abs(r.pitch)).toBeLessThan(1e-6);
      expect(r.yaw).toBeLessThan(0); // back toward the body column
    }
    const above = assist(head.yaw, head.pitch + 0.03, 1 / 60, true)!;
    expect(above.pitch).toBeLessThan(0);
  });

  it('measures from where the bullet goes, recoil included', () => {
    const { m, p, head } = stage();
    const assist = makeAimAssist(m, () => 'medium');
    // view 3° right of the head, but the recoil punch swings the shot onto it: on target, no pull
    p.aimPunchYaw = 3;
    const on = assist(head.yaw - 3 * DEG, head.pitch, 1 / 60, true)!;
    expect(on).not.toBeNull();
    expect(on.sens).toBeLessThan(0.7);
    expect(Math.abs(on.yaw)).toBeLessThan(1e-6);
    // the same view without the punch is 3° off: pulled left onto them, with less friction
    p.aimPunchYaw = 0;
    const off = assist(head.yaw - 3 * DEG, head.pitch, 1 / 60, true)!;
    expect(off.yaw).toBeGreaterThan(0);
    expect(off.sens).toBeGreaterThan(on.sens);
  });

  it('tracks a strafing target while you aim, not while idle', () => {
    const { m, e, chest } = stage();
    for (const active of [true, false]) {
      m.debugTeleport(e, 36, -30, 0);
      const assist = makeAimAssist(m, () => 'high');
      assist(chest.yaw, chest.pitch, 1 / 60, active);
      m.debugTeleport(e, 35.85, -30, 0); // 15 cm to the player's left (+yaw)
      const r = assist(chest.yaw, chest.pitch, 1 / 60, active)!;
      const moved = yawTo(35.85 - 36, -30 - (-20)) - yawTo(0, -10);
      if (active) expect(r.yaw).toBeGreaterThan(moved * 0.3);
      else expect(r.yaw).toBeLessThan(moved * 0.1);
    }
  });

  it('pulls more gently through a magnified scope', () => {
    const { m, head } = stage();
    const assist = makeAimAssist(m, () => 'high');
    const hip = assist(head.yaw + 0.03, head.pitch, 1 / 60, true)!;
    const scoped = assist(head.yaw + 0.03, head.pitch, 1 / 60, true, 6)!;
    expect(Math.abs(scoped.yaw)).toBeLessThan(Math.abs(hip.yaw));
    expect(Math.abs(scoped.yaw)).toBeLessThanOrEqual((18 * DEG) / 60 / 6 + 1e-9);
  });

  it('caps tracking and pull together through a scope, including after a frame stall', () => {
    const { m, e, chest } = stage();
    const assist = makeAimAssist(m, () => 'high');
    assist(chest.yaw, chest.pitch, 1 / 60, true, 6);
    m.debugTeleport(e, 35.5, -30, 0);
    const r = assist(chest.yaw, chest.pitch, 0.5, true, 6)!;
    expect(r).not.toBeNull();
    expect(Math.abs(r.yaw)).toBeLessThanOrEqual(18 * DEG * 0.05 / 6 + 1e-9);
    expect(Math.abs(r.pitch)).toBeLessThanOrEqual(18 * DEG * 0.05 / 6 + 1e-9);
  });

  it('does not pull toward a covered head even when the lower body is visible', () => {
    const { m, p, e, head } = stage();
    m.world.collision.addDynamic({ minX: 34, maxX: 38, minY: 1.4, maxY: 3, minZ: -25.2, maxZ: -25, surface: 'metal' });
    expect(m.los(p, e)).toBe(true);
    expect(makeAimAssist(m, () => 'high')(head.yaw + 0.02, head.pitch, 1 / 60, true)).toBeNull();
  });
});
