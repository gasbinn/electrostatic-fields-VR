import {
  CircleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from '@iwsdk/core';

/**
 * Lab floor: a wide matte disc for locomotion plus a thin ring marking the
 * standing area at the origin. Floor contact is at y = 0.
 */
const floorMaterial = new MeshStandardMaterial({
  color: '#08080a',
  roughness: 0.95,
  metalness: 0,
});
const markMaterial = new MeshStandardMaterial({
  color: '#3a3d46',
  roughness: 0.9,
  metalness: 0,
});

export function createLabFloor(radius = 18): Group {
  const root = new Group();
  root.name = 'Lab Floor';

  const floor = new Mesh(new CircleGeometry(radius, 96), floorMaterial);
  floor.name = 'Surface';
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  const ring = new Mesh(new RingGeometry(0.6, 0.63, 96), markMaterial);
  ring.name = 'Standing Mark';
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  root.add(ring);

  return root;
}
