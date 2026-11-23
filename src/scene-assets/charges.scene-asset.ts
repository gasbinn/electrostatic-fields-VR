import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from '@iwsdk/core';

/**
 * Point-charge markers: a glowing sphere (red = +, blue = −) with a white
 * sign glyph on its front. The origin is the charge's position.
 */
const RADIUS = 0.035;

const sphereGeometry = new SphereGeometry(RADIUS, 32, 16);
const barGeometry = new BoxGeometry(RADIUS * 1.1, RADIUS * 0.26, RADIUS * 0.26);

const positiveMaterial = new MeshStandardMaterial({
  color: '#e8453c',
  emissive: '#b0201a',
  emissiveIntensity: 0.6,
  roughness: 0.35,
  metalness: 0.05,
});
const negativeMaterial = new MeshStandardMaterial({
  color: '#3c7be8',
  emissive: '#1a3fb0',
  emissiveIntensity: 0.6,
  roughness: 0.35,
  metalness: 0.05,
});
const glyphMaterial = new MeshStandardMaterial({
  color: '#ffffff',
  emissive: '#ffffff',
  emissiveIntensity: 0.8,
});

function createCharge(name: string, positive: boolean): Group {
  const root = new Group();
  root.name = name;
  const body = new Mesh(sphereGeometry, positive ? positiveMaterial : negativeMaterial);
  body.name = 'Body';
  root.add(body);

  // Sign glyphs on the six axis faces, so the sign reads from any side.
  const faces: [number, number, number, number, number][] = [
    [0, 0, 1, 0, 0],
    [0, 0, -1, 0, Math.PI],
    [1, 0, 0, 0, Math.PI / 2],
    [-1, 0, 0, 0, -Math.PI / 2],
    [0, 1, 0, -Math.PI / 2, 0],
    [0, -1, 0, Math.PI / 2, 0],
  ];
  for (const [x, y, z, rx, ry] of faces) {
    const glyph = new Group();
    glyph.name = 'Sign';
    glyph.position.set(x * RADIUS * 0.93, y * RADIUS * 0.93, z * RADIUS * 0.93);
    glyph.rotation.set(rx, ry, 0);
    glyph.add(new Mesh(barGeometry, glyphMaterial));
    if (positive) {
      const vertical = new Mesh(barGeometry, glyphMaterial);
      vertical.rotation.z = Math.PI / 2;
      glyph.add(vertical);
    }
    root.add(glyph);
  }
  return root;
}

export function createPositiveCharge(): Group {
  return createCharge('Positive Charge', true);
}

export function createNegativeCharge(): Group {
  return createCharge('Negative Charge', false);
}
