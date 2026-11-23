import { createSystem } from '@iwsdk/core';

/** RayDisplayMode.Visible in @iwsdk/xr-input (1 = always, 2 = on hit, 3 = never). */
const RAY_ALWAYS_VISIBLE = 1;

/** The slice of the private pointer structure this system touches. */
interface RayHolder {
  /** MultiPointer's ray entry; `visual` is the RayPointer that renders the ray. */
  ray?: { visual?: { rayDisplayMode?: number } };
}

/**
 * Keeps the controller rays visible at all times, not only while they hit an
 * interactable, so the user always sees where they are aiming.
 *
 * IWSDK 1.1 exposes no public setting for this; the ray's display mode lives
 * on a private MultiPointer field, so it is set defensively every frame (the
 * pointers can be recreated when controllers reconnect).
 */
export class ControllerRaySystem extends createSystem({}) {
  update(): void {
    const multiPointers = (this.input.xr as unknown as {
      multiPointers?: Record<'left' | 'right', unknown>;
    }).multiPointers;
    if (multiPointers == null) return;
    this.force(multiPointers.left);
    this.force(multiPointers.right);
  }

  private force(multiPointer: unknown): void {
    const visual = (multiPointer as RayHolder | undefined)?.ray?.visual;
    if (visual != null && visual.rayDisplayMode !== RAY_ALWAYS_VISIBLE) {
      visual.rayDisplayMode = RAY_ALWAYS_VISIBLE;
    }
  }
}
