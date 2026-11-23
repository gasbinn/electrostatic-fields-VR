import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createNegativeCharge,
  createPositiveCharge,
} from './scene-assets/charges.scene-asset.js';
import { createLabFloor } from './scene-assets/lab.scene-asset.js';
import { createFieldSensor } from './scene-assets/sensor.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'lab-floor': createLabFloor(),
  'charge-positive': createPositiveCharge(),
  'charge-negative': createNegativeCharge(),
  'field-sensor': createFieldSensor(),
  'info-panel': {
    url: publicAssetUrl('ui/info-panel.uikitml'),
    type: AssetType.UIKitML,
    name: 'Info Panel',
  },
  'place-menu': {
    url: publicAssetUrl('ui/place-menu.uikitml'),
    type: AssetType.UIKitML,
    name: 'Place Menu',
  },
});
