import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { WEAPONS } from '../src/config/weapons';
import { ATTACHMENTS, ATTACHMENT_LIST, MAX_ATTACHMENTS, deriveDef, fits, optionsFor } from '../src/config/attachments';
import { inaccuracy } from '../src/sim/combat/Ballistics';
import { fireGun } from '../src/sim/combat/Ballistics';
import { emptyCommand } from '../src/sim/entities/Agent';
import { updateWeapon } from '../src/sim/combat/WeaponSystem';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const DT = 1 / 64;

describe('gunsmith stats', () => {
  it('attachments change the gun stats they claim to', () => {
    const base = WEAPONS.ravager;
    const ext = deriveDef('ravager', { magazine: 'extmag' });
    expect(ext.mag).toBe(45);
    expect(ext.reloadTime).toBeCloseTo(base.reloadTime * 1.12, 5);
    expect(deriveDef('ravager', { muzzle: 'suppressor' }).sound).toBe('suppressed');
    expect(deriveDef('ravager', { underbarrel: 'vgrip' }).recoil.climb).toBeCloseTo(base.recoil.climb * 0.85, 5);
    expect(deriveDef('sentinel', { optic: 'acog' }).ads?.zoom).toBe(2.5);
    expect(deriveDef('breacher', { muzzle: 'choke' }).spread.base).toBeCloseTo(WEAPONS.breacher.spread.base * 0.7, 5);
    expect(deriveDef('ravager', { magazine: 'extmag' })).toBe(ext); // cached
    expect(deriveDef('ravager', {})).toBe(base);                     // no attachments = the stock gun
  });

  it('each gun only offers attachments that fit it', () => {
    expect(fits('talon', 'tacstock')).toBe(false);   // bullpup
    expect(fits('kestrel', 'acog')).toBe(false);     // already scoped
    expect(fits('hammer', 'reddot')).toBe(false);    // launcher
    expect(fits('warden', 'suppressor')).toBe(false); // integral suppressor
    expect(fits('breacher', 'extmag')).toBe(false);  // tube-fed
    expect(fits('bulwark', 'bipod')).toBe(true);
    expect(fits('ravager', 'bipod')).toBe(false);
    expect(optionsFor('knife')).toEqual([]);
    for (const a of ATTACHMENT_LIST) {
      expect(a.price).toBeGreaterThanOrEqual(100);
      expect(a.price).toBeLessThanOrEqual(600);
    }
  });
});

function freezeMatch() {
  const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'T', playerName: 'P', playerLook: look, seed: 4,
    rules: { teamSize: 2, freezeTime: 999, roundsToWin: 4, halfLength: 2 } });
  const p = m.player!;
  p.money = 16000;
  return { m, p };
}

describe('buying attachments', () => {
  it('buy fits it, clicking again removes it for free, and it is kept on the gun you hold', () => {
    const { m, p } = freezeMatch();
    expect(m.tryBuy(p, { kind: 'weapon', id: 'ravager' })).toBe(true);
    const before = p.money;
    expect(m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'extmag' })).toBe(true);
    expect(p.money).toBe(before - ATTACHMENTS.extmag.price);
    expect(p.primary!.def.mag).toBe(45);
    expect(p.primary!.mag).toBe(45);
    // remove (free), refit (free)
    expect(m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'extmag' })).toBe(true);
    expect(p.primary!.def.mag).toBe(30);
    expect(m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'extmag' })).toBe(true);
    expect(p.money).toBe(before - ATTACHMENTS.extmag.price);
    // swapping inside a slot replaces it
    m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'fastmag' });
    expect(p.loadouts.ravager!.equipped.magazine).toBe('fastmag');
    expect(p.primary!.def.mag).toBe(30);
  });

  it('caps a gun at 5 attachments and refuses guns you are not carrying', () => {
    const { m, p } = freezeMatch();
    m.tryBuy(p, { kind: 'weapon', id: 'ravager' });
    for (const id of ['reddot', 'brake', 'vgrip', 'laser1mw', 'extmag'] as const) expect(m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id })).toBe(true);
    expect(Object.keys(p.loadouts.ravager!.equipped).length).toBe(MAX_ATTACHMENTS);
    expect(m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'fmj' })).toBe(false);
    // swapping inside an occupied slot is still fine
    expect(m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'holo' })).toBe(true);
    expect(m.tryBuy(p, { kind: 'attachment', weapon: 'galeforce', id: 'reddot' })).toBe(false);
  });

  it('attachments survive death: rebuy the gun next round and the loadout is back for free; halftime resets', () => {
    const { m, p } = freezeMatch();
    m.tryBuy(p, { kind: 'weapon', id: 'ravager' });
    m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'extmag' });
    m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'suppressor' });
    // die, then let the round end and the next one start
    m.skipFreeze(); m.step(DT);
    m.applyDamage(p, null, { health: 500, armor: 0 }, 'head', 'fall', p.pos.clone(), new Vector3(0, -1, 0));
    for (let i = 0; i < 64 * 400 && m.round < 2; i++) m.step(DT);
    expect(m.round).toBe(2);
    expect(p.primary).toBeNull();
    p.money = 5000;
    m.tryBuy(p, { kind: 'weapon', id: 'ravager' });
    expect(p.money).toBe(5000 - WEAPONS.ravager.price);
    expect(p.primary!.def.mag).toBe(45);
    expect(p.primary!.def.sound).toBe('suppressed');
    // to halftime (halfLength 2): the Gunsmith resets with the economy
    m.skipFreeze();
    for (let i = 0; i < 64 * 600 && m.round < 3; i++) m.step(DT);
    expect(m.round).toBe(3);
    expect(p.loadouts).toEqual({});
  }, 120_000);
});

