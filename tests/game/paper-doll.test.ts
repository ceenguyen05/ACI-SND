import { describe, expect, it } from 'vitest';
import { DOLL_LINGER, DollPresence, dollActing, paperDollSize, PAPER_DOLL_BOX, type PaperDollPose } from '../../src/render/PaperDoll';
import { DEFAULT_SETTINGS } from '../../src/app/Profile';

const pose = (over: Partial<PaperDollPose> = {}): PaperDollPose => ({
  id: 1, look: { primary: '#445', secondary: '#333', accent: '#c80', skin: '#c99', headgear: 'none', style: 'vest' } as PaperDollPose['look'], held: 'w:ravager::',
  speed: 0, maxSpeed: 5.2, forward: 0, right: 0, crouch: 0, prone: 0, slide: 0, onGround: true, lift: 0,
  yaw: 0, pitch: 0, aimYaw: 0, lean: 0, reload: 0, planting: false, ads: false, mantling: false, ...over,
});
const idle = (p = pose()) => dollActing(p, 99, 99, 99);
const run = (presence: DollPresence, seconds: number, mode: 'off' | 'action' | 'always', available: boolean, acting: boolean) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) presence.update(1 / 60, mode, available, acting);
  return presence.shown;
};

describe('paper doll', () => {
  it('is off by default, so the HUD is unchanged until a player turns it on', () => {
    expect(DEFAULT_SETTINGS.paperDoll).toBe('off');
    expect(DEFAULT_SETTINGS.paperDollSize).toBe(1);
  });

  it('counts combat and movement tech as actions, but not standing or walking', () => {
    expect(idle()).toBe(false);
    expect(idle(pose({ speed: 5, forward: 5 }))).toBe(false);
    for (const p of [{ crouch: 1 }, { prone: 0.5 }, { slide: 0.4 }, { onGround: false }, { lean: -1 }, { reload: 0.3 },
      { planting: true }, { ads: true }, { mantling: true }] as Partial<PaperDollPose>[]) {
      expect(idle(pose(p)), JSON.stringify(p)).toBe(true);
    }
    expect(dollActing(pose(), 0.05, 99, 99)).toBe(true); // just fired
    expect(dollActing(pose(), 99, 0.2, 99)).toBe(true);  // threw / meleed
    expect(dollActing(pose(), 99, 99, 0.1)).toBe(true);  // got hit
  });

  it('"Always" slides in quickly and leaves when there is nothing to show', () => {
    const p = new DollPresence();
    expect(run(p, 0.25, 'always', true, false)).toBe(1);
    expect(run(p, 0.25, 'always', false, false)).toBe(0); // dead, killcam, camera feed
  });

  it('"When acting" appears on an action, lingers, then tucks away', () => {
    const p = new DollPresence();
    expect(run(p, 1, 'action', true, false)).toBe(0);
    expect(run(p, 0.25, 'action', true, true)).toBe(1);
    expect(run(p, DOLL_LINGER - 0.3, 'action', true, false)).toBe(1);
    expect(run(p, 0.6, 'action', true, false)).toBe(0);
    p.poke(); // weapon swap
    expect(run(p, 0.25, 'action', true, false)).toBe(1);
  });

  it('"Off" never shows', () => {
    const p = new DollPresence();
    expect(run(p, 1, 'off', true, true)).toBe(0);
  });

  it('scales its corner box with the size setting', () => {
    expect(paperDollSize(1)).toEqual({ w: PAPER_DOLL_BOX.w, h: PAPER_DOLL_BOX.h });
    expect(paperDollSize(1.5).w).toBe(Math.round(PAPER_DOLL_BOX.w * 1.5));
    expect(paperDollSize(0.7).h).toBe(Math.round(PAPER_DOLL_BOX.h * 0.7));
  });
});
