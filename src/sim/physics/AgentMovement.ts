import { Vector3 } from 'three';
import { approach, clamp } from '../../core/math';
import { MOVE } from '../../config/movement';
import type { Agent, AgentCommand } from '../entities/Agent';
import type { SimContext } from '../SimContext';
import { stepMotor } from './CharacterMotor';

/** Shared authoritative/predicted movement. Prediction emits no combat or game events. */
export function moveAgent(ctx: SimContext, a: Agent, cmd: AgentCommand, dt: number) {
  const target = clamp(cmd.lean, -1, 1) * (1 - a.motor.prone) * (1 - a.motor.slidePose);
  let limit = 1;
  if (target !== 0) {
    const eye = new Vector3(a.pos.x, a.pos.y + a.eyeHeight, a.pos.z);
    const side = new Vector3(Math.cos(a.yaw) * Math.sign(target), 0, -Math.sin(a.yaw) * Math.sign(target));
    const hit = ctx.world.collision.raycast(eye, side, MOVE.leanOffset + 0.3);
    if (hit) limit = clamp((hit.t - 0.3) / MOVE.leanOffset, 0, 1);
  }
  a.lean = approach(a.lean, target * limit, dt * MOVE.leanSpeed);
  if (Math.abs(a.lean) > Math.abs(target * limit) + 0.01) a.lean = target * limit;
  return stepMotor(ctx.world.collision, a.motor, {
    forward: cmd.forward, right: cmd.right, jump: cmd.jump, crouch: cmd.crouch, prone: cmd.prone, slide: cmd.slide, walk: cmd.walk,
    yaw: a.yaw, maxSpeed: a.maxSpeed() * (Math.abs(a.lean) > 0.3 ? 0.85 : 1) * ctx.gadgets.wireSlowAt(a.pos) * (1 - 0.5 * a.stunAt(ctx.time)),
    frozen: ctx.isFrozen() || a.isDefusing || a.isPlanting,
  }, dt);
}
