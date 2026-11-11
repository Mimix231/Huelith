import type {VideoClip} from './timeline';
import type {VideoTextStyle} from './studio-types';
function wrap(ctx:CanvasRenderingContext2D,text:string,width:number):string[]{
  const lines:string[]=[];for(const paragraph of text.split('\n')){
    let line='';for(const word of paragraph.split(/\s+/)){const next=line?`${line} ${word}`:word;
      if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;
    }lines.push(line);
  }return lines.slice(0,30);
}
function spaced(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,spacing:number){
  if(!spacing){ctx.fillText(text,x,y);return;}
  const chars=Array.from(text),width=chars.reduce((sum,c)=>sum+ctx.measureText(c).width,0)+Math.max(0,chars.length-1)*spacing;
  let left=ctx.textAlign==='center'?x-width/2:ctx.textAlign==='right'?x-width:x;
  const align=ctx.textAlign;ctx.textAlign='left';for(const char of chars){ctx.fillText(char,left,y);left+=ctx.measureText(char).width+spacing;}ctx.textAlign=align;
}
/** The same editable typography is rendered by the player, thumbnails and MP4. */
export function drawVideoText(ctx:CanvasRenderingContext2D,clip:VideoClip,w:number,_h:number,referenceWidth:number,localTime=0):void{
  if(!clip.textStyle){
    const size=54*w/referenceWidth*clip.scale;ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${size}px sans-serif`;
    ctx.shadowColor='#050617';ctx.shadowBlur=9*w/referenceWidth;
    (clip.title??'').split('\n').slice(0,10).forEach((line,i,lines)=>ctx.fillText(line,0,(i-(lines.length-1)/2)*size*1.22,w*.94));return;
  }
  const s:VideoTextStyle=clip.textStyle??{},scale=w/referenceWidth*clip.scale,size=(s.fontSize??54)*scale;
  const maxWidth=w*Math.max(.05,Math.min(.98,s.width??.85))*clip.scale,padding=(s.padding??12)*scale,lineHeight=size*(s.lineHeight??1.2);
  ctx.font=`${s.italic?'italic ':''}${s.fontWeight??700} ${size}px "${s.fontFamily??'Segoe UI'}",sans-serif`;
  const text=(clip.title??'').split('\n').map(p=>p.trim().replace(/\s+/g,' ')).join('\n');
  ctx.textAlign=s.align??'center';ctx.textBaseline='middle';const lines=wrap(ctx,text,maxWidth);
  const width=Math.min(maxWidth,Math.max(0,...lines.map(line=>ctx.measureText(line).width)))+padding*2,height=lineHeight*lines.length+padding*2;
  const left=ctx.textAlign==='center'?-width/2:ctx.textAlign==='left'?-maxWidth/2-padding:maxWidth/2-width+padding;
  const x=ctx.textAlign==='center'?0:ctx.textAlign==='left'?-maxWidth/2:maxWidth/2;
  if(s.background&&s.background!=='transparent'){
    ctx.fillStyle=s.background;ctx.beginPath();ctx.roundRect(left,-height/2,width,height,Math.min(height/2,(s.radius??4)*scale));ctx.fill();
  }
  const decoration=s.decoration??'none';ctx.strokeStyle=s.secondaryColor??s.color??'#fff';ctx.lineWidth=Math.max(2,size*.05);
  if(decoration==='underline'||decoration==='overline'){const y=decoration==='underline'?height/2+4:-height/2-4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+width,y);ctx.stroke();}
  if(decoration==='side-bar'){ctx.fillStyle=s.secondaryColor??'#36d8cb';ctx.fillRect(left-9*scale,-height/2,4*scale,height);}
  if(decoration==='brackets')for(const direction of [-1,1]){const bx=direction*width/2;ctx.beginPath();ctx.moveTo(bx-direction*size*.18,-height/2);ctx.lineTo(bx,-height/2);ctx.lineTo(bx,height/2);ctx.lineTo(bx-direction*size*.18,height/2);ctx.stroke();}
  ctx.shadowColor=s.shadowColor??(clip.textStyle?'transparent':'#050617');ctx.shadowBlur=(s.shadowBlur??(clip.textStyle?0:9))*scale;
  ctx.fillStyle=s.color??'#ffffff';if(s.gradient){const gradient=ctx.createLinearGradient(0,-height/2,0,height/2);gradient.addColorStop(0,s.color??'#fff');gradient.addColorStop(1,s.secondaryColor??'#a78bfa');ctx.fillStyle=gradient;}
  const words=clip.caption?.words,active=words?.find(word=>localTime>=word.start&&localTime<word.end);
  let cursor=0,activeStart=-1,lineCursor=0;
  for(const word of words??[]){const index=text.indexOf(word.text,cursor);if(index<0)continue;if(word===active)activeStart=index;cursor=index+word.text.length;}
  let remaining=s.reveal?Math.ceil(Array.from(text).length*Math.max(0,Math.min(1,localTime/s.reveal))):Infinity;
  lines.forEach((line,i)=>{
    const y=(i-(lines.length-1)/2)*lineHeight;
    const visible=Array.from(line).slice(0,remaining).join('');
    remaining=Math.max(0,remaining-Array.from(line).length-1);
    if(s.stroke&&s.strokeWidth){ctx.strokeStyle=s.stroke;ctx.lineWidth=s.strokeWidth*scale;ctx.lineJoin='round';ctx.strokeText(visible,x,y);}
    spaced(ctx,visible,x,y,(s.letterSpacing??0)*scale);
    const lineStart=text.indexOf(line,lineCursor);lineCursor=Math.max(lineCursor,lineStart+line.length+1);
    if(active&&clip.caption?.highlight&&activeStart>=lineStart&&activeStart<lineStart+visible.length){
      const before=line.slice(0,activeStart-lineStart),textWidth=ctx.measureText(line).width;
      const start=x+(ctx.textAlign==='center'?-textWidth/2:ctx.textAlign==='right'?-textWidth:0)+ctx.measureText(before).width;
      const align=ctx.textAlign,fill=ctx.fillStyle;ctx.textAlign='left';ctx.fillStyle=clip.caption.highlight;ctx.fillText(active.text,start,y);ctx.textAlign=align;ctx.fillStyle=fill;
    }
  });
}
