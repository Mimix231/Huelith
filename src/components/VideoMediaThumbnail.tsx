import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {Audiotrack,ImageOutlined,MovieOutlined} from '@mui/icons-material';
import type {VideoAsset} from '../editor/video/timeline';
import {loadRasterMedia,GifSource} from '../editor/video/raster-media';
import {nativeSingleSourcePlan,renderNativeTimelinePng} from '../editor/video/native-frame-renderer';
import {resolvedAssetPath} from '../editor/video/library';

/** Native video thumbnails. Browser image elements display PNGs rendered by
 * Rust; there is no HTMLVideoElement, seeking, or WebView frame renderer.
 */
export default function VideoMediaThumbnail({asset,url}:{asset:VideoAsset;url?:string}){
  const [raster,setRaster]=useState(''),[poster,setPoster]=useState('');
  const [sample,setSample]=useState(0),[visible,setVisible]=useState(false);
  const surface=useRef<HTMLSpanElement|null>(null);
  useEffect(()=>{let active=true;setRaster('');
    if(url&&/\.(tga|gif)$/i.test(asset.name))void loadRasterMedia(url,asset.name).then(value=>{
      if(active&&value)setRaster((value instanceof GifSource?value.frame(0):value).toDataURL());
    }).catch(()=>{});return()=>{active=false;};
  },[url,asset.name]);
  useEffect(()=>{
    if(asset.kind!=='video'||!url)return;
    const node=surface.current;if(!node)return;
    if(!('IntersectionObserver'in window)){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'100px'});
    observer.observe(node);return()=>observer.disconnect();
  },[asset.kind,url]);
  useEffect(()=>{
    if(asset.kind!=='video'||!url||!visible)return;
    let active=true,urlValue='';
    const timer=setTimeout(()=>{void(async()=>{
      try{
        const path=await resolvedAssetPath(asset);
        const bytes=await renderNativeTimelinePng(nativeSingleSourcePlan(path,'video',sample,160,90),0);
        if(!active)return;
        urlValue=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'image/png'}));
        setPoster(urlValue);
      }catch{/* No browser video fallback: show video icon when native thumbnail fails. */}
    })();},sample===0?40:125);
    return()=>{active=false;clearTimeout(timer);if(urlValue)URL.revokeObjectURL(urlValue);};
  },[asset.path,asset.libraryId,asset.revision,asset.kind,url,sample,visible]);
  function scrub(event:PointerEvent<HTMLElement>){
    if(!asset.duration||event.pointerType!=='mouse'||event.buttons)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const fraction=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(rect.width,1)));
    setSample(Math.round(fraction*Math.max(0,asset.duration-.001)*2)/2);
  }
  if(asset.crop&&url&&asset.kind==='image')return <span className="hv-media-thumbnail hv-checker" style={{backgroundImage:`url("${url}")`,backgroundSize:`${100/asset.crop.width}% ${100/asset.crop.height}%`,backgroundPosition:`${asset.crop.x/(1-asset.crop.width)*100}% ${asset.crop.y/(1-asset.crop.height)*100}%`}}/>;
  if(asset.kind==='image'&&(raster||url&&!/\.tga$/i.test(asset.name)))return <img className="hv-media-thumbnail" src={raster||url} alt="" loading="lazy"/>;
  if(asset.kind==='video')return <span ref={surface} className="hv-media-thumbnail hv-kind-video" onPointerMove={scrub}>
    {poster?<img src={poster} alt="" draggable={false} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<MovieOutlined/>}
  </span>;
  return <span className={`hv-media-thumbnail hv-kind-${asset.kind}`}>{asset.kind==='audio'?<Audiotrack/>:<ImageOutlined/>}</span>;
}
