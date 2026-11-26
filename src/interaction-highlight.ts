import {
  AdditiveBlending,
  createSystem,
  type Entity,
  Grabbed,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from '@iwsdk/core';
import { PointCharge } from './charge-component.js';
import { FieldSensor } from './sensor-component.js';

/** Halo radius (m); a charge is 0.035 m and a sensor cage 0.038 m. */
const HALO_RADIUS = 0.058;
/** Hover halo: soft, static cyan. */
const HOVER_COLOR = '#7fe0ff';
const HOVER_OPACITY = 0.3;
/** Grab halo: white, pulsing between these opacities. */
const GRAB_COLOR = '#ffffff';
const PULSE_MIN = 0.25;
const PULSE_MAX = 0.55;
const PULSE_SPEED = 6;

/** Never let a halo capture a ray meant for its object. */
const noRaycast = (): void => {};

/**
 * Highlights charges and field sensors under interaction:
 * - pointer over the object (Hovered): a soft cyan halo;
 * - object held (Grabbed): a pulsing white halo, which wins over hover.
 */
export class InteractionHighlightSystem extends createSystem({
  hoveredCharges: { required: [PointCharge, Hovered] },
  hoveredSensors: { required: [FieldSensor, Hovered] },
  heldCharges: { required: [PointCharge, Grabbed] },
  heldSensors: { required: [FieldSensor, Grabbed] },
}) {
  private halos = new Map<Entity, Mesh>();
  private geometry!: SphereGeometry;
  private hoverMaterial!: MeshBasicMaterial;
  private grabMaterial!: MeshBasicMaterial;
  private time = 0;

  init(): void {
    this.geometry = new SphereGeometry(HALO_RADIUS, 32, 16);
    const haloMaterial = (color: string, opacity: number) =>
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
    this.hoverMaterial = haloMaterial(HOVER_COLOR, HOVER_OPACITY);
    this.grabMaterial = haloMaterial(GRAB_COLOR, PULSE_MAX);

    const refresh = (entity: Entity) => this.refresh(entity);
    for (const query of [
      this.queries.hoveredCharges,
      this.queries.hoveredSensors,
      this.queries.heldCharges,
      this.queries.heldSensors,
    ]) {
      query.subscribe('qualify', refresh);
      query.subscribe('disqualify', refresh);
    }

    this.cleanupFuncs.push(() => {
      for (const halo of this.halos.values()) halo.removeFromParent();
      this.halos.clear();
      this.geometry.dispose();
      this.hoverMaterial.dispose();
      this.grabMaterial.dispose();
    });
  }

  update(delta: number): void {
    if (this.queries.heldCharges.entities.size === 0 && this.queries.heldSensors.entities.size === 0) {
      return;
    }
    this.time += delta;
    const t = 0.5 + 0.5 * Math.sin(this.time * PULSE_SPEED);
    this.grabMaterial.opacity = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * t;
  }

  /** Shows the halo that matches the entity's current state, or none. */
  private refresh(entity: Entity): void {
    let halo = this.halos.get(entity);
    if (!entity.active) {
      // Disposed (e.g. deleted while hovered or held): drop our reference.
      halo?.removeFromParent();
      this.halos.delete(entity);
      return;
    }
    const tracked = entity.hasComponent(PointCharge) || entity.hasComponent(FieldSensor);
    const held = tracked && entity.hasComponent(Grabbed);
    const hovered = tracked && entity.hasComponent(Hovered);

    if (!held && !hovered) {
      if (halo != null) halo.visible = false;
      return;
    }
    if (halo == null) {
      const obj = entity.object3D;
      if (obj == null) return;
      halo = new Mesh(this.geometry, this.hoverMaterial);
      halo.name = 'InteractionHalo';
      halo.raycast = noRaycast;
      obj.add(halo);
      this.halos.set(entity, halo);
    }
    halo.material = held ? this.grabMaterial : this.hoverMaterial;
    halo.visible = true;
  }
}
