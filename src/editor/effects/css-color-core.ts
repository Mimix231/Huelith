/** Browser-native color matrix operations. A Canvas2D filter is the
 * authoritative implementation for these seven standardized adjustments;
 * they need no 2-million-pixel JavaScript readback loop.
 */
import {createSurface} from '../canvas-surface';
export function nativeFilter(source:HTMLCanvasElement,css:string):HTMLCanvasElement{
 const output=createSurface();output.width=source.width;output.height=source.height;
 const painter=output.getContext('2d');if(!painter)throw new Error('Canvas2D unavailable');
 painter.filter=css;painter.drawImage(source,0,0);painter.filter='none';return output;
}
