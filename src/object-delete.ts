import {
  createSystem,
  type Entity,
  Grabbed,
  GrabSystem,
  Hovered,
  InputComponent,
} from '@iwsdk/core';
import { PointCharge } from './charge-component.js';
import { FieldSensor } from './sensor-component.js';

/**
 * Deletes one charge or field sensor with a controller button: B on the right
 * controller or X on the left. It removes the object being held; if nothing is
 * held, the object under the pointer.
 *
 * A held object is first force-released and hidden, then disposed on a later
 * frame once the grab system has dropped it, so the grab system never touches
 * a disposed entity.
 */
export class ObjectDeleteSystem extends createSystem({
  heldCharges: { required: [PointCharge, Grabbed] },
  heldSensors: { required: [FieldSensor, Grabbed] },
  hoveredCharges: { required: [PointCharge, Hovered] },
  hoveredSensors: { required: [FieldSensor, Hovered] },
}) {
  /** Released-but-not-yet-disposed entities. */
  private pending: Entity[] = [];

  update(): void {
    this.flushPending();

    const right = this.input.xr.gamepads.right;
    const left = this.input.xr.gamepads.left;
    const pressed =
      (right?.getButtonDown(InputComponent.B_Button) ?? false) ||
      (left?.getButtonDown(InputComponent.X_Button) ?? false);
    if (!pressed) return;

    const target =
      first(this.queries.heldCharges.entities) ??
      first(this.queries.heldSensors.entities) ??
      first(this.queries.hoveredCharges.entities) ??
      first(this.queries.hoveredSensors.entities);
    if (target != null) this.remove(target);
  }

  /** Deletes a charge or sensor, releasing it first if it is held. */
  remove(entity: Entity): void {
    if (!entity.hasComponent(Grabbed)) {
      entity.dispose();
      return;
    }
    this.world.getSystem(GrabSystem)?.forceRelease(entity);
    // Take it out of the physics and visuals right away; dispose later.
    if (entity.hasComponent(PointCharge)) entity.removeComponent(PointCharge);
    if (entity.hasComponent(FieldSensor)) entity.removeComponent(FieldSensor);
    if (entity.object3D != null) entity.object3D.visible = false;
    this.pending.push(entity);
  }

  private flushPending(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const entity = this.pending[i];
      if (!entity.active) {
        this.pending.splice(i, 1);
      } else if (!entity.hasComponent(Grabbed)) {
        entity.dispose();
        this.pending.splice(i, 1);
      }
    }
  }
}

function first(entities: Set<Entity>): Entity | undefined {
  for (const entity of entities) return entity;
  return undefined;
}
