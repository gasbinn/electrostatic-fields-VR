# Campos electrostáticos en VR

Proyecto final de Física A: una simulación de realidad virtual para Meta Quest
que muestra que los campos electrostáticos son tridimensionales. El usuario
mueve cargas puntuales y ve las líneas de campo trazadas en 3D.

Hecho con el [Immersive Web SDK](https://iwsdk.dev) (WebXR + Three.js + ECS) en
TypeScript.

```sh
npm install
npm run dev
```

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/physics/electrostatics.ts` | Física pura: Coulomb con superposición, potencial, semillas en esfera de Fibonacci y trazado RK4 de líneas de campo. |
| `src/charge-component.ts` | Componente `PointCharge { q }` (carga en nC). |
| `src/field-lines.ts` | Sistema que retraza las líneas cuando una carga se mueve. |
| `src/panel.ts` | Botones de entrar/salir de VR del panel de información. |
| `src/scene-assets/` | Modelos procedurales: cargas y piso. |
| `public/scenes/main.iwsdk.scene.json` | Composición de la escena (posiciones y valores de las cargas). |
| `public/ui/info-panel.uikitml` | Panel de información. |

## Modelo

- E(r) = Σ k·qᵢ·(r − pᵢ)/|r − pᵢ|³, con k = 8.99×10⁹ N·m²/C² y q en nC.
- Líneas de campo: dr/ds = E/|E| integrado con RK4 y paso adaptativo. Se
  siembran 10 líneas por nC alrededor de cada carga y terminan en una carga de
  signo opuesto, al salir de un radio máximo o donde |E| ≈ 0.
