import type {Effect} from '../types';
import {renderSpatialCpu} from './spatial-cpu';
/** Full-resolution directional point-spread motion blur, not a generic Gaussian. */
export const motionBlurCpu=(source:HTMLCanvasElement,effect:Effect)=>renderSpatialCpu(source,effect,'motion');
