import type {VideoAsset} from './timeline';

export type LocalMediaEntry=Pick<VideoAsset,'path'|'name'|'kind'|'duration'>;
const key='huelith-local-video-media-v1';

export function readLocalMedia():LocalMediaEntry[]{
  try{
    const items:unknown=JSON.parse(localStorage.getItem(key)??'[]');
    return Array.isArray(items)?items.filter(item=>item&&typeof item.name==='string'&&typeof item.path==='string'
      &&['video','image','audio'].includes(item.kind)&&Number.isFinite(item.duration)&&item.duration>=0).slice(0,256):[];
  }catch{return [];}
}

export function toggleLocalMedia(asset:LocalMediaEntry):LocalMediaEntry[]{
  const items=readLocalMedia(),index=items.findIndex(item=>item.path===asset.path);
  const next=index>=0?items.filter((_,i)=>i!==index):[{
    path:asset.path,name:asset.name,kind:asset.kind,duration:asset.duration,
  },...items].slice(0,256);
  localStorage.setItem(key,JSON.stringify(next));return next;
}
