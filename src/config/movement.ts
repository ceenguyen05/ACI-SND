/** Source-engine units → meters. CS player is 72u tall ≈ 1.83 m. */
export const U = 0.0254;

export const MOVE = {
  tickRate: 64,
  knifeSpeed: 250 * U,       // 6.35 m/s – fastest run speed
  accelerate: 5.5,
  airAccelerate: 12,
  friction: 5.2,
  stopSpeed: 80 * U,
  gravity: 800 * U,
  jumpImpulse: 301.99 * U,
  airWishCap: 30 * U,
  walkMult: 0.52,
  crouchMult: 0.34,
  proneMult: 0.18,
  proneHeight: 0.58,
  proneEye: 0.43,
  proneHoldTime: 0.55,
  proneTime: 0.38,
  proneHalfWidth: 0.27,
  proneHalfLength: 0.93,
  proneEyeForward: 0.59,
  slideHeight: 1.12,
  slideEye: 0.92,
  slideMinSpeed: 3.6,
  slideDuration: 0.62,
  slideCooldown: 1.35,
  slideDeceleration: 6.2,
  radius: 0.4,
  standHeight: 1.83,
  crouchHeight: 1.37,
  standEye: 1.63,
  crouchEye: 1.17,
  stepHeight: 0.46,
  duckTime: 0.2,
  jumpBufferTime: 0.09,      // forgive a press just before landing; holding never auto-jumps
  counterStrafeAccel: 1.15,  // deliberate opposite input brakes faster than releasing a key
  landingRecovery: 0.22,
  /** Footsteps are audible above this fraction of the weapon's max speed (walking is silent). */
  footstepSpeedFrac: 0.56,
  leanOffset: 0.5,
  leanRollDeg: 13,
  leanSpeed: 7,
  /** Jump is still allowed this long after walking off a ledge ("coyote time"). */
  coyoteTime: 0.1,
  /** Highest ledge (above the floor you jumped from) you can mantle onto. */
  mantleMax: 1.75,
} as const;
