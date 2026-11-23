import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  createSystem,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { PointCharge } from './charge-component.js';
import {
  CHARGE_STRIDE,
  fibonacciSpherePoint,
  Termination,
  traceFieldLine,
  type TraceParams,
  type TraceResult,
} from './physics/electrostatics.js';

const MAX_CHARGES = 16;
/** Field lines seeded per nC of charge (N ∝ q, so line density ∝ flux). */
const LINES_PER_NC = 10;
const MAX_LINES = 240;
const MAX_POINTS_PER_LINE = 500;
const MAX_SEGMENTS = MAX_LINES * MAX_POINTS_PER_LINE;
const MAX_ARROWS = 2400;
/** Arc length between direction arrows along a line (m). */
const ARROW_SPACING = 0.12;
/** Seeds start on a small sphere around each charge (m). */
const SEED_RADIUS = 0.045;
/** Recompute when any charge moves more than this (m). */
const MOVE_EPSILON = 1e-4;
/**
 * Arrows closer than this to the viewer's head are hidden, and they grow back
 * to full size by ARROW_FADE_FAR (m). Without it, an arrow a few cm from the
 * eyes fills the view.
 */
const ARROW_FADE_NEAR = 0.3;
const ARROW_FADE_FAR = 0.6;
/** Re-scale arrows when the head moves more than this (m). */
const HEAD_EPSILON = 0.01;

/**
 * Traces 3D electric field lines (RK4 on dr/ds = E/|E|) from every
 * PointCharge and rebuilds them whenever a charge moves or changes value.
 *
 * Lines start on a Fibonacci sphere around each positive charge and end at a
 * negative charge, beyond maxRadius, or where |E|≈0. Negative charges also
 * seed lines traced backwards; those are kept only when they do not end on a
 * positive charge (that flux is already drawn), so lines arriving from
 * infinity are shown when the net charge is negative.
 */
