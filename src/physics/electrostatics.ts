/**
 * Pure electrostatics: Coulomb's law with superposition and RK4 field-line
 * tracing. No Three.js, no ECS — so the same numbers can be checked against
 * the Python notebook.
 *
 * Units: positions in metres, charges in nC, E in N/C (= V/m).
 * Charges are packed as [x, y, z, q] per charge in a Float64Array.
 */

/** k · 1e-9: E[N/C] = K_NC · q[nC] / r²[m²]. 1 nC at 1 m → 8.99 N/C. */
export const K_NC = 8.99;

/** Stride of one charge in the packed charge array. */
export const CHARGE_STRIDE = 4;

/** Minimum distance used in 1/r² to avoid the singularity at a charge. */
const SOFTENING_SQ = 1e-8;

/** Writes E(x, y, z) into out[0..2] and returns |E|. */
export function fieldAt(
  x: number,
  y: number,
  z: number,
  charges: Float64Array,
  count: number,
  out: Float64Array,
): number {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (let i = 0; i < count; i++) {
    const o = i * CHARGE_STRIDE;
    const dx = x - charges[o];
    const dy = y - charges[o + 1];
    const dz = z - charges[o + 2];
    const r2 = dx * dx + dy * dy + dz * dz + SOFTENING_SQ;
    const s = (K_NC * charges[o + 3]) / (r2 * Math.sqrt(r2));
    ex += s * dx;
    ey += s * dy;
    ez += s * dz;
  }
  out[0] = ex;
  out[1] = ey;
  out[2] = ez;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

/** Electric potential V(x, y, z) in volts. */
export function potentialAt(
  x: number,
  y: number,
  z: number,
  charges: Float64Array,
  count: number,
): number {
  let v = 0;
  for (let i = 0; i < count; i++) {
    const o = i * CHARGE_STRIDE;
    const dx = x - charges[o];
    const dy = y - charges[o + 1];
    const dz = z - charges[o + 2];
    v += (K_NC * charges[o + 3]) / Math.sqrt(dx * dx + dy * dy + dz * dz + SOFTENING_SQ);
  }
  return v;
}

/**
 * Point i of n quasi-uniformly spread over the unit sphere (Fibonacci
 * lattice). Writes the unit vector into out[0..2].
 */
export function fibonacciSpherePoint(i: number, n: number, out: Float64Array): void {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * golden;
  out[0] = Math.cos(phi) * r;
  out[1] = y;
  out[2] = Math.sin(phi) * r;
}

export const enum Termination {
  /** Reached the capture radius of an opposite-sign charge. */
  Captured = 1,
  /** Left the bounding sphere. */
  Escaped = 2,
  /** |E| fell below the threshold (near a null point). */
  NullField = 3,
  /** Ran out of steps or output space. */
  MaxSteps = 4,
}

export interface TraceParams {
  /** Largest arc-length step (m). */
  maxStep: number;
  /** Smallest arc-length step (m). */
  minStep: number;
  /** Step is limited to this fraction of the distance to the nearest charge. */
  stepFraction: number;
  /** A line ends when it gets this close to an opposite-sign charge (m). */
  captureRadius: number;
  /** A line ends beyond this distance from `center` (m). */
  maxRadius: number;
  centerX: number;
  centerY: number;
  centerZ: number;
  /** A line ends where |E| is below this (N/C). */
  minField: number;
  /** Hard limit on integration steps per line. */
  maxSteps: number;
}

/** Filled by traceFieldLine; reused to avoid allocation. */
export interface TraceResult {
  points: number;
  termination: Termination;
  /** Index of the capturing charge, or -1. */
  capturedBy: number;
}

/**
 * Integrates dr/ds = sign · E/|E| with classic RK4 from (sx, sy, sz).
 * sign = +1 follows the field (from + charges), -1 traces it backwards
 * (from − charges). Writes points as xyz into outPts and |E| at each point
 * into outMag, at most maxPoints points.
 */
export function traceFieldLine(
  sx: number,
  sy: number,
  sz: number,
  sign: 1 | -1,
  charges: Float64Array,
  count: number,
  p: TraceParams,
  outPts: Float32Array,
  outMag: Float32Array,
  maxPoints: number,
  scratch: Float64Array,
  result: TraceResult,
): void {
  let x = sx;
  let y = sy;
  let z = sz;
  let n = 0;
  result.capturedBy = -1;
  result.termination = Termination.MaxSteps;

  let mag = fieldAt(x, y, z, charges, count, scratch);
  outPts[0] = x;
  outPts[1] = y;
  outPts[2] = z;
  outMag[0] = mag;
  n = 1;

  const maxR2 = p.maxRadius * p.maxRadius;
  const capR2 = p.captureRadius * p.captureRadius;
  const limit = Math.min(p.maxSteps, maxPoints - 2);

  for (let step = 0; step < limit; step++) {
    // Nearest-charge distance drives the adaptive step and the capture test.
    let dMin2 = Infinity;
    for (let i = 0; i < count; i++) {
      const o = i * CHARGE_STRIDE;
      const dx = x - charges[o];
      const dy = y - charges[o + 1];
      const dz = z - charges[o + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < dMin2) dMin2 = d2;
    }
    const h = Math.min(p.maxStep, Math.max(p.minStep, p.stepFraction * Math.sqrt(dMin2)));

    // RK4 on the unit direction field f(r) = sign · E/|E|.
    let m = fieldAt(x, y, z, charges, count, scratch);
    if (m < p.minField) {
      result.termination = Termination.NullField;
      break;
    }
    const k1x = (sign * scratch[0]) / m;
    const k1y = (sign * scratch[1]) / m;
    const k1z = (sign * scratch[2]) / m;

    m = fieldAt(x + 0.5 * h * k1x, y + 0.5 * h * k1y, z + 0.5 * h * k1z, charges, count, scratch);
    if (m < p.minField) {
      result.termination = Termination.NullField;
      break;
    }
    const k2x = (sign * scratch[0]) / m;
    const k2y = (sign * scratch[1]) / m;
    const k2z = (sign * scratch[2]) / m;

    m = fieldAt(x + 0.5 * h * k2x, y + 0.5 * h * k2y, z + 0.5 * h * k2z, charges, count, scratch);
    if (m < p.minField) {
      result.termination = Termination.NullField;
      break;
    }
    const k3x = (sign * scratch[0]) / m;
    const k3y = (sign * scratch[1]) / m;
    const k3z = (sign * scratch[2]) / m;

    m = fieldAt(x + h * k3x, y + h * k3y, z + h * k3z, charges, count, scratch);
    if (m < p.minField) {
      result.termination = Termination.NullField;
      break;
    }
    const k4x = (sign * scratch[0]) / m;
    const k4y = (sign * scratch[1]) / m;
    const k4z = (sign * scratch[2]) / m;

    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    z += (h / 6) * (k1z + 2 * k2z + 2 * k3z + k4z);

    mag = fieldAt(x, y, z, charges, count, scratch);
    const o3 = n * 3;
    outPts[o3] = x;
    outPts[o3 + 1] = y;
    outPts[o3 + 2] = z;
    outMag[n] = mag;
    n++;

    // Capture by a charge of the sign the line is heading to.
    let captured = -1;
    for (let i = 0; i < count; i++) {
      const o = i * CHARGE_STRIDE;
      const q = charges[o + 3];
      if (q * sign >= 0) continue;
      const dx = x - charges[o];
      const dy = y - charges[o + 1];
      const dz = z - charges[o + 2];
      if (dx * dx + dy * dy + dz * dz < capR2) {
        captured = i;
        break;
      }
    }
    if (captured >= 0) {
      const o = captured * CHARGE_STRIDE;
      const e3 = n * 3;
      outPts[e3] = charges[o];
      outPts[e3 + 1] = charges[o + 1];
      outPts[e3 + 2] = charges[o + 2];
      outMag[n] = mag;
      n++;
      result.capturedBy = captured;
      result.termination = Termination.Captured;
      break;
    }

    const cx = x - p.centerX;
    const cy = y - p.centerY;
    const cz = z - p.centerZ;
    if (cx * cx + cy * cy + cz * cz > maxR2) {
      result.termination = Termination.Escaped;
      break;
    }
  }
  result.points = n;
}
