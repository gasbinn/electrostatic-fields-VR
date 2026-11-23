import { createComponent, Types } from '@iwsdk/core';

/**
 * A fixed point source charge. `q` is in nanocoulombs (nC), like PhET's
 * "Charges and Fields". The charge's position is its entity's world position.
 */
export const PointCharge = createComponent('PointCharge', {
  q: {
    type: Types.Float32,
    default: 1,
    label: 'Carga (nC)',
    step: 0.5,
    min: -10,
    max: 10,
  },
});
