import { describe, expect, it } from 'vitest';
import { killReward, lossBonus, nextLossStreak, priceOf, purchaseBlocker, winReward, type Buyer } from '../src/sim/mode/Economy';

const buyer = (o: Partial<Buyer> = {}): Buyer => ({
  team: 'T', money: 800, armor: 0, helmet: false, hasKit: false,
  grenades: { frag: 0, flash: 0, smoke: 0, fire: 0, decoy: 0, pulse: 0, stun: 0, tknife: 0 }, primary: null, secondary: null, ...o,
});

describe('economy', () => {
  it('loss bonus ladder matches CS2', () => {
    expect([1, 2, 3, 4, 5, 6].map(lossBonus)).toEqual([1400, 1900, 2400, 2900, 3400, 3400]);
  });
  it('winning reduces loss streak by one (CS2 rule)', () => {
    expect(nextLossStreak(3, true)).toBe(2);
    expect(nextLossStreak(0, true)).toBe(0);
    expect(nextLossStreak(5, false)).toBe(5);
  });
  it('round win rewards', () => {
    expect(winReward('elimination')).toBe(3250);
    expect(winReward('bomb')).toBe(3500);
    expect(winReward('defuse')).toBe(3500);
  });
  it('kill rewards by weapon class', () => {
    expect(killReward('ravager')).toBe(300);
    expect(killReward('vespa')).toBe(600);
    expect(killReward('breacher')).toBe(900);
    expect(killReward('longbow')).toBe(100);
    expect(killReward('knife')).toBe(1500);
    expect(killReward('frag')).toBe(300);
  });
  it('helmet costs 350 when vest is full', () => {
    expect(priceOf({ kind: 'gear', id: 'helmet' }, { team: 'T', armor: 100, helmet: false })).toBe(350);
    expect(priceOf({ kind: 'gear', id: 'helmet' }, { team: 'T', armor: 40, helmet: false })).toBe(1000);
  });
  it('team-specific prices and restrictions', () => {
    expect(priceOf({ kind: 'utility', id: 'fire' }, { team: 'T', armor: 0, helmet: false })).toBe(400);
    expect(priceOf({ kind: 'utility', id: 'fire' }, { team: 'CT', armor: 0, helmet: false })).toBe(600);
    expect(purchaseBlocker({ kind: 'weapon', id: 'sentinel' }, buyer({ money: 9000 }))).not.toBeNull();
    expect(purchaseBlocker({ kind: 'gear', id: 'kit' }, buyer({ money: 9000 }))).not.toBeNull();
    expect(purchaseBlocker({ kind: 'weapon', id: 'ravager' }, buyer({ money: 2700 }))).toBeNull();
    expect(purchaseBlocker({ kind: 'weapon', id: 'ravager' }, buyer({ money: 2699 }))).toBe('Not enough money');
  });
  it('grenade limits', () => {
    const g = { frag: 1, flash: 2, smoke: 1, fire: 0, decoy: 0, pulse: 0, stun: 0, tknife: 0 };
    expect(purchaseBlocker({ kind: 'utility', id: 'fire' }, buyer({ money: 9000, grenades: g }))).toBe('Grenade slots full');
    expect(purchaseBlocker({ kind: 'utility', id: 'flash' }, buyer({ money: 9000, grenades: { ...g, frag: 0 } }))).toBe('Carrying maximum');
  });
});
