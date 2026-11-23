import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { PlaceMenuSystem } from './place-menu.js';
import { FieldLineSystem } from './field-lines.js';
import { FieldSensorSystem } from './field-sensor.js';
import { ControllerRaySystem } from './controller-ray.js';
import { GrabHighlightSystem } from './grab-highlight.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(FieldLineSystem);
  world.registerSystem(FieldSensorSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(PlaceMenuSystem);
  world.registerSystem(ControllerRaySystem);
  world.registerSystem(GrabHighlightSystem);
});