describe('attachment mechanics', () => {
  function live() {
    const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: 'spectator', playerName: 'x', playerLook: look, seed: 9, rules: { teamSize: 2, freezeTime: 999 } });
    m.skipFreeze(); m.step(DT);
    const [t] = m.agents.filter((a) => a.team === 'T'), [ct] = m.agents.filter((a) => a.team === 'CT');
    const bots = (m as unknown as { bots: Map<number, unknown> }).bots;
    bots.delete(t.id); bots.delete(ct.id);
    return { m, t, ct };
  }

  it('a suppressor keeps you off the enemy radar; unsuppressed fire pings it', () => {
    const { m, t } = live();
    m.debugTeleport(t, -36, 4, 0, 0);
    fireGun(m, t, WEAPONS.ravager);
    expect(t.spottedUntil).toBeGreaterThan(m.time);
    t.spottedUntil = 0;
    fireGun(m, t, deriveDef('ravager', { muzzle: 'suppressor' }));
    expect(t.spottedUntil).toBe(0);
  });

  it('lasers tighten hip fire; a bipod steadies a crouched LMG', () => {
    const { t } = live();
    const hip = inaccuracy(WEAPONS.ravager, t), laser = inaccuracy(deriveDef('ravager', { laser: 'laser5mw' }), t);
    expect(laser).toBeLessThan(hip);
    t.motor.duck = 1; t.motor.vel.set(0, 0, 0);
    expect(inaccuracy(deriveDef('bulwark', { underbarrel: 'bipod' }), t)).toBeLessThan(inaccuracy(WEAPONS.bulwark, t) * 0.7);
  });

  it('a tactical light dazzles an enemy looking into it', () => {
    const { m, t, ct } = live();
    m.debugTeleport(t, -36, 4, 0, 0);         // facing -Z
    m.debugTeleport(ct, -36, -4, Math.PI, 0); // facing +Z, back at the light
    t.primary = { def: deriveDef('ravager', { laser: 'flashlight' }), mag: 30, reserve: 90, att: { laser: 'flashlight' } };
    t.active = 'primary';
    t.pitch = 0;
    updateWeapon(m, t, { ...emptyCommand(), yaw: t.yaw, pitch: t.pitch, light: true }, DT);
    expect(t.lightOn).toBe(true);
    const lights = () => { const mm = m as unknown as { losCache: Map<number, boolean>; updateWeaponLights(): void }; mm.losCache.clear(); mm.updateWeaponLights(); };
    lights();
    expect(ct.dazzleAt(m.time)).toBeGreaterThan(0.2);
    ct.yaw = 0; // look away → no glare
    ct.dazzleUntil = 0;
    lights();
    expect(ct.dazzleAt(m.time)).toBe(0);
  });
});
