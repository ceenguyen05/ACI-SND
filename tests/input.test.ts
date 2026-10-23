import { describe, expect, it } from 'vitest';
import { PlayerController } from '../src/app/PlayerController';
import { DEFAULT_SETTINGS } from '../src/app/Profile';
import type { Input } from '../src/app/Input';
import { Agent } from '../src/sim/entities/Agent';
import { OUTFITS } from '../src/config/cosmetics';

describe('input between simulation ticks', () => {
  it('retains a quick click for one tick, then releases it', () => {
    const pressed = new Set(['Mouse0']);
    const input = {
      gameFocus: true, consumeMouse: () => ({ dx: 0, dy: 0, wheel: 0 }),
      action: () => false, actionPressed: () => false,
      wasPressed: (key: string) => pressed.has(key), isDown: () => false,
    } as unknown as Input;
    const ctrl = new PlayerController(input, DEFAULT_SETTINGS);
    const agent = new Agent('Player', 'T', false, { T: OUTFITS[0].look, CT: OUTFITS[3].look });
    ctrl.frame(agent, 1);
    pressed.clear();
    // A second display frame before the fixed tick must not discard the click.
    ctrl.frame(agent, 1);
    expect(ctrl.command(agent).fire).toBe(true);
    expect(ctrl.command(agent).fire).toBe(false);
  });
});

