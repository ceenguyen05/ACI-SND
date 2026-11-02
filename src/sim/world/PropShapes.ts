/**
 * Props whose collision is several boxes rather than their footprint. The layouts are shared by
 * collision (World) and visuals (Props) so the partitions, entrances and panels you see are exactly
 * the ones you collide with.
 *
 * Local frame as in Props.ts: front faces -Z, origin at the footprint centre, y = 0 at the base.
 */

/** Axis-aligned box in a prop's local frame: centre x / z, size, base height `y` (default 0). */
export interface LocalBox { x: number; z: number; w: number; d: number; h: number; y?: number }

export interface Workstation {
  /** Desk footprint, against a back panel. */
  desk: LocalBox;
  /** Direction along local Z from the seat to the desk. */
  toDesk: 1 | -1;
  /** Seat centre, pulled up to the desk. */
  seatX: number;
  seatZ: number;
  /** Centre of the entrance gap; `alongZ` = the gap runs along local Z (an east / west panel). */
  door: { x: number; z: number; alongZ: boolean };
}

export interface CubicleLayout { panels: LocalBox[]; stations: Workstation[] }

export const CUBE = { panel: 0.06, door: 1.0, deskDepth: 0.75, deskHeight: 0.76 } as const;

/**
 * Pods 4 m or more in both directions are four-packs: a cross-shaped spine, desks on the
 * north / south panels and an entrance per desk in the east / west panels beside the spine.
 * Shallower pods are a row of one or two workstations with desks on the back (+Z) panel and
 * entrances in the front (-Z) panel.
 */
export function cubicleLayout(W: number, D: number, H: number): CubicleLayout {
  const t = CUBE.panel, door = CUBE.door, dd = CUBE.deskDepth, dh = CUBE.deskHeight;
  const hw = W / 2, hd = D / 2, spineH = H * 0.95;
  const panels: LocalBox[] = [];
  const stations: Workstation[] = [];
  const panel = (x0: number, z0: number, x1: number, z1: number, h = H) => {
    if (x1 - x0 > 0.01 && z1 - z0 > 0.01) panels.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, h });
  };

  if (W >= 4 && D >= 4) {
    panel(-hw, -hd, hw, -hd + t);
    panel(-hw, hd - t, hw, hd);
    for (const x0 of [-hw, hw - t]) {
      panel(x0, -hd + t, x0 + t, -t / 2 - door);
      panel(x0, t / 2 + door, x0 + t, hd - t);
    }
    panel(-t / 2, -hd + t, t / 2, -t / 2, spineH);
    panel(-t / 2, t / 2, t / 2, hd - t, spineH);
    panel(-hw, -t / 2, hw, t / 2, spineH);
    const qw = hw - 1.5 * t;
    for (const sx of [-1, 1] as const) for (const sz of [-1, 1] as const) {
      const cx = sx * (t / 2 + qw / 2);
      stations.push({
        desk: { x: cx, z: sz * (hd - t - dd / 2), w: qw - 0.04, d: dd, h: dh },
        toDesk: sz, seatX: cx, seatZ: sz * (hd - t - dd - 0.32),
        door: { x: sx * (hw - t / 2), z: sz * (t / 2 + door / 2), alongZ: true },
      });
    }
    return { panels, stations };
  }

  const n = W >= 4 ? 2 : 1;
  panel(-hw, hd - t, hw, hd);
  panel(-hw, -hd + t, -hw + t, hd - t);
  panel(hw - t, -hd + t, hw, hd - t);
  if (n === 2) {
    panel(-t / 2, -hd, t / 2, hd - t, spineH);
    panel(-hw, -hd, -t / 2 - door, -hd + t);
    panel(t / 2 + door, -hd, hw, -hd + t);
  } else {
    panel(-hw, -hd, -door / 2, -hd + t);
    panel(door / 2, -hd, hw, -hd + t);
  }
  const qw = (W - (n + 1) * t) / n;
  for (let i = 0; i < n; i++) {
    const cx = -hw + t + qw / 2 + i * (qw + t);
    stations.push({
      desk: { x: cx, z: hd - t - dd / 2, w: qw - 0.04, d: dd, h: dh },
      toDesk: 1, seatX: cx, seatZ: hd - t - dd - 0.32,
      door: { x: n === 2 ? (i === 0 ? -1 : 1) * (t / 2 + door / 2) : 0, z: -hd + t / 2, alongZ: false },
    });
  }
  return { panels, stations };
}

/**
 * Radar speed trailer: wheeled bed with the display panel on a short mast. The tow bar
 * (the rear metre) is low enough to step over, so it has no collider.
 */
export const SPEED_TRAILER = {
  bed: { x: 0, z: -0.45, w: 1.6, d: 2.1, h: 1.0 },
  sign: { x: 0, z: -0.42, w: 1.6, d: 0.3, h: 1.75, y: 1.0 },
} as const satisfies Record<string, LocalBox>;

/** Local collision boxes for compound props (W / D already swapped for the facing), or null for a plain footprint. */
export function compoundShape(kind: string, W: number, D: number, H: number): LocalBox[] | null {
  if (kind === 'cubicle') {
    const { panels, stations } = cubicleLayout(W, D, H);
    return [...panels, ...stations.map((s) => s.desk)];
  }
  if (kind === 'speedTrailer') return [SPEED_TRAILER.bed, SPEED_TRAILER.sign];
  return null;
}
