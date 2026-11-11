import {useRef,type PointerEvent} from 'react';
import {clipCrop,fittedSize,footagePlacement,maskAt,maskValue,motionCovers} from '../editor/video/clip-layout';
import {sourceTimeAt} from '../editor/video/clip-timing';
import {transformAt} from '../editor/video/motion';
import {putKey} from '../editor/video/parameter-keys';
import {motionAt} from '../editor/video/smart-footage';
import type {ClipMask,MaskParameter} from '../editor/video/studio-types';
import type {VideoAsset,VideoClip} from '../editor/video/timeline';
import {maskWithValue} from './VideoMaskControls';
import type {KeyClock} from './VideoKeyedValue';

type Mode='move'|'resize'|'rotate';
type Drag={id:number;mode:Mode;matrix:DOMMatrix;first:DOMPoint;mask:ClipMask;cx:number;cy:number};
const cap=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export default function VideoMaskOverlay({clip,asset,clock,width,height,onChange,onFinish,grade}: {
  clip:VideoClip;asset?:VideoAsset;clock:KeyClock;width:number;height:number;grade?:boolean;
  onChange:(mask:ClipMask)=>void;onFinish:(cancel:boolean)=>void;
}){
  const group=useRef<SVGGElement>(null),rotated=useRef<SVGGElement>(null),drag=useRef<Drag|undefined>(undefined);
  const authored=grade?clip.grade?.mask:clip.mask;
  if(!authored)return null;
  const mask=maskAt(authored,clock.time),pose=transformAt(clip,clock.time),crop=clipCrop(asset,clip);
  const sourceTime=sourceTimeAt(clip,clock.time),smart=asset&&clip.smart?.revision===(asset.revision??0)?clip.smart:undefined;
  const fitted=fittedSize((asset?.width??width)*crop.width,(asset?.height??height)*crop.height,width,height,
    smart?.reframe&&smart.track&&motionCovers(smart.track.points,sourceTime)?'fill':clip.fit);
  const placement=footagePlacement(smart,sourceTime,width,height,fitted.width*pose.scale,fitted.height*pose.scaleY,crop,!!clip.flipX,!!clip.flipY);
  const w=grade?width:fitted.width*pose.scale*placement.scale,h=grade?height:fitted.height*pose.scaleY*placement.scale;
  const track=mask.followTrack&&smart?.track&&motionCovers(smart.track.points,sourceTime)?smart.track:undefined;
  const tracked=track?motionAt(track.points,sourceTime):undefined;
  const dx=track&&tracked?(tracked.x-track.points[0].x)/crop.width:0,dy=track&&tracked?(tracked.y-track.points[0].y)/crop.height:0;
  const left=(mask.region.x+dx-.5)*w,top=(mask.region.y+dy-.5)*h,spanX=mask.region.width*w,spanY=mask.region.height*h;
  const cx=left+spanX/2,cy=top+spanY/2,r=Math.max(7,Math.min(width,height)*.014);

  function begin(event:PointerEvent<SVGElement>,mode:Mode){
    if(event.button!==0||!clock.active||drag.current)return;
    const screen=(mode==='resize'?rotated:group).current?.getScreenCTM();
    if(!screen)return;
    const matrix=screen.inverse();
    event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,mode,matrix,first:new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix),mask,cx,cy};
  }
  function move(event:PointerEvent<SVGElement>){
    const active=drag.current;
    if(active?.id!==event.pointerId)return;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(active.matrix);
    const x=(point.x-active.first.x)/w,y=(point.y-active.first.y)/h,region=active.mask.region;
    const radians=(p:DOMPoint)=>Math.atan2(p.y-active.cy,p.x-active.cx);
    const values:Partial<Record<MaskParameter,number>>=active.mode==='rotate'
      ?{rotation:cap((active.mask.rotation??0)+(radians(point)-radians(active.first))*180/Math.PI,-3600,3600)}
      :active.mode==='resize'?{width:cap(region.width+x,.001,1-region.x),height:cap(region.height+y,.001,1-region.y)}
      :{x:cap(region.x+x,0,1-region.width),y:cap(region.y+y,0,1-region.height)};
    let next=authored!;
    for(const [name,value] of Object.entries(values) as [MaskParameter,number][]){
      const lane=next.keys?.[name]??[];
      if(clock.auto||lane.length){
        const seeded=lane.length||clock.time<.5/clock.fps?lane:[{time:0,value:maskValue(next,name)}];
        next={...next,keys:{...next.keys,[name]:putKey(seeded,clock.time,value,clock.fps)}};
      }else next=maskWithValue(next,name,value);
    }
    onChange(next);
  }
  function end(event:PointerEvent<SVGElement>,cancel:boolean){
    if(drag.current?.id!==event.pointerId)return;
    if(!cancel)move(event);
    drag.current=undefined;onFinish(cancel);
  }
  const events={onPointerMove:move,onPointerUp:(event:PointerEvent<SVGElement>)=>end(event,false),
    onPointerCancel:(event:PointerEvent<SVGElement>)=>end(event,true),onLostPointerCapture:(event:PointerEvent<SVGElement>)=>end(event,true)};
  const transform=grade?`translate(${width/2} ${height/2})`:
    `translate(${width*(.5+pose.x)} ${height*(.5+pose.y)}) rotate(${pose.rotation}) translate(${placement.x} ${placement.y}) scale(${clip.flipX?-1:1} ${clip.flipY?-1:1})`;
  return <svg className="hv-transform-overlay hv-mask-overlay" viewBox={`0 0 ${width} ${height}`} aria-label="Mask handles">
    <g ref={group} transform={transform}><g ref={rotated} transform={`rotate(${mask.rotation??0} ${cx} ${cy})`}>
      <g className="hv-mask-outline" onPointerDown={event=>begin(event,'move')} {...events}>
        {mask.shape==='ellipse'?<ellipse cx={cx} cy={cy} rx={spanX/2} ry={spanY/2}/>:mask.shape==='polygon'
          ?<polygon points={mask.vertices?.map(([x,y])=>`${left+x*spanX},${top+y*spanY}`).join(' ')}/>
          :<rect x={left} y={top} width={spanX} height={spanY}/>}
      </g>
      <circle className="hv-mask-handle" cx={left+spanX} cy={top+spanY} r={r} onPointerDown={event=>begin(event,'resize')} {...events}/>
      <line x1={cx} x2={cx} y1={top} y2={top-r*3}/>
      <circle className="hv-mask-handle" cx={cx} cy={top-r*3} r={r} onPointerDown={event=>begin(event,'rotate')} {...events}/>
    </g></g>
  </svg>;
}