describe('new combat keys', () => {
  it('holds crouch before entering prone, releases to stand, and latches a slide once', () => {
    const down = new Set<string>(['crouch']), pressed = new Set<string>();
    const input = { gameFocus: true, consumeMouse: () => ({ dx: 0, dy: 0, wheel: 0 }),
      action: (a: string) => down.has(a), actionPressed: (a: string) => pressed.has(a), wasPressed: () => false, isDown: () => false } as unknown as Input;
    const ctrl = new PlayerController(input, DEFAULT_SETTINGS);
    const agent = new Agent('Player', 'T', false, { T: OUTFITS[0].look, CT: OUTFITS[3].look });
    for (let i = 0; i < 20; i++) ctrl.frame(agent, 1, 1 / 60);
    expect(ctrl.command(agent).crouch).toBe(true); expect(ctrl.command(agent).prone).toBe(false);
    for (let i = 0; i < 20; i++) ctrl.frame(agent, 1, 1 / 60);
    expect(ctrl.command(agent).prone).toBe(true);
    down.clear(); pressed.add('slide'); ctrl.frame(agent, 1, 1 / 60); pressed.clear();
    const c = ctrl.command(agent);
    expect(c.prone).toBe(false); expect(c.slide).toBe(true); expect(ctrl.command(agent).slide).toBe(false);
    down.add('crouch'); ctrl.frame(agent, 1, 1 / 60);
    expect(ctrl.command(agent).prone).toBe(false);
  });
  it('quick melee / stim / killstreak / detonate presses reach exactly one command', () => {
    const pressed = new Set(['quickMelee', 'stimSelf', 'killstreak', 'detonate']);
    const input = {
      gameFocus: true, consumeMouse: () => ({ dx: 0, dy: 0, wheel: 0 }),
      action: () => false, actionPressed: (a: string) => pressed.has(a),
      wasPressed: () => false, isDown: () => false,
    } as unknown as Input;
    const ctrl = new PlayerController(input, DEFAULT_SETTINGS);
    const agent = new Agent('Player', 'T', false, { T: OUTFITS[0].look, CT: OUTFITS[3].look });
    ctrl.frame(agent, 1);
    pressed.clear();
    const c = ctrl.command(agent);
    expect([c.quickMelee, c.stimSelf, c.killstreak, c.detonate]).toEqual([true, true, true, true]);
    const c2 = ctrl.command(agent);
    expect([c2.quickMelee, c2.stimSelf, c2.killstreak, c2.detonate]).toEqual([false, false, false, false]);
  });

  it('defaults: V stabs, T opens cameras; old saves with cameras on V are migrated', async () => {
    const { DEFAULT_BINDINGS } = await import('../src/config/controls');
    expect(DEFAULT_BINDINGS.quickMelee).toBe('KeyV');
    expect(DEFAULT_BINDINGS.cams).toBe('KeyT');
    expect(DEFAULT_BINDINGS.slide).toBe('AltLeft');
    expect(DEFAULT_BINDINGS.detonate).toBe('KeyZ');
    expect(DEFAULT_BINDINGS.melee).not.toBe(DEFAULT_BINDINGS.quickMelee);
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    const { loadProfile, defaultProfile } = await import('../src/app/Profile');
    const old = defaultProfile() as unknown as { settings: { bindings: Record<string, string>; aimAssist?: string } };
    old.settings.bindings = { ...old.settings.bindings, cams: 'KeyV' };
    delete old.settings.bindings.quickMelee; delete old.settings.aimAssist;
    delete old.settings.bindings.slide;
    store.set('aci-snd-profile-v1', JSON.stringify(old));
    const p = loadProfile();
    expect(p.settings.bindings.cams).toBe('KeyT');
    expect(p.settings.bindings.quickMelee).toBe('KeyV');
    expect(p.settings.bindings.slide).toBe('AltLeft');
    expect(p.settings.aimAssist).toBe('low');
    // every action has a unique key
    const keys = Object.values(p.settings.bindings);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('crouch & prone modes', () => {
  function rig(mode: 'hold' | 'toggle') {
    const down = new Set<string>(), pressed = new Set<string>();
    const settings = { ...DEFAULT_SETTINGS, crouchMode: mode };
    const b = settings.bindings;
    const input = {
      gameFocus: true, consumeMouse: () => ({ dx: 0, dy: 0, wheel: 0 }),
      action: (a: keyof typeof b) => down.has(b[a]), actionPressed: (a: keyof typeof b) => pressed.has(b[a]),
      wasPressed: (k: string) => pressed.has(k), isDown: (k: string) => down.has(k),
    } as unknown as Input;
    const ctrl = new PlayerController(input, settings);
    const agent = new Agent('P', 'T', false, { T: OUTFITS[0].look, CT: OUTFITS[3].look });
    const frames = (n: number, keys: string[] = []) => {
      let cmd = ctrl.command(agent);
      for (let i = 0; i < n; i++) {
        for (const k of keys) { if (!down.has(k)) pressed.add(k); down.add(k); }
        ctrl.frame(agent, 1, 1 / 60);
        cmd = ctrl.command(agent);
        pressed.clear();
        if (cmd.prone) agent.motor.prone = 1; // the sim would lower the body
      }
      return cmd;
    };
    const release = () => { down.clear(); };
    return { frames, release, b, agent };
  }

  it('hold mode: crouch-walking or spraying never drops you prone; holding still does', () => {
    const r = rig('hold');
    expect(r.frames(60, [r.b.crouch, r.b.forward]).prone).toBe(false);   // 1 s crouch-walking
    r.release();
    expect(r.frames(60, [r.b.crouch, 'Mouse0']).prone).toBe(false);      // 1 s crouch-spraying
    r.release();
    expect(r.frames(45, [r.b.crouch]).prone).toBe(true);                 // 0.75 s holding still
    expect(r.frames(30, [r.b.crouch, r.b.forward]).prone).toBe(true);    // already prone: crawl
    r.release(); r.agent.motor.prone = 0;
    expect(r.frames(2).crouch).toBe(false);
  });

  it('toggle mode: tap crouches, hold goes prone and stays, tap from prone crouches, jump stands', () => {
    const r = rig('toggle');
    r.frames(3, [r.b.crouch]); r.release();
    let c = r.frames(10);
    expect(c.crouch).toBe(true); expect(c.prone).toBe(false);           // tapped: crouched without holding
    r.frames(3, [r.b.crouch]); r.release();
    expect(r.frames(5).crouch).toBe(false);                             // tap again: stand
    r.frames(40, [r.b.crouch]); r.release();
    c = r.frames(30);
    expect(c.prone).toBe(true);                                         // held: prone, and it sticks
    r.frames(3, [r.b.crouch]); r.release();
    c = r.frames(5);
    expect(c.prone).toBe(false); expect(c.crouch).toBe(true);           // tap from prone: crouch
    r.frames(40, [r.b.crouch]); r.release(); r.frames(5);
    c = r.frames(1, [r.b.jump]); r.release();
    expect(c.prone).toBe(false); expect(c.crouch).toBe(false); // Space stands up (the motor never jumps out of prone)
  });
});
