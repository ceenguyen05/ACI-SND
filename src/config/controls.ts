export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'crouch' | 'slide' | 'walk'
  | 'leanLeft' | 'leanRight' | 'reload' | 'use' | 'drop'
  | 'primary' | 'secondary' | 'melee' | 'grenade' | 'bomb' | 'lastWeapon'
  | 'gadget' | 'cams' | 'quickMelee' | 'stimSelf' | 'killstreak' | 'detonate' | 'ping' | 'inspect' | 'light' | 'buy' | 'scoreboard';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump', crouch: 'Crouch / hold to prone', slide: 'Slide (while running)', walk: 'Walk (silent)', leanLeft: 'Lean / tilt left', leanRight: 'Lean / tilt right',
  reload: 'Reload', use: 'Use / Defuse / Pick up', drop: 'Drop weapon', primary: 'Primary weapon',
  secondary: 'Secondary weapon', melee: 'Knife', grenade: 'Cycle grenades', bomb: 'Bomb', lastWeapon: 'Last weapon',
  gadget: 'Cycle gadgets', cams: 'Cameras / drone feeds', quickMelee: 'Quick melee (knife stab)', stimSelf: 'Stim yourself',
  killstreak: 'Use killstreak', detonate: 'Detonate C4', ping: 'Ping enemy / location', inspect: 'Inspect weapon', light: 'Weapon light on / off', buy: 'Buy menu', scoreboard: 'Scoreboard',
};

/** KeyboardEvent.code values. */
export const DEFAULT_BINDINGS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', slide: 'AltLeft', walk: 'ShiftLeft',
  leanLeft: 'KeyQ', leanRight: 'KeyE', reload: 'KeyR', use: 'KeyF', drop: 'KeyG',
  primary: 'Digit1', secondary: 'Digit2', melee: 'Digit3', grenade: 'Digit4', bomb: 'Digit5', lastWeapon: 'KeyX',
  gadget: 'Digit6', cams: 'KeyT', quickMelee: 'KeyV', stimSelf: 'KeyH', killstreak: 'Digit7', detonate: 'KeyZ', ping: 'Mouse1', inspect: 'KeyY', light: 'KeyL', buy: 'KeyB', scoreboard: 'Tab',
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
    AltLeft: 'L-Alt', Tab: 'Tab', CapsLock: 'Caps', Mouse0: 'Mouse 1', Mouse1: 'Mouse 3', Mouse2: 'Mouse 2',
    Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Backquote: '`', Escape: 'Esc',
  };
  return map[code] ?? code;
}
