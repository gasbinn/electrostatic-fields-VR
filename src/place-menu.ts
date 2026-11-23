import {
  createSystem,
  DistanceGrabbable,
  type Entity,
  InputComponent,
  MovementMode,
  type Object3D,
  RayInteractable,
  type UIKitMLAsset,
  Vector3,
} from '@iwsdk/core';
import { PointCharge } from './charge-component.js';
import { FieldSensor } from './sensor-component.js';
import { createFieldSensor } from './scene-assets/sensor.scene-asset.js';
import {
  createNegativeCharge,
  createPositiveCharge,
} from './scene-assets/charges.scene-asset.js';

/** Scene node id of the authored menu panel. */
const MENU_NODE = 'place-menu';
/** Menu distance in front of the head and drop below eye level (m). */
const MENU_DISTANCE = 0.55;
const MENU_DROP = 0.12;
/** New charges appear this far in front of the head (m). */
const SPAWN_DISTANCE = 0.35;
/** Sideways slots (x 6 cm) so consecutive charges do not overlap. */
const SPAWN_OFFSETS = [0, 1, -1, 2, -2];
/** Where the hidden menu is parked, so its ray targets are out of reach. */
const PARKED_Y = -50;

/**
 * Placement menu for controller use. Y (or the menu button) on the left
 * controller toggles a panel in front of the player; choosing a charge or a
 * field sensor creates it, grabbable, in front of the player and closes the
 * menu.
 */
export class PlaceMenuSystem extends createSystem({
  charges: { required: [PointCharge] },
  sensors: { required: [FieldSensor] },
}) {
  private menu!: Object3D;
  private open = false;
  private spawnCount = 0;
  private head = new Vector3();
  private forward = new Vector3();

  init(): void {
    const panel = this.world.requireSceneObject<UIKitMLAsset>(MENU_NODE);
    this.menu = this.world.requireSceneEntity(MENU_NODE).object3D ?? panel;
    this.setOpen(false);

    const bind = (id: string, handler: () => void) => {
      const element = panel.requireElementById(id);
      element.name = id;
      element.addEventListener('click', handler);
      this.cleanupFuncs.push(() => element.removeEventListener('click', handler));
    };
    bind('btn-pos1', () => this.spawn(1));
    bind('btn-neg1', () => this.spawn(-1));
    bind('btn-pos2', () => this.spawn(2));
    bind('btn-neg2', () => this.spawn(-2));
    bind('btn-sensor', () => this.spawnSensor());
    bind('btn-clear', () => this.clearAll());
    bind('btn-close', () => this.setOpen(false));
  }

  update(): void {
    const left = this.input.xr.gamepads.left;
    if (
      left != null &&
      (left.getButtonDown(InputComponent.Y_Button) || left.getButtonDown(InputComponent.Menu))
    ) {
      this.setOpen(!this.open);
    }
  }

  /** Shows the menu in front of the player, or hides and parks it. */
  setOpen(open: boolean): void {
    this.open = open;
    this.menu.visible = open;
    if (!open) {
      this.menu.position.set(0, PARKED_Y, 0);
      return;
    }
    this.headPose();
    this.menu.position
      .copy(this.head)
      .addScaledVector(this.forward, MENU_DISTANCE);
    this.menu.position.y -= MENU_DROP;
    // Turn the panel's front (+Z) toward the player, keeping it upright.
    this.menu.lookAt(this.head.x, this.menu.position.y, this.head.z);
  }

  /** Creates a grabbable point charge of q nC in front of the player. */
  spawn(q: number): Entity {
    const object = q > 0 ? createPositiveCharge() : createNegativeCharge();
    object.name = `Carga ${q > 0 ? '+' : '-'}${Math.abs(q)} nC`;
    const entity = this.place(object);
    entity.addComponent(PointCharge, { q });
    return entity;
  }

  /** Creates a grabbable field sensor in front of the player. */
  spawnSensor(): Entity {
    const entity = this.place(createFieldSensor());
    entity.addComponent(FieldSensor);
    return entity;
  }

  /** Removes every charge and sensor, authored or placed. */
  clearAll(): void {
    for (const entity of [...this.queries.charges.entities]) entity.dispose();
    for (const entity of [...this.queries.sensors.entities]) entity.dispose();
  }

  /** Puts a new grabbable object in front of the player and closes the menu. */
  private place(object: Object3D): Entity {
    this.headPose();
    // Small sideways offset so consecutive objects do not overlap.
    const side = SPAWN_OFFSETS[this.spawnCount++ % SPAWN_OFFSETS.length] * 0.06;
    object.position
      .copy(this.head)
      .addScaledVector(this.forward, SPAWN_DISTANCE);
    object.position.x += -this.forward.z * side;
    object.position.z += this.forward.x * side;
    object.position.y -= 0.08;

    const entity = this.world.createTransformEntity(object);
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
      rotate: false,
      scale: false,
    });
    this.setOpen(false);
    return entity;
  }

  /** Head world position and its horizontal forward direction. */
  private headPose(): void {
    const head = this.player.head;
    head.updateWorldMatrix(true, false);
    head.getWorldPosition(this.head);
    head.getWorldDirection(this.forward);
    // Object3D.getWorldDirection returns +Z; the view looks down -Z.
    this.forward.negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
  }
}
