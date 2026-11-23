import { createComponent } from '@iwsdk/core';

/**
 * A field probe. It measures E at its world position and shows an arrow along
 * E (length ∝ |E|) plus a label with |E| and the angles to the x, y, z axes.
 */
export const FieldSensor = createComponent('FieldSensor', {});
