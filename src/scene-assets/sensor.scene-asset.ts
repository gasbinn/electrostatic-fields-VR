import { Group, Mesh, MeshStandardMaterial, OctahedronGeometry, SphereGeometry } from '@iwsdk/core';

/**
 * Field sensor marker: a small glowing yellow sphere inside a thin yellow
 * octahedron cage, so it reads as different from a charge. The origin is the
 * measuring point.
 */
const RADIUS = 0.02;

const coreGeometry = new SphereGeometry(RADIUS, 24, 12);
const cageGeometry = new OctahedronGeometry(RADIUS * 1.9, 0);

const coreMaterial = new MeshStandardMaterial({
  color: '#ffd400',
  emissive: '#ffcc00',
  emissiveIntensity: 0.9,
  roughness: 0.4,
});
const cageMaterial = new MeshStandardMaterial({
  color: '#ffe34d',
  emissive: '#b38f00',
  emissiveIntensity: 0.6,
  wireframe: true,
});

export function createFieldSensor(): Group {
  const root = new Group();
  root.name = 'Field Sensor';
  const core = new Mesh(coreGeometry, coreMaterial);
  core.name = 'Core';
  const cage = new Mesh(cageGeometry, cageMaterial);
  cage.name = 'Cage';
  root.add(core, cage);
  return root;
}
