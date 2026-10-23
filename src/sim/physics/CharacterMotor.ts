import { Vector3 } from 'three';
import { MOVE } from '../../config/movement';
import { approach } from '../../core/math';
import type { Box, CollisionWorld } from './CollisionWorld';

export interface MotorState {
  pos: Vector3;      // feet center
  vel: Vector3;
  onGround: boolean;
  duck: number;      // 0 standing .. 1 fully crouched
  prone: number;     // continuous stance blend; the hull lengthens as the body lowers
  bodyYaw: number;
  slideTime: number;
  slidePose: number;
  slideCooldown: number;
  slideHeld: boolean;
  wantsDuck: boolean;
  jumpHeld: boolean;
  jumpBuffer: number;
  landingImpact: number;
  landTime: number;  // seconds since landing (for accuracy/landing penalty)
  airTime: number;
  /** CS-style jump fatigue 0..1: chained jumps get lower and slower. */
  stamina: number;
  /** Seconds of coyote time left after walking off a ledge. */
  coyote: number;
  /** Height of the last floor stood on (mantle limit). */
  groundY: number;
  /** Climbing onto a ledge (null when not mantling). */
  mantle: MantleState | null;
}

export interface MantleState {
  t: number; dur: number;
  fromX: number; fromY: number; fromZ: number;
  toX: number; toY: number; toZ: number;
  dirX: number; dirZ: number;
  height: number;
}

export interface MoveInput {
  forward: number;  // -1..1
  right: number;    // -1..1
  jump: boolean;
  crouch: boolean;
  prone?: boolean;
  slide?: boolean;
  walk: boolean;
  yaw: number;
  maxSpeed: number; // weapon dependent
  frozen: boolean;  // freeze time / defusing / planting
}

export function createMotorState(x: number, y: number, z: number): MotorState {
  return { pos: new Vector3(x, y, z), vel: new Vector3(), onGround: true, duck: 0, wantsDuck: false, jumpHeld: false, jumpBuffer: 0, landingImpact: 0, landTime: 1, airTime: 0, stamina: 0,
    prone: 0, bodyYaw: 0, slideTime: 0, slidePose: 0, slideCooldown: 0, slideHeld: false,
    coyote: 0, groundY: y, mantle: null };
}

export const heightOf = (duck: number, prone = 0, slide = 0) => {
  const h = MOVE.standHeight + (MOVE.crouchHeight - MOVE.standHeight) * duck;
  return (h + (MOVE.proneHeight - h) * prone) * (1 - slide) + MOVE.slideHeight * slide;
};
export const eyeOf = (duck: number, prone = 0, slide = 0) => {
  const h = MOVE.standEye + (MOVE.crouchEye - MOVE.standEye) * duck;
  return (h + (MOVE.proneEye - h) * prone) * (1 - slide) + MOVE.slideEye * slide;
};

export function motorRadii(prone: number, yaw: number) {
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  return {
    x: MOVE.radius + ((c * MOVE.proneHalfWidth + s * MOVE.proneHalfLength) - MOVE.radius) * prone,
    z: MOVE.radius + ((s * MOVE.proneHalfWidth + c * MOVE.proneHalfLength) - MOVE.radius) * prone,
  };
}

const stanceSpeed = (s: MotorState) => (1 + (MOVE.crouchMult - 1) * s.duck) * (1 - s.prone) + MOVE.proneMult * s.prone;

const tmpBoxes: Box[] = [];
const wish = new Vector3();

/**
 * Source-style ground/air movement with swept AABB collision and stair stepping.
 * Units are meters / seconds. Mirrors CS: friction → accelerate on ground, air-strafe with capped wishspeed.
 */
