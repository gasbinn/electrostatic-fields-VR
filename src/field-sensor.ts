import {
  CanvasTexture,
  ConeGeometry,
  createSystem,
  CylinderGeometry,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { PointCharge } from './charge-component.js';
import { CHARGE_STRIDE, fieldAt } from './physics/electrostatics.js';
import { FieldSensor } from './sensor-component.js';

const MAX_CHARGES = 16;
/** Arrow length per unit field: 1 cm of arrow = 5 N/C. */
const ARROW_M_PER_NC = 0.002;
/** Arrows longer than this are capped (and the label says so). */
const ARROW_MAX = 0.6;
const ARROW_HEAD_LENGTH = 0.03;
const ARROW_HEAD_RADIUS = 0.012;
const ARROW_SHAFT_RADIUS = 0.004;
/** Below this |E| there is no meaningful direction (N/C). */
const MIN_FIELD = 1e-3;
/** Label refresh period (s); avoids rebuilding text every frame. */
const LABEL_PERIOD = 0.1;
const LABEL_W = 512;
const LABEL_H = 300;
const LABEL_WIDTH_M = 0.17;
const LABEL_OFFSET_Y = 0.12;
const RAD_TO_DEG = 180 / Math.PI;

const YELLOW = '#ffd400';

interface SensorVisual {
  root: Group;
  shaft: Mesh;
  head: Mesh;
  label: Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  material: MeshBasicMaterial;
  /** Last values drawn, to skip redraws when nothing changed. */
  shown: Float64Array;
}

/** Never let a sensor's arrow or label capture a ray meant for the sensor. */
const noRaycast = (): void => {};

/**
 * Measures E at every FieldSensor and shows it: a yellow arrow along E whose
 * length is proportional to |E|, and a label with |E| and the direction angles
 * α, β, γ between E and the +x, +y, +z axes.
 */
export class FieldSensorSystem extends createSystem({
  sensors: { required: [FieldSensor] },
  charges: { required: [PointCharge] },
}) {
  private visuals = new Map<Entity, SensorVisual>();
  private charges = new Float64Array(MAX_CHARGES * CHARGE_STRIDE);
  private field = new Float64Array(3);
  private pos = new Vector3();
  private headPos = new Vector3();
  private dir = new Vector3();
  private up = new Vector3(0, 1, 0);
  private quat = new Quaternion();
  private labelTimer = 0;

  private shaftGeometry!: CylinderGeometry;
  private headGeometry!: ConeGeometry;
  private labelGeometry!: PlaneGeometry;
  private arrowMaterial!: MeshBasicMaterial;

  init(): void {
    // Unit shaft from y = 0 to y = 1, scaled along y to the arrow length.
    this.shaftGeometry = new CylinderGeometry(ARROW_SHAFT_RADIUS, ARROW_SHAFT_RADIUS, 1, 10);
    this.shaftGeometry.translate(0, 0.5, 0);
    this.headGeometry = new ConeGeometry(ARROW_HEAD_RADIUS, ARROW_HEAD_LENGTH, 14);
    this.headGeometry.translate(0, ARROW_HEAD_LENGTH / 2, 0);
    this.labelGeometry = new PlaneGeometry(LABEL_WIDTH_M, (LABEL_WIDTH_M * LABEL_H) / LABEL_W);
    this.arrowMaterial = new MeshBasicMaterial({ color: YELLOW, toneMapped: false });

    this.queries.sensors.subscribe('qualify', (entity) => this.attach(entity));
    this.queries.sensors.subscribe('disqualify', (entity) => this.detach(entity));
    for (const entity of this.queries.sensors.entities) this.attach(entity);

    this.cleanupFuncs.push(() => {
      for (const entity of [...this.visuals.keys()]) this.detach(entity);
      this.shaftGeometry.dispose();
      this.headGeometry.dispose();
      this.labelGeometry.dispose();
      this.arrowMaterial.dispose();
    });
  }

  update(delta: number): void {
    if (this.visuals.size === 0) return;

    let count = 0;
    for (const entity of this.queries.charges.entities) {
      if (count >= MAX_CHARGES) break;
      const obj = entity.object3D;
      if (obj == null) continue;
      obj.getWorldPosition(this.pos);
      const o = count * CHARGE_STRIDE;
      this.charges[o] = this.pos.x;
      this.charges[o + 1] = this.pos.y;
      this.charges[o + 2] = this.pos.z;
      this.charges[o + 3] = entity.getValue(PointCharge, 'q') ?? 0;
      count++;
    }

    this.labelTimer += delta;
    const refreshLabels = this.labelTimer >= LABEL_PERIOD;
    if (refreshLabels) this.labelTimer = 0;
    this.player.head.getWorldPosition(this.headPos);

    for (const [entity, v] of this.visuals) {
      const obj = entity.object3D;
      if (obj == null) continue;
      obj.getWorldPosition(this.pos);
      const mag = fieldAt(this.pos.x, this.pos.y, this.pos.z, this.charges, count, this.field);

      if (mag < MIN_FIELD) {
        v.root.visible = false;
      } else {
        v.root.visible = true;
        this.dir.set(this.field[0] / mag, this.field[1] / mag, this.field[2] / mag);
        this.quat.setFromUnitVectors(this.up, this.dir);
        v.root.quaternion.copy(this.quat);
        const length = Math.min(mag * ARROW_M_PER_NC, ARROW_MAX);
        const shaft = Math.max(length - ARROW_HEAD_LENGTH, 1e-4);
        v.shaft.scale.set(1, shaft, 1);
        v.head.position.set(0, shaft, 0);
      }

      // Keep the label upright and facing the viewer.
      v.label.lookAt(this.headPos.x, this.pos.y + LABEL_OFFSET_Y, this.headPos.z);
      if (refreshLabels) this.drawLabel(v, mag);
    }
  }

  private attach(entity: Entity): void {
    const obj = entity.object3D;
    if (obj == null || this.visuals.has(entity)) return;

    const root = new Group();
    root.name = 'FieldArrow';
    const shaft = new Mesh(this.shaftGeometry, this.arrowMaterial);
    shaft.name = 'Shaft';
    const head = new Mesh(this.headGeometry, this.arrowMaterial);
    head.name = 'Head';
    shaft.raycast = noRaycast;
    head.raycast = noRaycast;
    root.add(shaft, head);

    const canvas = document.createElement('canvas');
    canvas.width = LABEL_W;
    canvas.height = LABEL_H;
    const ctx = canvas.getContext('2d');
    if (ctx == null) return;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      toneMapped: false,
    });
    const label = new Mesh(this.labelGeometry, material);
    label.name = 'FieldLabel';
    label.position.set(0, LABEL_OFFSET_Y, 0);
    label.raycast = noRaycast;

    obj.add(root, label);
    const visual: SensorVisual = {
      root,
      shaft,
      head,
      label,
      canvas,
      ctx,
      texture,
      material,
      shown: new Float64Array([NaN, NaN, NaN, NaN]),
    };
    this.visuals.set(entity, visual);
  }

  private detach(entity: Entity): void {
    const v = this.visuals.get(entity);
    if (v == null) return;
    v.root.removeFromParent();
    v.label.removeFromParent();
    v.texture.dispose();
    v.material.dispose();
    this.visuals.delete(entity);
  }

  /** Redraws the label when |E| or an angle changed by a visible amount. */
  private drawLabel(v: SensorVisual, mag: number): void {
    const valid = mag >= MIN_FIELD;
    const alpha = valid ? Math.acos(this.field[0] / mag) * RAD_TO_DEG : NaN;
    const beta = valid ? Math.acos(this.field[1] / mag) * RAD_TO_DEG : NaN;
    const gamma = valid ? Math.acos(this.field[2] / mag) * RAD_TO_DEG : NaN;

    const s = v.shown;
    const same =
      Math.abs(mag - s[0]) < Math.max(0.05, mag * 0.001) &&
      Math.abs(alpha - s[1]) < 0.05 &&
      Math.abs(beta - s[2]) < 0.05 &&
      Math.abs(gamma - s[3]) < 0.05;
    if (same) return;
    s[0] = mag;
    s[1] = alpha;
    s[2] = beta;
    s[3] = gamma;

    const ctx = v.ctx;
    ctx.clearRect(0, 0, LABEL_W, LABEL_H);
    ctx.fillStyle = 'rgba(12, 12, 16, 0.85)';
    ctx.strokeStyle = YELLOW;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(4, 4, LABEL_W - 8, LABEL_H - 8, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = YELLOW;
    ctx.textBaseline = 'top';
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(`|E| = ${formatField(mag)} N/C`, 30, 24);

    ctx.font = '42px sans-serif';
    ctx.fillStyle = '#fff6c2';
    if (valid) {
      ctx.fillText(`α (eje x) = ${alpha.toFixed(1)}°`, 30, 100);
      ctx.fillText(`β (eje y) = ${beta.toFixed(1)}°`, 30, 152);
      ctx.fillText(`γ (eje z) = ${gamma.toFixed(1)}°`, 30, 204);
    } else {
      ctx.fillText('Campo nulo: sin direccion', 30, 120);
    }

    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#c9b25a';
    const capped = mag * ARROW_M_PER_NC > ARROW_MAX;
    ctx.fillText(capped ? 'Flecha: 1 cm = 5 N/C (recortada)' : 'Flecha: 1 cm = 5 N/C', 30, 258);
    v.texture.needsUpdate = true;
  }
}

/** |E| with about 3 significant figures. */
function formatField(mag: number): string {
  if (mag >= 1000) return mag.toFixed(0);
  if (mag >= 100) return mag.toFixed(1);
  return mag.toFixed(2);
}
