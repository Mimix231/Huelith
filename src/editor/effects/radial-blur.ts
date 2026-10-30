import type {Effect} from '../types';
import {renderSpatialCpu} from './spatial-cpu';
/** Rotates source samples around an editable image-space pivot. */
export const radialBlurCpu=(source:HTMLCanvasElement,effect:Effect)=>renderSpatialCpu(source,effect,'radial');
