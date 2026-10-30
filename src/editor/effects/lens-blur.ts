import type {Effect} from '../types';
import {renderSpatialCpu} from './spatial-cpu';
/** Spatially varying polygonal aperture blur, with editable focus and blades. */
export const lensBlurCpu=(source:HTMLCanvasElement,effect:Effect)=>renderSpatialCpu(source,effect,'lens');
