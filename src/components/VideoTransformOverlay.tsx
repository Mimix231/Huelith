import { useRef, type PointerEvent } from 'react';
import { clipCrop, fittedSize, footagePlacement, motionCovers } from '../editor/video/clip-layout';
import {sourceTimeAt} from '../editor/video/clip-timing';
import {manualTransformAt,transformAt,transformEdit} from '../editor/video/motion';
import type { VideoAsset, VideoClip } from '../editor/video/timeline';

type Transform = ReturnType<typeof transformAt>;
type Mode = 'move' | 'scale' | 'rotate' | 'width';
type Props = {
  clip: VideoClip;
  asset?: VideoAsset;
  time: number;
  width: number;
  height: number;
  fps?:number;
  autoKey?:boolean;
  showGuide?:boolean;
  onEditText?:()=>void;
  alignTo?:{x:number;y:number}[];
  onChange: (patch: Partial<VideoClip>) => void;
  onFinish: (cancelled: boolean) => void;
};

const limit = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export default function VideoTransformOverlay({ clip, asset, time, width, height, fps=30,autoKey=false,showGuide,onEditText,alignTo=[], onChange, onFinish }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{id:number;mode:Mode;initial:Transform;base:Transform;x:number;y:number;rect:DOMRect}|null>(null);
  const local = Math.max(0, time - clip.start);
  const transform = transformAt(clip, local);
  const crop = clipCrop(asset, clip);
  const sourceTime=sourceTimeAt(clip,local);
  const smart=asset&&clip.smart?.revision===(asset.revision??0)?clip.smart:undefined;
  const fitted = asset?.width && asset.height ? fittedSize(asset.width * crop.width, asset.height * crop.height, width, height,
    smart?.reframe&&smart.track&&motionCovers(smart.track.points,sourceTime)?'fill':clip.fit)
    : { width: width * .75, height: height * (clip.title ? .23 : .75) };
  const placement=footagePlacement(smart,sourceTime,width,height,fitted.width*transform.scale,fitted.height*transform.scaleY,crop,!!clip.flipX,!!clip.flipY);
  const dw=fitted.width*transform.scale*placement.scale,dh=fitted.height*transform.scaleY*placement.scale;
  const tx=placement.tracked?((placement.tracked.x-crop.x)/crop.width-.5)*dw*(clip.flipX?-1:1)+placement.x:0;
  const ty=placement.tracked?((placement.tracked.y-crop.y)/crop.height-.5)*dh*(clip.flipY?-1:1)+placement.y:0;
  const tw=(smart?.track?.box.width??0)/crop.width*dw,th=(smart?.track?.box.height??0)/crop.height*dh;
  const centerX = width * (.5 + transform.x), centerY = height * (.5 + transform.y);
  const rx = Math.min(width * .49, (onEditText?width*(clip.textStyle?.width??.75):fitted.width) * transform.scale / 2);
  const ry = Math.min(height * .42, fitted.height * transform.scaleY / 2);
  const handle = Math.max(4, Math.min(width, height) * .018);

  function start(event: PointerEvent<SVGElement>, mode: Mode) {
    if (event.button !== 0 || !svg.current || drag.current) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {mode,id:event.pointerId,initial:transform,base:manualTransformAt(clip,local),x:event.clientX,y:event.clientY,rect:svg.current.getBoundingClientRect()};
  }

  function move(event: PointerEvent<SVGElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const { initial, base, rect } = current;
    const dx = (event.clientX - current.x) / rect.width, dy = (event.clientY - current.y) / rect.height;
    const cx = rect.left + rect.width * (.5 + initial.x), cy = rect.top + rect.height * (.5 + initial.y);
    const x = current.x - cx, y = current.y - cy;
    if(current.mode==='width'){
      const ratio=Math.abs(event.clientX-cx)/Math.max(1,Math.abs(x));
      onChange({textStyle:{...clip.textStyle,width:limit(Math.max(.01,Math.abs(x)*2/(rect.width*initial.scale))*ratio,.12,.98)}});
      return;
    }
    let patch: Partial<Transform>;
    if (current.mode === 'move') {
      function snap(value:number,axis:'x'|'y',tolerance:number){
        if(event.altKey)return value;
        return [0,-.4,.4,...alignTo.map(item=>item[axis])].find(target=>Math.abs(value-target)<tolerance)??value;
      }
      patch={x:limit(base.x+snap(initial.x+dx,'x',6/rect.width)-initial.x,-2,2),
        y:limit(base.y+snap(initial.y+dy,'y',6/rect.height)-initial.y,-2,2)};
    }
    else if (current.mode === 'scale') {
      const ratio = Math.hypot(event.clientX - cx, event.clientY - cy) / Math.max(1, Math.hypot(x, y));
      patch={scale:limit(base.scale*ratio,.05,8)};
      if(clip.scaleY!==undefined||clip.keyframes?.some(key=>key.parameter==='scaleY'))patch.scaleY=limit(base.scaleY*ratio,.05,8);
    } else {
      const angle = (Math.atan2(event.clientY - cy, event.clientX - cx) - Math.atan2(y, x)) * 180 / Math.PI;
      patch={rotation:limit(base.rotation+((angle+540)%360)-180,-3600,3600)};
    }
    onChange(transformEdit(clip,patch,local,fps,autoKey));
  }

  function finish(event: PointerEvent<SVGElement>) {
    if (drag.current?.id !== event.pointerId) return;
    const cancelled = event.type !== 'pointerup';
    if (!cancelled && (event.clientX !== drag.current.x || event.clientY !== drag.current.y)) move(event);
    drag.current = null;
    onFinish(cancelled);
  }

  const handlers = { onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish };
  return <svg className="hv-transform-overlay" ref={svg} viewBox={`0 0 ${width} ${height}`} aria-label="Clip transform handles">
    <g transform={`translate(${centerX} ${centerY}) rotate(${transform.rotation})`}>
      <rect className="hv-transform-move" x={-rx} y={-ry} width={rx * 2} height={ry * 2} fill="transparent"
        stroke="#cfb7ff" vectorEffect="non-scaling-stroke" onPointerDown={event => start(event, 'move')} onDoubleClick={onEditText} {...handlers} />
      {showGuide&&placement.tracked&&<rect x={tx-tw/2} y={ty-th/2} width={tw} height={th} stroke="#79f4d7" strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke" fill="none" pointerEvents="none"><title>{`Track confidence ${Math.round(placement.tracked.confidence*100)}%`}</title></rect>}
      <line x1={0} x2={0} y1={-ry} y2={-ry - handle * 1.6} stroke="#cfb7ff" vectorEffect="non-scaling-stroke" />
      <circle className="hv-transform-rotate" cx={0} cy={-ry - handle * 1.8} r={handle * .58} fill="#cfb7ff"
        onPointerDown={event => start(event, 'rotate')} {...handlers} />
      {[-1, 1].flatMap(x => [-1, 1].map(y => <rect key={`${x},${y}`} className="hv-transform-scale" x={x * rx - handle / 2}
        y={y * ry - handle / 2} width={handle} height={handle} fill="#cfb7ff" onPointerDown={event => start(event, 'scale')} {...handlers} />))}
      {onEditText&&[-1,1].map(side=><rect key={side} className="hv-transform-width" x={side*rx-handle*.35} y={-handle}
        width={handle*.7} height={handle*2} fill="#cfb7ff" onPointerDown={event=>start(event,'width')} {...handlers}><title>Resize text box</title></rect>)}
    </g>
  </svg>;
}
