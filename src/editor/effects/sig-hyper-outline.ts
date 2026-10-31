/** Hyper Outline delegates to Huelith's actual multi-ring signed-distance outline
 * engine rather than approximating outline by offsetting transparent copies.
 */
import {renderSubjectOutline} from '../subject-outline';
import type {Effect} from '../types';
export function renderSigHyperOutline(source:HTMLCanvasElement,effect:Effect):HTMLCanvasElement {
 if(effect.amount<=0)return source;
 return renderSubjectOutline(source,effect);
}
