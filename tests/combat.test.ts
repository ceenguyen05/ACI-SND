import { describe, expect, it } from 'vitest';
import { computeDamage } from '../src/sim/combat/damage';
import { punchAt, sprayPattern } from '../src/sim/combat/recoil';
import { WEAPONS } from '../src/config/weapons';

describe('damage model', () => {
  it('Ravager one-taps a helmeted head at close range', () => {
    expect(computeDamage(36, 0.775, 0.98, 5, 'head', 100, true).health).toBeGreaterThanOrEqual(100);
  });
  it('Sentinel does not one-tap a helmeted head', () => {
    expect(computeDamage(33, 0.7, 0.97, 5, 'head', 100, true).health).toBeLessThan(100);
  });
  it('Longbow is lethal to an armored chest but not legs', () => {
    expect(computeDamage(115, 0.975, 0.99, 20, 'chest', 100, true).health).toBeGreaterThanOrEqual(100);
    expect(computeDamage(115, 0.975, 0.99, 20, 'legs', 100, true).health).toBeLessThan(100);
  });
  it('armor absorbs damage and loses armor points', () => {
    const r = computeDamage(30, 0.47, 1, 0, 'chest', 100, false);
    expect(r.health).toBe(14);
    expect(r.armor).toBe(7);
  });
  it('legs ignore armor; head without helmet ignores armor', () => {
    expect(computeDamage(36, 0.775, 1, 0, 'legs', 100, true)).toEqual({ health: 27, armor: 0 });
    expect(computeDamage(36, 0.775, 1, 0, 'head', 100, false)).toEqual({ health: 144, armor: 0 });
  });
  it('range falloff reduces damage', () => {
    expect(computeDamage(30, 1, 0.85, 50, 'chest', 0, false).health).toBeLessThan(30);
  });
});

describe('spray patterns', () => {
  it('are deterministic and start at zero', () => {
    const p1 = sprayPattern(WEAPONS.ravager), p2 = sprayPattern(WEAPONS.ravager);
    expect(p1).toBe(p2);
    expect(p1[0]).toBe(0); expect(p1[1]).toBe(0);
  });
  it('climb vertically during the first shots', () => {
    const p = punchAt(WEAPONS.ravager, 8);
    expect(p.pitch).toBeGreaterThan(5);
    expect(Math.abs(p.yaw)).toBeLessThan(3);
  });
  it('sway horizontally later in the spray', () => {
    let maxYaw = 0;
    for (let i = 10; i < 30; i++) maxYaw = Math.max(maxYaw, Math.abs(punchAt(WEAPONS.ravager, i).yaw));
    expect(maxYaw).toBeGreaterThan(1.5);
  });
});
