import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Match } from '../src/sim/mode/Match';
import { ACI_HQ } from '../src/sim/maps/aciHq';
import { OUTFITS } from '../src/config/cosmetics';
import { WEAPONS } from '../src/config/weapons';

const look = { T: OUTFITS[0].look, CT: OUTFITS[3].look };
const DT = 1 / 64;

function freezeMatch(team: 'T' | 'CT' = 'T') {
  const m = new Match({ map: ACI_HQ, difficulty: 'normal', playerTeam: team, playerName: 'P', playerLook: look, seed: 5,
    rules: { teamSize: 2, freezeTime: 999, roundsToWin: 5, halfLength: 4 } });
  return { m, p: m.player! };
}

describe('rebuy and auto-buy', () => {
  it('rebuy repeats last round\'s purchases after you die, with Gunsmith attachments coming back free', () => {
    const { m, p } = freezeMatch();
    p.money = 9000;
    m.tryBuy(p, { kind: 'weapon', id: 'ravager' });
    m.tryBuy(p, { kind: 'attachment', weapon: 'ravager', id: 'vgrip' });
    m.tryBuy(p, { kind: 'gear', id: 'helmet' });
    m.tryBuy(p, { kind: 'utility', id: 'flash' });
    m.skipFreeze(); m.step(DT);
    m.applyDamage(p, null, { health: 500, armor: 0 }, 'head', 'fall', p.pos.clone(), new Vector3(0, -1, 0));
    for (let i = 0; i < 64 * 400 && m.round < 2; i++) m.step(DT);
    expect(m.round).toBe(2);
    expect(p.primary).toBeNull();
    p.money = 6000;
    expect(m.rebuy(p)).toBe(3);
    expect(p.primary!.def.id).toBe('ravager');
    expect(p.primary!.att?.underbarrel).toBe('vgrip');
    expect(p.helmet).toBe(true);
    expect(p.grenades.flash).toBe(1);
    expect(p.money).toBe(6000 - WEAPONS.ravager.price - 1000 - 200);
    expect(m.rebuy(p)).toBe(0); // nothing left to buy
  }, 120_000);

  it('auto-buy picks the best loadout you can afford', () => {
    const rich = freezeMatch('CT');
    rich.p.money = 6000;
    expect(rich.m.autoBuy(rich.p)).toBeGreaterThanOrEqual(4);
    expect(rich.p.primary!.def.id).toBe('sentinel');
    expect(rich.p.helmet).toBe(true);
    expect(rich.p.hasKit).toBe(true);
    expect(rich.p.money).toBeGreaterThanOrEqual(0);
    const poor = freezeMatch('T');
    poor.p.money = 1200;
    poor.m.autoBuy(poor.p);
    expect(poor.p.primary!.def.id).toBe('vespa');
    // nothing at all outside buy time
    const late = freezeMatch('T');
    late.m.skipFreeze();
    for (let i = 0; i < 64 * 25; i++) late.m.step(DT);
    late.p.money = 9000;
    expect(late.m.autoBuy(late.p)).toBe(0);
  }, 60_000);
});