export function stepMotor(world: CollisionWorld, s: MotorState, input: MoveInput, dt: number): { landed: boolean; impactSpeed: number; mantled: boolean } {
  const r = MOVE.radius;
  s.slideCooldown = Math.max(0, s.slideCooldown - dt);
  s.slideTime = Math.max(0, s.slideTime - dt);
  if (input.frozen || !s.onGround || input.jump || input.prone) s.slideTime = 0;
  if (input.slide && !s.slideHeld && !input.frozen && !input.jump && !input.prone && s.onGround && !s.mantle && s.prone < 0.05 && s.duck < 0.4 &&
    s.slideCooldown === 0 && input.forward > 0.3 && Math.hypot(s.vel.x, s.vel.z) >= MOVE.slideMinSpeed) {
    s.slideTime = MOVE.slideDuration;
    s.slideCooldown = MOVE.slideDuration + MOVE.slideCooldown;
  }
  s.slideHeld = !!input.slide;
  if (input.frozen) { s.vel.x = 0; s.vel.z = 0; }

  // ---- mantle in progress: rise, then pull forward onto the ledge ----------------------
  if (s.mantle) {
    const m = s.mantle;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    const up = Math.min(1, k / 0.62), fwd = Math.max(0, (k - 0.38) / 0.62);
    const eu = 1 - (1 - up) * (1 - up), ef = fwd * fwd * (3 - 2 * fwd);
    s.pos.set(m.fromX + (m.toX - m.fromX) * ef, m.fromY + (m.toY - m.fromY) * eu, m.fromZ + (m.toZ - m.fromZ) * ef);
    s.vel.set(0, 0, 0);
    s.jumpHeld = input.jump;
    s.jumpBuffer = 0;
    if (k >= 1) {
      s.mantle = null;
      s.onGround = true; s.groundY = s.pos.y;
      s.vel.set(m.dirX * 1.8, 0, m.dirZ * 1.8);
      s.airTime = 0; s.landTime = 0.12;
    }
    return { landed: false, impactSpeed: 0, mantled: false };
  }

  // ---- crouch / prone / slide clearance -----------------------------------
  const wantDuck = input.crouch || !!input.prone || s.slideTime > 0;
  s.wantsDuck = wantDuck;
  const wantProne = !!input.prone && (s.onGround || s.prone > 0.5) && s.slideTime === 0;
  const nextDuck = approach(s.duck, wantDuck ? 1 : 0, dt / MOVE.duckTime);
  const nextProne = approach(s.prone, wantProne ? 1 : 0, dt / MOVE.proneTime);
  const nextSlide = approach(s.slidePose, s.slideTime > 0 ? 1 : 0, dt / (s.slideTime > 0 ? 0.09 : 0.2));
  const oldH = heightOf(s.duck, s.prone, s.slidePose), nextH = heightOf(nextDuck, nextProne, nextSlide);
  const shiftFeet = !s.onGround && s.prone === 0 && nextProne === 0 && s.slidePose === 0 ? oldH - nextH : 0;
  // The view can turn freely; the long prone body turns only where its hull fits.
  const turn = Math.atan2(Math.sin(input.yaw - s.bodyYaw), Math.cos(input.yaw - s.bodyYaw));
  const nextYaw = s.prone < 0.05 ? input.yaw : s.bodyYaw + Math.max(-dt * 3.2, Math.min(dt * 3.2, turn));
  const radii = motorRadii(nextProne, nextYaw), py = s.pos.y + shiftFeet;
  if (!world.overlaps(s.pos.x - radii.x, py + 0.01, s.pos.z - radii.z, s.pos.x + radii.x, py + nextH, s.pos.z + radii.z)) {
    s.duck = nextDuck; s.prone = nextProne; s.slidePose = nextSlide; s.bodyYaw = nextYaw; s.pos.y = py;
  } else if (nextDuck > s.duck) {
    s.duck = nextDuck; // blocked prone entry still allows ordinary crouching
  }
  const height = heightOf(s.duck, s.prone, s.slidePose);
  const hull = motorRadii(s.prone, s.bodyYaw);
  const stepHeight = s.prone > 0.1 || s.slideTime > 0 ? 0.12 : MOVE.stepHeight;

  // ---- wish direction ---------------------------------------------------------
  const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
  const rx = Math.cos(input.yaw), rz = -Math.sin(input.yaw);
  wish.set(fx * input.forward + rx * input.right, 0, fz * input.forward + rz * input.right);
  let wishSpeed = 0;
  if (wish.lengthSq() > 1e-6 && !input.frozen) {
    wish.normalize();
    wishSpeed = input.maxSpeed;
    // Blend stance speed over the same interval as the capsule / eye transition.
    wishSpeed *= stanceSpeed(s);
    if (input.walk) wishSpeed = Math.min(wishSpeed, input.maxSpeed * MOVE.walkMult);
  } else wish.set(0, 0, 0);

  // ---- jump / friction / accelerate --------------------------------------------
  let jumped = false;
  s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  if (input.jump && !s.jumpHeld && !input.frozen) s.jumpBuffer = MOVE.jumpBufferTime;
  if (input.frozen || s.prone > 0.05) s.jumpBuffer = 0;
  if (s.onGround) { s.stamina = Math.max(0, s.stamina - dt * 1.6); s.coyote = MOVE.coyoteTime; s.groundY = s.pos.y; }
  else s.coyote = Math.max(0, s.coyote - dt);

  // Mantle: hold jump (or press it again in the air) while moving into a ledge you can't
  // simply hop onto. From the floor this only triggers for ledges too tall to jump onto.
  if (!input.frozen && s.prone < 0.05 && s.slidePose < 0.1 && input.forward > 0.3 && (input.jump || s.jumpBuffer > 0)) {
    const m = tryMantle(world, s, input.yaw);
    if (m && (!s.onGround || m.height > 1.1)) {
      s.mantle = m;
      if (m.height > 0 && world.overlaps(m.toX - r, m.toY + 0.02, m.toZ - r, m.toX + r, m.toY + MOVE.standHeight, m.toZ + r)) s.duck = 1;
      s.onGround = false; s.vel.set(0, 0, 0); s.jumpBuffer = 0; s.coyote = 0;
      s.jumpHeld = input.jump;
      return { landed: false, impactSpeed: 0, mantled: true };
    }
  }

  // coyote time: a jump pressed just after running off an edge still counts
  const canJump = s.onGround || (s.coyote > 0 && s.vel.y <= 0);
  if (canJump) {
    if (s.jumpBuffer > 0 && !input.frozen && s.prone < 0.05) {
      // Chained jumps are lower (CS:GO stamina) – bunny hops can't outrun a crosshair.
      s.vel.y = MOVE.jumpImpulse * (1 - 0.22 * s.stamina);
      const keep = 1 - 0.25 * s.stamina;
      s.vel.x *= keep; s.vel.z *= keep;
      s.stamina = Math.min(1, s.stamina + 0.45);
      s.onGround = false;
      s.jumpBuffer = 0;
      s.coyote = 0;
      jumped = true;
    }
    if (!jumped && s.onGround && s.slideTime > 0) {
      const speed = Math.hypot(s.vel.x, s.vel.z);
      const remaining = Math.max(0, speed - MOVE.slideDeceleration * dt);
      if (speed > 0) { s.vel.x *= remaining / speed; s.vel.z *= remaining / speed; }
      if (remaining < 1.8) s.slideTime = 0;
    } else if (!jumped && s.onGround) {
      // At crawl/stun speeds the normal standing stop-speed floor would erase
      // every tick's acceleration and leave the player almost immobile.
      const stopSpeed = wishSpeed > 0 && wishSpeed < MOVE.stopSpeed ? wishSpeed * (MOVE.stopSpeed / MOVE.knifeSpeed) : MOVE.stopSpeed;
      applyFriction(s.vel, dt, stopSpeed);
      const counterStrafe = s.vel.x * wish.x + s.vel.z * wish.z < -0.1;
      accelerate(s.vel, wish, wishSpeed, MOVE.accelerate * (counterStrafe ? MOVE.counterStrafeAccel : 1), dt);
    }
  }
  if (!s.onGround && !jumped) {
    const capped = Math.min(wishSpeed, MOVE.airWishCap);
    const cur = s.vel.x * wish.x + s.vel.z * wish.z;
    const add = capped - cur;
    if (add > 0 && wishSpeed > 0) {
      const acc = Math.min(MOVE.airAccelerate * wishSpeed * dt, add);
      s.vel.x += acc * wish.x; s.vel.z += acc * wish.z;
    }
  }
  s.jumpHeld = input.jump;
  if (!s.onGround) s.vel.y -= MOVE.gravity * dt;

  // Hard speed cap on ground (prevents exceeding weapon max speed when weapon switches).
  if (s.onGround && s.slideTime === 0) {
    const hs = Math.hypot(s.vel.x, s.vel.z);
    const cap = input.maxSpeed * stanceSpeed(s);
    if (hs > cap && hs > 0) { const k = cap / hs; s.vel.x *= k; s.vel.z *= k; }
  }

  // ---- collide & move -----------------------------------------------------------------
  const wasOnGround = s.onGround;
  const fallSpeed = -s.vel.y;
  moveAxis(world, s, 0, s.vel.x * dt, height, wasOnGround, stepHeight);
  moveAxis(world, s, 2, s.vel.z * dt, height, wasOnGround, stepHeight);
  if (Math.hypot(s.vel.x, s.vel.z) < 1.8) s.slideTime = 0;

  // vertical
  let landed = false;
  s.pos.y += s.vel.y * dt;
  const hits = world.query(s.pos.x - hull.x, s.pos.y, s.pos.z - hull.z, s.pos.x + hull.x, s.pos.y + height, s.pos.z + hull.z, tmpBoxes);
  s.onGround = false;
  for (const b of hits) {
    if (s.vel.y <= 0) {
      if (b.maxY - s.pos.y < 0.8) { s.pos.y = b.maxY; s.vel.y = 0; s.onGround = true; }
    } else if (b.minY > s.pos.y + 0.2) {
      s.pos.y = b.minY - height - 0.001; s.vel.y = 0;
    }
  }
  if (!s.onGround && s.vel.y <= 0) {
    // ground probe (also snaps down steps when walking off small ledges)
    const probe = wasOnGround && !jumped ? stepHeight : 0.03;
    const below = world.query(s.pos.x - hull.x, s.pos.y - probe, s.pos.z - hull.z, s.pos.x + hull.x, s.pos.y + 0.01, s.pos.z + hull.z, tmpBoxes);
    let top = -Infinity;
    for (const b of below) if (b.maxY <= s.pos.y + 0.011 && b.maxY > top) top = b.maxY;
    if (top > -Infinity) { s.pos.y = top; s.vel.y = 0; s.onGround = true; }
  }
  if (s.onGround && !wasOnGround) {
    landed = true; s.landTime = 0; s.landingImpact = Math.max(0, fallSpeed);
    // Land with weight, but keep enough momentum for deliberate air strafes.
    const retention = 1 - Math.min(0.18, Math.max(0, fallSpeed - 3) * 0.02);
    s.vel.x *= retention; s.vel.z *= retention;
  }
  if (s.onGround) { s.airTime = 0; s.landTime += dt; } else s.airTime += dt;
  if (s.pos.y < -5) { s.pos.y = 0.1; s.vel.set(0, 0, 0); }
  return { landed, impactSpeed: landed ? fallSpeed : 0, mantled: false };
}

