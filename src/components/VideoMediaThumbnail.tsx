import {useEffect,useState} from 'react';
import {Audiotrack,ImageOutlined,MovieOutlined} from '@mui/icons-material';
import type {VideoAsset} from '../editor/video/timeline';
import {loadRasterMedia,GifSource} from '../editor/video/raster-media';
export default function VideoMediaThumbnail({asset,url}:{asset:VideoAsset;url?:string}){
  const [raster,setRaster]=useState('');
  useEffect(()=>{let active=true;setRaster('');
    if(url&&/\.(tga|gif)$/i.test(asset.name))void loadRasterMedia(url,asset.name).then(value=>{
      if(active&&value)setRaster((value instanceof GifSource?value.frame(0):value).toDataURL());
    }).catch(()=>{});return()=>{active=false;};
  },[url,asset.name]);
  if(asset.crop&&url)return <span className="hv-media-thumbnail hv-checker" style={{backgroundImage:`url("${url}")`,backgroundSize:`${100/asset.crop.width}% ${100/asset.crop.height}%`,backgroundPosition:`${asset.crop.x/(1-asset.crop.width)*100}% ${asset.crop.y/(1-asset.crop.height)*100}%`}}/>;
  if(asset.kind==='image'&&(raster||url&&!/\.tga$/i.test(asset.name)))return <img className="hv-media-thumbnail" src={raster||url} alt="" loading="lazy"/>;
  if(asset.kind==='video'&&url)return <video className="hv-media-thumbnail" src={url} preload="metadata" muted playsInline aria-hidden="true"
    onPointerMove={event=>{
      const video=event.currentTarget;
      if(event.buttons||event.pointerType!=='mouse'||!Number.isFinite(video.duration)||video.seeking)return;
      const box=video.getBoundingClientRect();
      video.currentTime=Math.min(video.duration-.001,Math.max(0,(event.clientX-box.left)/box.width)*video.duration);
    }} onPointerLeave={event=>{if(Number.isFinite(event.currentTarget.duration))event.currentTarget.currentTime=0;}}/>;
  return <span className={`hv-media-thumbnail hv-kind-${asset.kind}`}>{asset.kind==='audio'?<Audiotrack/>:asset.kind==='video'?<MovieOutlined/>:<ImageOutlined/>}</span>;
}
