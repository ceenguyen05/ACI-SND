import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../../server/AccountStore';
import { LobbyService } from '../../server/LobbyService';
import { awardAction, completeMatch, levelAt, matchmakingWindow, newCareer, rankLabel, restoreCareer, updateRank, XP } from '../../src/progression/career';
import type { ServerMessage } from '../../src/net/protocol';

const DAY = 86_400_000;
describe('career XP, daily challenges and streaks', () => {
  it('levels smoothly at exact thresholds without losing lifetime XP', () => {
    expect(levelAt(0)).toMatchObject({ level: 1, current: 0, needed: 2000 });
    expect(levelAt(1999).level).toBe(1); expect(levelAt(2000)).toMatchObject({ level: 2, current: 0 });
    expect(levelAt(6000)).toMatchObject({ level: 3, current: 0 }); expect(levelAt(20_000).level).toBe(5);
    for (let level = 1; level < 100; level++) expect(levelAt(1000 * (level - 1) * level).level).toBe(level);
  });
  it('rewards objectives more than kills and claims each daily challenge/all-three bonus once', () => {
    const c = newCareer();
    for (let i = 0; i < 11; i++) awardAction(c, 'kill', DAY);
    awardAction(c, 'plant', DAY); awardAction(c, 'defuse', DAY);
    completeMatch(c, { id: 'a', won: true, qualified: true }, DAY);
    completeMatch(c, { id: 'b', won: false, qualified: true }, DAY);
    expect(c.daily.claimed.sort()).toEqual(['all', 'kills', 'matches', 'objectives']);
    const before = c.xp; awardAction(c, 'kill', DAY);
    expect(c.xp - before).toBe(XP.kill);
    expect(XP.plant).toBeGreaterThan(XP.kill); expect(XP.defuse).toBeGreaterThan(XP.plant);
  });
  it('deduplicates match completion, excludes abandoned/short matches and advances a streak only once per completed day', () => {
    const c = newCareer();
    completeMatch(c, { id: 'short', won: true, qualified: false }, 5 * DAY);
    expect(c.matches).toBe(0); expect(c.lastDay).toBeNull();
    completeMatch(c, { id: 'a', won: true, qualified: true }, 5 * DAY);
    const xp = c.xp;
    expect(completeMatch(c, { id: 'a', won: true, qualified: true }, 5 * DAY)).toEqual([]); expect(c.xp).toBe(xp);
    completeMatch(c, { id: 'b', won: false, qualified: true }, 5 * DAY); expect(c.streak).toBe(1);
    completeMatch(c, { id: 'c', won: true, qualified: true }, 6 * DAY); expect(c.streak).toBe(2);
    completeMatch(c, { id: 'd', won: false, qualified: true }, 8 * DAY); expect(c.streak).toBe(1); expect(c.bestStreak).toBe(2);
  });
  it('resets on UTC date boundaries, prevents clock rollback reopening rewards and keeps offline/online careers separate', () => {
    const c = newCareer(), online = newCareer();
    for (let i = 0; i < 10; i++) awardAction(c, 'kill', 3 * DAY - 1);
    expect(c.daily.claimed).toContain('kills');
    awardAction(c, 'kill', 3 * DAY); expect(c.daily.kills).toBe(1);
    completeMatch(c, { id: 'a', qualified: true, won: true }, 3 * DAY);
    completeMatch(c, { id: 'b', qualified: true, won: true }, DAY);
    expect(c.lastDay).toBe(3); expect(c.streak).toBe(1); expect(c.daily.day).toBe(3);
    expect(online.xp).toBe(0); expect(online.rank.games).toBe(0);
  });
  it('migrates missing/malformed saved progress safely', () => {
    expect(restoreCareer(undefined)).toEqual(newCareer());
    const c = restoreCareer({ xp: Infinity, matches: -100, recentMatches: [null, 1, 'valid'], daily: { day: 4, kills: NaN }, rank: { mmr: 99999, points: -10 } });
    expect(c.xp).toBe(0); expect(c.matches).toBe(0); expect(c.rank.mmr).toBe(3000); expect(c.rank.points).toBe(0);
    expect(c.recentMatches).toEqual(['valid']);
  });
});
describe('skill and competitive ranks', () => {
  const win = { score: 1 as const, ownMmr: 1200, opponentMmr: 1200, margin: .4 };
  it('requires five placements and never changes rank from XP alone', () => {
    const c = newCareer(); for (let i = 0; i < 100; i++) awardAction(c, 'plant', DAY);
    expect(rankLabel(c.rank)).toContain('Unranked'); expect(c.rank.games).toBe(0);
    for (let i = 0; i < 4; i++) { updateRank(c.rank, win); expect(rankLabel(c.rank)).toContain('Unranked'); }
    updateRank(c.rank, win); expect(rankLabel(c.rank)).not.toContain('Unranked'); expect(c.rank.placements).toBe(5);
  });
  it('rewards an upset more than beating weaker opponents, reduces uncertainty, and keeps losses negative', () => {
    const low = newCareer().rank, high = newCareer().rank;
    updateRank(low, { ...win, opponentMmr: 1600 }); updateRank(high, { ...win, opponentMmr: 800 });
    expect(low.mmr).toBeGreaterThan(high.mmr); expect(low.uncertainty).toBeLessThan(350);
    low.placements = 5; low.points = 750;
    expect(updateRank(low, { ...win, score: 0 })).toBeLessThan(0);
  });
  it('uses 100-RP divisions, promotion buffers and a limited tier shield without shielding an abandon', () => {
    const r = newCareer().rank; Object.assign(r, { placements: 5, points: 595, peak: 595 });
    expect(updateRank(r, win)).toBeGreaterThan(0); expect(r.points).toBeGreaterThanOrEqual(610); expect(r.shields).toBe(1);
    r.points = 600;
    updateRank(r, { ...win, score: 0 }); expect(r.points).toBe(600); expect(r.shields).toBe(0);
    updateRank(r, { ...win, score: 0 }); expect(r.points).toBe(570);
    r.points = 600; r.shields = 1;
    updateRank(r, { ...win, score: 1, abandon: true }); expect(r.points).toBe(570); expect(r.abandons).toBe(1);
    r.points = 2399; r.peak = 2399; r.shields = 0;
    updateRank(r, win); expect(r.points).toBe(2400); expect(r.shields).toBe(0);
  });
  it('widens matchmaking within a hard maximum rather than equating XP level with skill', () => {
    expect(matchmakingWindow(0)).toBe(150); expect(matchmakingWindow(90_000)).toBe(300); expect(matchmakingWindow(1e9)).toBe(450);
  });
});
describe('persistent, server-owned online career', () => {
  it('stores hashed credentials and restores progress after a server restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aci-career-')), file = join(dir, 'accounts.json');
    try {
      const a = new AccountStore(file), login = a.authenticate();
      awardAction(login.account.career, 'plant', DAY); a.changed(); a.flush();
      expect(readFileSync(file, 'utf8')).not.toContain(login.token!);
      const b = new AccountStore(file), resumed = b.authenticate(login.token);
      expect(resumed.account.id).toBe(login.account.id); expect(resumed.account.career.xp).toBe(XP.plant); expect(resumed.token).toBeUndefined();
    } finally { unlinkSync(file); rmdirSync(dir); }
  });
  it('never writes anonymous connections without progress and bounds them in memory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aci-career-')), file = join(dir, 'accounts.json');
    try {
      const store = new AccountStore(file), service = new LobbyService(Date.now, 16, store);
      for (let i = 0; i < 3; i++) service.disconnect(service.connect({ send: () => {} }));
      store.changed(); store.flush();
      expect(JSON.parse(readFileSync(file, 'utf8')).accounts).toHaveLength(0);
      const earner = store.authenticate();
      awardAction(earner.account.career, 'kill', DAY); store.changed(); store.flush();
      expect(JSON.parse(readFileSync(file, 'utf8')).accounts).toHaveLength(1);
      for (let i = 0; i < 5100; i++) store.release(store.authenticate().account);
      expect((store as unknown as { accounts: Map<string, unknown> }).accounts.size).toBeLessThanOrEqual(5004);
      expect(store.authenticate(earner.token).account.id).toBe(earner.account.id);
    } finally { unlinkSync(file); rmdirSync(dir); }
  });
  it('prevents concurrent sessions on the same identity and ignores client-claimed XP/MMR', () => {
    const service = new LobbyService(), messages: ServerMessage[] = [];
    const id = service.connect({ send: m => messages.push(m) });
    const welcome = messages[0]; if (welcome.type !== 'welcome') throw new Error();
    expect(() => service.connect({ send: () => {} }, welcome.token)).toThrow(/already connected/);
    service.receive(id, { type: 'career', xp: 999999, rank: { mmr: 3000 } });
    expect(service.clients.get(id)!.account.career.xp).toBe(0);
    expect(service.clients.get(id)!.account.career.rank.mmr).toBe(1200);
    service.disconnect(id);
    const resumed: ServerMessage[] = []; service.connect({ send: m => resumed.push(m) }, welcome.token);
    expect(resumed[0]).toMatchObject({ accountId: welcome.accountId });
  });
});
