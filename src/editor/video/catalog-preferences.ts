const storage='huelith-video-catalog-v1';
export const catalogChanged='huelith-video-catalog-changed';
type CatalogPreferences={pinned:string[];recent:string[]};
export function readCatalogPreferences():CatalogPreferences{
  try{
    const value=JSON.parse(localStorage.getItem(storage)??'null') as CatalogPreferences|null;
    if(value&&Array.isArray(value.pinned)&&Array.isArray(value.recent))return value;
  }catch{/* Library views are usable without local storage. */}
  return {pinned:[],recent:[]};
}
function save(preferences:CatalogPreferences){
  try{localStorage.setItem(storage,JSON.stringify(preferences));window.dispatchEvent(new Event(catalogChanged));}
  catch{/* The library remains usable. */}
}
export function toggleCatalogPin(key:string){
  const current=readCatalogPreferences();
  const pinned=current.pinned.includes(key)?current.pinned.filter(item=>item!==key):[key,...current.pinned].slice(0,350);
  save({...current,pinned});
}
export function noteCatalogUse(key:string){
  const current=readCatalogPreferences();
  save({...current,recent:[key,...current.recent.filter(item=>item!==key)].slice(0,30)});
}