const tmpLedge: Box[] = [];
/**
 * Is there a ledge right in front (along `yaw`) that we can climb onto? Returns the climb, or null.
 * The ledge must be within reach, at most `mantleMax` above the last floor, have room for a
 * crouched body on top, and have open space above our head for the climb.
 */
export function tryMantle(world: CollisionWorld, s: MotorState, yaw: number): MantleState | null {
  const r = MOVE.radius;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const reach = s.onGround ? MOVE.mantleMax : 1.4;
  // something solid just in front of the body, between the knees and the reach height
  const px = s.pos.x + fx * (r + 0.2), pz = s.pos.z + fz * (r + 0.2);
  const hits = world.query(px - 0.06, s.pos.y + MOVE.stepHeight * 0.5, pz - 0.06, px + 0.06, s.pos.y + reach, pz + 0.06, tmpLedge);
  if (!hits.length) return null;
  let top = -Infinity;
  for (const b of hits) top = Math.max(top, b.maxY);
  const rise = top - s.pos.y;
  if (rise <= MOVE.stepHeight || rise > reach || top - s.groundY > MOVE.mantleMax + 0.01) return null;
  if (!s.onGround) {
    // still rising high enough to land on it (incl. a crouch-jump tuck)? then let the jump do it
    const apex = s.pos.y + Math.max(0, s.vel.y) ** 2 / (2 * MOVE.gravity) + (s.wantsDuck ? (1 - s.duck) * (MOVE.standHeight - MOVE.crouchHeight) : 0);
    if (apex > top + 0.05) return null;
  }
  // nothing stacked on the ledge above that point (walls / shelves are not ledges)
  if (world.overlaps(px - 0.05, top + 0.02, pz - 0.05, px + 0.05, top + MOVE.crouchHeight, pz + 0.05)) return null;
  // landing spot: fully on top, room for a crouched body, and supported underneath
  const tx = s.pos.x + fx * (r + 0.55), tz = s.pos.z + fz * (r + 0.55);
  if (world.overlaps(tx - r, top + 0.02, tz - r, tx + r, top + MOVE.crouchHeight, tz + r)) return null;
  const under = world.query(tx - 0.05, top - 0.06, tz - 0.05, tx + 0.05, top - 0.01, tz + 0.05, tmpLedge);
  if (!under.some((b) => b.maxY >= top - 0.02)) return null;
  // head room for the climb in our own column
  const h = heightOf(s.duck);
  if (world.overlaps(s.pos.x - r + 0.03, s.pos.y + h, s.pos.z - r + 0.03, s.pos.x + r - 0.03, top + MOVE.crouchHeight, s.pos.z + r - 0.03)) return null;
  return {
    t: 0, dur: 0.26 + Math.max(0, rise) * 0.17,
    fromX: s.pos.x, fromY: s.pos.y, fromZ: s.pos.z, toX: tx, toY: top + 0.001, toZ: tz,
    dirX: fx, dirZ: fz, height: rise,
  };
}