export class FieldLineSystem extends createSystem({
  charges: { required: [PointCharge] },
}) {
  private charges = new Float64Array(MAX_CHARGES * CHARGE_STRIDE);
  private lastCharges = new Float64Array(MAX_CHARGES * CHARGE_STRIDE);
  private chargeCount = 0;
  private lastCount = -1;

  private linePts = new Float32Array(MAX_POINTS_PER_LINE * 3);
  private lineMag = new Float32Array(MAX_POINTS_PER_LINE);
  private scratch = new Float64Array(3);
  private seedDir = new Float64Array(3);
  private trace: TraceResult = { points: 0, termination: Termination.MaxSteps, capturedBy: -1 };
  private params: TraceParams = {
    maxStep: 0.02,
    minStep: 0.002,
    stepFraction: 0.25,
    captureRadius: 0.03,
    maxRadius: 2.5,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    minField: 0.02,
    maxSteps: MAX_POINTS_PER_LINE,
  };

  private positions!: Float32Array;
  private positionAttr!: BufferAttribute;
  private lineGeometry!: BufferGeometry;
  private arrows!: InstancedMesh;
  private segmentCount = 0;
  private arrowCount = 0;
  /** Unscaled pose of each arrow, so it can be re-scaled by head distance. */
  private arrowPos = new Float32Array(MAX_ARROWS * 3);
  private arrowQuat = new Float32Array(MAX_ARROWS * 4);
  private headPos = new Vector3();
  private lastHeadPos = new Vector3(Infinity, Infinity, Infinity);

  private tmpPos = new Vector3();
  private tmpDir = new Vector3();
  private tmpScale = new Vector3(1, 1, 1);
  private tmpQuat = new Quaternion();
  private tmpMatrix = new Matrix4();
  private up = new Vector3(0, 1, 0);

  /** Number of field lines drawn in the last rebuild (for inspection). */
  lineCount = 0;

  init(): void {
    this.positions = new Float32Array(MAX_SEGMENTS * 2 * 3);
    this.positionAttr = new BufferAttribute(this.positions, 3);
    this.positionAttr.setUsage(DynamicDrawUsage);
    this.lineGeometry = new BufferGeometry();
    this.lineGeometry.setAttribute('position', this.positionAttr);
    this.lineGeometry.setDrawRange(0, 0);

    const lines = new LineSegments(
      this.lineGeometry,
      new LineBasicMaterial({ color: 0xffffff }),
    );
    lines.name = 'FieldLines';
    lines.frustumCulled = false;

    const cone = new ConeGeometry(0.009, 0.028, 10);
    this.arrows = new InstancedMesh(
      cone,
      new MeshBasicMaterial({ color: 0xffffff }),
      MAX_ARROWS,
    );
    this.arrows.name = 'FieldArrows';
    this.arrows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;

    const root = new Group();
    root.name = 'ElectricField';
    root.add(lines, this.arrows);
    this.world.createTransformEntity(root);

    this.cleanupFuncs.push(() => {
      this.lineGeometry.dispose();
      cone.dispose();
    });
  }

  update(): void {
    const rebuilt = this.gatherCharges();
    if (rebuilt) this.rebuild();

    this.player.head.getWorldPosition(this.headPos);
    if (rebuilt || this.headPos.distanceToSquared(this.lastHeadPos) > HEAD_EPSILON * HEAD_EPSILON) {
      this.lastHeadPos.copy(this.headPos);
      this.scaleArrowsByHeadDistance();
    }
  }

  /** Shrinks arrows near the head to zero so they never fill the view. */
  private scaleArrowsByHeadDistance(): void {
    const hx = this.headPos.x;
    const hy = this.headPos.y;
    const hz = this.headPos.z;
    const span = ARROW_FADE_FAR - ARROW_FADE_NEAR;
    for (let i = 0; i < this.arrowCount; i++) {
      const p = i * 3;
      const q = i * 4;
      const dx = this.arrowPos[p] - hx;
      const dy = this.arrowPos[p + 1] - hy;
      const dz = this.arrowPos[p + 2] - hz;
      let s = (Math.sqrt(dx * dx + dy * dy + dz * dz) - ARROW_FADE_NEAR) / span;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      this.tmpPos.set(this.arrowPos[p], this.arrowPos[p + 1], this.arrowPos[p + 2]);
      this.tmpQuat.set(this.arrowQuat[q], this.arrowQuat[q + 1], this.arrowQuat[q + 2], this.arrowQuat[q + 3]);
      this.tmpScale.setScalar(s);
      this.tmpMatrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.arrows.setMatrixAt(i, this.tmpMatrix);
    }
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  /** Reads charge positions/values; returns true when anything changed. */
  private gatherCharges(): boolean {
    let n = 0;
    for (const entity of this.queries.charges.entities) {
      if (n >= MAX_CHARGES) break;
      const obj = entity.object3D;
      if (obj == null) continue;
      obj.getWorldPosition(this.tmpPos);
      const o = n * CHARGE_STRIDE;
      this.charges[o] = this.tmpPos.x;
      this.charges[o + 1] = this.tmpPos.y;
      this.charges[o + 2] = this.tmpPos.z;
      this.charges[o + 3] = entity.getValue(PointCharge, 'q') ?? 0;
      n++;
    }
    this.chargeCount = n;

    let changed = n !== this.lastCount;
    for (let i = 0; !changed && i < n * CHARGE_STRIDE; i++) {
      if (Math.abs(this.charges[i] - this.lastCharges[i]) > MOVE_EPSILON) changed = true;
    }
    if (changed) {
      this.lastCharges.set(this.charges);
      this.lastCount = n;
    }
    return changed;
  }

  private rebuild(): void {
    const count = this.chargeCount;
    const charges = this.charges;
    const p = this.params;

    // Bounding sphere centred on the charges' centroid.
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < count; i++) {
      cx += charges[i * CHARGE_STRIDE];
      cy += charges[i * CHARGE_STRIDE + 1];
      cz += charges[i * CHARGE_STRIDE + 2];
    }
    if (count > 0) {
      p.centerX = cx / count;
      p.centerY = cy / count;
      p.centerZ = cz / count;
    }

    this.segmentCount = 0;
    this.arrowCount = 0;
    this.lineCount = 0;

    for (let c = 0; c < count; c++) {
      const o = c * CHARGE_STRIDE;
      const q = charges[o + 3];
      if (q === 0) continue;
      const sign: 1 | -1 = q > 0 ? 1 : -1;
      const seeds = Math.max(1, Math.round(Math.abs(q) * LINES_PER_NC));
      for (let s = 0; s < seeds; s++) {
        if (this.lineCount >= MAX_LINES) break;
        fibonacciSpherePoint(s, seeds, this.seedDir);
        traceFieldLine(
          charges[o] + SEED_RADIUS * this.seedDir[0],
          charges[o + 1] + SEED_RADIUS * this.seedDir[1],
          charges[o + 2] + SEED_RADIUS * this.seedDir[2],
          sign,
          charges,
          count,
          p,
          this.linePts,
          this.lineMag,
          MAX_POINTS_PER_LINE,
          this.scratch,
          this.trace,
        );
        // A backward line from a − charge that ends on a + charge duplicates
        // a line already drawn from that + charge.
        if (sign < 0 && this.trace.termination === Termination.Captured) continue;
        this.emitLine(this.trace.points, sign);
        this.lineCount++;
      }
    }

    this.lineGeometry.setDrawRange(0, this.segmentCount * 2);
    this.positionAttr.needsUpdate = true;
    this.arrows.count = this.arrowCount;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  /** Appends one traced polyline as segments plus direction arrows. */
  private emitLine(points: number, sign: 1 | -1): void {
    const pts = this.linePts;
    let arc = ARROW_SPACING * 0.5;

    for (let i = 0; i + 1 < points; i++) {
      if (this.segmentCount >= MAX_SEGMENTS) return;
      const a = i * 3;
      const b = a + 3;
      const v = this.segmentCount * 6;
      this.positions[v] = pts[a];
      this.positions[v + 1] = pts[a + 1];
      this.positions[v + 2] = pts[a + 2];
      this.positions[v + 3] = pts[b];
      this.positions[v + 4] = pts[b + 1];
      this.positions[v + 5] = pts[b + 2];
      this.segmentCount++;

      const dx = pts[b] - pts[a];
      const dy = pts[b + 1] - pts[a + 1];
      const dz = pts[b + 2] - pts[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      arc += len;
      if (arc >= ARROW_SPACING && len > 0 && this.arrowCount < MAX_ARROWS) {
        arc = 0;
        // Arrows always point along +E, even on lines traced backwards.
        this.tmpDir.set(dx * sign, dy * sign, dz * sign).divideScalar(len);
        this.tmpQuat.setFromUnitVectors(this.up, this.tmpDir);
        const p = this.arrowCount * 3;
        const q = this.arrowCount * 4;
        this.arrowPos[p] = pts[b];
        this.arrowPos[p + 1] = pts[b + 1];
        this.arrowPos[p + 2] = pts[b + 2];
        this.arrowQuat[q] = this.tmpQuat.x;
        this.arrowQuat[q + 1] = this.tmpQuat.y;
        this.arrowQuat[q + 2] = this.tmpQuat.z;
        this.arrowQuat[q + 3] = this.tmpQuat.w;
        this.arrowCount++;
      }
    }
  }
}
