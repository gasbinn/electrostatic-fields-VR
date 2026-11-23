import {
  AdditiveBlending,
  createSystem,
  type Entity,
  Grabbed,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from '@iwsdk/core';
import { PointCharge } from './charge-component.js';

/** Halo radius (m); the charge sphere is 0.035 m. */
const HALO_RADIUS = 0.058;
/** Halo opacity pulses between these values while held. */
const PULSE_MIN = 0.25;
const PULSE_MAX = 0.55;
const PULSE_SPEED = 6;

/** Never let the halo capture a ray meant for the charge. */
const noRaycast = (): void => {};

/**
 * Highlights a point charge while it is grabbed: a soft pulsing white halo
 * around it, removed on release.
 */
export class GrabHighlightSystem extends createSystem({
  held: { required: [PointCharge, Grabbed] },
}) {
  private halos = new Map<Entity, Mesh>();
  private geometry!: SphereGeometry;
  private material!: MeshBasicMaterial;
  private time = 0;

  init(): void {
    this.geometry = new SphereGeometry(HALO_RADIUS, 32, 16);
    this.material = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: PULSE_MAX,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    this.queries.held.subscribe('qualify', (entity) => this.show(entity, true));
    this.queries.held.subscribe('disqualify', (entity) => this.show(entity, false));

    this.cleanupFuncs.push(() => {
      for (const halo of this.halos.values()) halo.removeFromParent();
      this.halos.clear();
      this.geometry.dispose();
      this.material.dispose();
    });
  }

  update(delta: number): void {
    if (this.queries.held.entities.size === 0) return;
    this.time += delta;
    const t = 0.5 + 0.5 * Math.sin(this.time * PULSE_SPEED);
    this.material.opacity = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * t;
  }

  private show(entity: Entity, visible: boolean): void {
    let halo = this.halos.get(entity);
    if (halo == null) {
      if (!visible) return;
      const obj = entity.object3D;
      if (obj == null) return;
      halo = new Mesh(this.geometry, this.material);
      halo.name = 'GrabHalo';
      halo.raycast = noRaycast;
      obj.add(halo);
      this.halos.set(entity, halo);
    }
    halo.visible = visible;
    if (!visible && !entity.active) {
      // The entity was disposed while held; drop our reference.
      halo.removeFromParent();
      this.halos.delete(entity);
    }
  }
}
