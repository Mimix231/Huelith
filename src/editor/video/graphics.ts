import type {VideoShape} from './studio-types';

export const VIDEO_SHAPES:readonly {name:string;shape:VideoShape}[]=[
  {name:'Lower-third plate',shape:{kind:'rectangle',width:.43,height:.12,fill:'#583b8d',stroke:'#c8a2ff',strokeWidth:.002}},
  {name:'Spotlight circle',shape:{kind:'ellipse',width:.2,height:.2,fill:'#4f3c82',stroke:'#c6b1ff',strokeWidth:.003}},
  {name:'Diamond badge',shape:{kind:'diamond',width:.15,height:.23,fill:'#8754b4',stroke:'#e8d0ff',strokeWidth:.003}},
  {name:'Pointer arrow',shape:{kind:'arrow',width:.26,height:.14,fill:'#63dcc7',stroke:'#143b42',strokeWidth:.003}},
  {name:'Star burst',shape:{kind:'star',width:.21,height:.32,fill:'#e4b35d',stroke:'#ffead1',strokeWidth:.003}},
];

export function drawVideoShape(ctx:CanvasRenderingContext2D,shape:VideoShape,width:number,height:number,scale:number){
  const w=shape.width*width*scale,h=shape.height*height*scale;
  ctx.beginPath();
  if(shape.kind==='ellipse')ctx.ellipse(0,0,Math.min(w,h)/2,Math.min(w,h)/2,0,0,Math.PI*2);
  else if(shape.kind==='rectangle')ctx.roundRect(-w/2,-h/2,w,h,Math.min(w,h)*.12);
  else{
    const points=shape.kind==='diamond'?[[0,-.5],[.5,0],[0,.5],[-.5,0]]:
      shape.kind==='arrow'?[[-.5,-.17],[.13,-.17],[.13,-.5],[.5,0],[.13,.5],[.13,.17],[-.5,.17]]:
      Array.from({length:10},(_,index)=>{
        const angle=index*Math.PI/5-Math.PI/2,radius=index%2?.22:.5;
        return [Math.cos(angle)*radius,Math.sin(angle)*radius];
      });
    points.forEach(([x,y],index)=>{if(index)ctx.lineTo(x*w,y*h);else ctx.moveTo(x*w,y*h);});ctx.closePath();
  }
  ctx.fillStyle=shape.fill;ctx.fill();
  if(shape.strokeWidth){ctx.strokeStyle=shape.stroke;ctx.lineWidth=shape.strokeWidth*width*scale;ctx.lineJoin='round';ctx.stroke();}
}