function applyFriction(vel: Vector3, dt: number, stopSpeed: number) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.001) { vel.x = 0; vel.z = 0; return; }
  const control = Math.max(speed, stopSpeed);
  const drop = control * MOVE.friction * dt;
  const ns = Math.max(speed - drop, 0) / speed;
  vel.x *= ns; vel.z *= ns;
}

function accelerate(vel: Vector3, wishDir: Vector3, wishSpeed: number, accel: number, dt: number) {
  if (wishSpeed <= 0) return;
  const cur = vel.x * wishDir.x + vel.z * wishDir.z;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  const acc = Math.min(accel * dt * wishSpeed, add);
  vel.x += acc * wishDir.x; vel.z += acc * wishDir.z;
}

/** Move along X (axis 0) or Z (axis 2) with collision and step-up. */
function moveAxis(world: CollisionWorld, s: MotorState, axis: 0 | 2, delta: number, height: number, canStep: boolean, stepHeight = MOVE.stepHeight as number) {
  if (delta === 0) return;
  const radii = motorRadii(s.prone, s.bodyYaw), rx = radii.x, rz = radii.z;
  const r = axis === 0 ? rx : rz;
  const p = s.pos;
  if (axis === 0) p.x += delta; else p.z += delta;
  for (let iter = 0; iter < 4; iter++) {
    const hits = world.query(p.x - rx, p.y, p.z - rz, p.x + rx, p.y + height, p.z + rz, tmpBoxes);
    if (hits.length === 0) return;
    let resolved = false;
    for (const b of hits) {
      const stepUp = b.maxY - p.y;
      if (canStep && stepUp > 0 && stepUp <= stepHeight) {
        if (!world.overlaps(p.x - rx, b.maxY + 0.001, p.z - rz, p.x + rx, b.maxY + height, p.z + rz)) {
          p.y = b.maxY + 0.001;
          resolved = true;
          break;
        }
      }
      if (axis === 0) {
        p.x = delta > 0 ? b.minX - r - 0.001 : b.maxX + r + 0.001;
        s.vel.x = 0;
      } else {
        p.z = delta > 0 ? b.minZ - r - 0.001 : b.maxZ + r + 0.001;
        s.vel.z = 0;
      }
      resolved = true;
      break;
    }
    if (!resolved) return;
  }
}
