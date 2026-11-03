import { Vector3 } from 'three';
import { Match } from '../sim/mode/Match';
import { ACI_HQ } from '../sim/maps/aciHq';
import type { Agent, AgentCommand } from '../sim/entities/Agent';
import { moveAgent } from '../sim/physics/AgentMovement';
import { purchaseBlocker, type BuyItem } from '../sim/mode/Economy';
import { MOVE } from '../config/movement';
import type { MatchStart } from './protocol';
import { applySnapshot, decode } from './snapshot';
import type { OnlineClient } from './OnlineClient';

/** A display replica: only local movement is predicted. Combat, money and round flow
 * always come from the server; unacknowledged movement is replayed after corrections. */
export class ReplicaDriver {
  private pendingInputs: { seq: number; command: AgentCommand }[] = [];
  private targets = new Map<number, { pos: Vector3; yaw: number; pitch: number }>();
  private lastRound: number;
  constructor(private match: Match, readonly client: OnlineClient, start: MatchStart) {
    applySnapshot(match, start.snapshot);
    this.lastRound = match.round;
  }
  private predict(command: AgentCommand) {
    const a = this.match.player;
    if (!a?.alive || a.operating !== null || this.match.phase === 'matchOver') return;
    if (a.zp?.downed) command = { ...command, prone: true, crouch: true, jump: false, slide: false };
    a.yaw = command.yaw; a.pitch = command.pitch; a.cmd = command;
    moveAgent(this.match, a, command, 1 / MOVE.tickRate);
  }
  receiveSnapshot() {
    const packet = this.client.takeSnapshot();
    if (!packet) return;
    const m = this.match;
    const previous = new Map(m.agents.filter(a => a !== m.player).map(a => [a.id, { pos: a.pos.clone(), yaw: a.yaw, pitch: a.pitch }]));
    applySnapshot(m, packet.snapshot);
    m.invalidateVisibility();
    this.pendingInputs = this.pendingInputs.filter(p => p.seq > packet.ack);
    const roundChanged = m.round !== this.lastRound;
    if (roundChanged || !m.player?.alive) this.pendingInputs = [];
    this.lastRound = m.round;
    for (const p of this.pendingInputs) this.predict(p.command);
    for (const a of m.agents) {
      if (a === m.player) continue;
      this.targets.set(a.id, { pos: a.pos.clone(), yaw: a.yaw, pitch: a.pitch });
      const old = previous.get(a.id);
      if (old && !roundChanged && old.pos.distanceToSquared(a.pos) < 9) { a.pos.copy(old.pos); a.yaw = old.yaw; a.pitch = old.pitch; }
    }
    for (const event of packet.events) m.events.emit(event.type, decode(event.payload));
  }
  step(command: AgentCommand, dt: number) {
    this.match.invalidateVisibility();
    // Never advance AI, combat, economy, objectives or round clocks in the browser.
    const seq = this.client.input(command);
    this.pendingInputs.push({ seq, command });
    if (this.pendingInputs.length > 128) this.pendingInputs.shift();
    if (this.client.connected && performance.now() - this.client.lastSnapshotAt < 1000) this.predict(command);
    for (const a of this.match.agents) {
      const target = this.targets.get(a.id);
      if (!target || a === this.match.player) continue;
      const t = Math.min(1, dt * 20);
      a.pos.lerp(target.pos, t);
      a.yaw += Math.atan2(Math.sin(target.yaw - a.yaw), Math.cos(target.yaw - a.yaw)) * t;
      a.pitch += (target.pitch - a.pitch) * t;
    }
  }
}

export class RemoteMatch extends Match {
  readonly remote = true;
  private replica: ReplicaDriver;
  constructor(readonly client: OnlineClient, start: MatchStart) {
    super({ ...start.config, map: ACI_HQ, localPlayerId: start.playerId });
    this.bots.clear(); this.replica = new ReplicaDriver(this, client, start);
  }
  receiveSnapshot() { this.replica.receiveSnapshot(); }
  override step(dt: number) { this.replica.step(this.playerCmd, dt); }
  override tryBuy(a: Agent, item: BuyItem) {
    if (a !== this.player || !this.canBuyNow(a) || purchaseBlocker(item, a)) return false;
    this.client.send({ type: 'buy', item }); return true;
  }
  override autoBuy(a: Agent) { if (a !== this.player || !this.canBuyNow(a)) return 0; this.client.send({ type: 'autoBuy' }); return 1; }
  override rebuy(a: Agent) { if (a !== this.player || !this.canBuyNow(a)) return 0; this.client.send({ type: 'rebuy' }); return 1; }
  override hurryRoundEnd(_seconds: number) { /* A client cannot skip the shared round timer. */ }
}
