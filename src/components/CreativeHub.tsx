import { useEffect, useMemo, useState } from 'react';
import { Animation, ArrowForward, DeleteOutline, ImageOutlined, MovieCreationOutlined, Search, Sort, FolderOpen, AutoAwesome, PlayArrow } from '@mui/icons-material';
import { RECENTS_CHANGED, readRecentProjects, removeRecentProject, type HubProjectKind, type RecentProject } from '../editor/project-hub';
import './CreativeHub.css';

type Props = {
  onCreate: (kind: HubProjectKind) => void;
  onOpen: () => void;
  onOpenRecent: (recent: RecentProject) => void;
  onOpenVideo: () => void;
  onResume?: () => void;
};
const apps = [
  { kind: 'image', title: 'Image Editor', sub: 'Paint, design and transform', description: 'Raster, vector, typography, gradients and creative effects.', symbol: <ImageOutlined fontSize="inherit"/>, tag: 'ARTWORK' },
  { kind: 'animation', title: 'Animation Studio', sub: 'Bring each frame to life', description: 'Draw frame-by-frame with onion skins, exposure and motion.', symbol: <Animation fontSize="inherit"/>, tag: 'MOTION' },
  { kind: 'video', title: 'Video Editor', sub: 'Cut, arrange, tell your story', description: 'A clean multi-track editor for videos, music and titles.', symbol: <MovieCreationOutlined fontSize="inherit"/>, tag: 'VIDEO WORKSPACE' },
] as const;
function timeLabel(value: number): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Recent' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export default function CreativeHub({ onCreate, onOpen, onOpenRecent, onOpenVideo, onResume }: Props) {
  const [recents, setRecents] = useState(readRecentProjects);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<HubProjectKind | 'all'>('all');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  useEffect(() => {
    const refresh = () => setRecents(readRecentProjects());
    window.addEventListener(RECENTS_CHANGED, refresh);
    return () => window.removeEventListener(RECENTS_CHANGED, refresh);
  }, []);
  const matching = useMemo(() => recents.filter(item => (kind === 'all' || item.kind === kind)
    && item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.openedAt - a.openedAt), [recents, search, kind, sort]);
  return <main className="creative-hub" aria-label="Huelith Creative Hub">
    <div className="hub-topline"><div><div className="hub-eyebrow">HUELITH · CREATIVE SUITE</div>
      <h1>Make something extraordinary<span>.</span></h1>
      <p>Three creative spaces. Your work stays yours. Forever free and open source.</p></div>
      <div className="hub-top-actions">{onResume && <button className="hub-open-btn hub-resume" onClick={onResume}><PlayArrow fontSize="small"/> Resume workspace</button>}<button className="hub-open-btn" onClick={onOpen}><FolderOpen fontSize="small"/> Open project</button></div></div>
    <div className="hub-featured" role="region" aria-label="Create your next project">
      <div className="hub-featured-copy"><span><AutoAwesome fontSize="small"/> A CANVAS FOR EVERY IDEA</span>
        <h2>Start with a spark.<br/>Build something brilliant.</h2>
        <p>Choose your workspace below and keep creating without limits.</p></div>
      <div className="hub-featured-art" aria-hidden="true"><span className="hub-orbit hub-orbit-one"/><span className="hub-orbit hub-orbit-two"/><span className="hub-feature-glyph">✦</span></div>
    </div>
    <section aria-label="Creative workspaces" className="hub-workspaces"><div className="hub-section-head"><h2>Choose your workspace</h2><span>CRAFTED FOR CREATORS</span></div>
      <div className="hub-app-grid">{apps.map(app => <button key={app.kind} className={`hub-app-card hub-${app.kind}`} onClick={() => onCreate(app.kind)}>
        <span className="hub-app-symbol">{app.symbol}</span><span className="hub-app-text"><span className="hub-app-tag">{app.tag}</span><strong>{app.title}</strong><em>{app.sub}</em><small>{app.description}</small></span>
        <span className="hub-app-arrow"><ArrowForward fontSize="small"/></span>
      </button>)}</div>
    </section>
    <section aria-label="Recent projects" className="hub-recents"><div className="hub-section-head"><h2>Recent projects <small>{recents.length}</small></h2>
        <div className="hub-recent-tools"><label className="hub-search"><Search fontSize="small"/><input aria-label="Search recent projects" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a project…"/></label>
          <select aria-label="Filter project type" value={kind} onChange={event=>setKind(event.target.value as HubProjectKind|'all')}><option value="all">All types</option><option value="image">Images</option><option value="animation">Animations</option><option value="video">Videos</option></select>
          <button className="hub-sort" onClick={()=>setSort(s=>s==='recent'?'name':'recent')} title={`Sort by ${sort==='recent'?'name':'recent date'}`}><Sort fontSize="small"/> {sort==='recent'?'Recent':'Name'}</button></div></div>
      {matching.length ? <div className="hub-recent-grid">{matching.map(item => <article className="hub-project-card" key={item.id}>
        <button className={`hub-project-cover cover-${item.kind}`} onClick={()=>onOpenRecent(item)} aria-label={`Open ${item.name}`}>
          {item.thumbnail ? <img src={item.thumbnail} alt=""/> : <span className="hub-project-placeholder" aria-hidden="true">{item.kind==='image'?<ImageOutlined/>:item.kind==='animation'?<Animation/>:<MovieCreationOutlined/>}</span>}
          <span className="hub-project-type">{item.kind}</span>
        </button><div className="hub-project-info"><button title={item.name} onClick={()=>onOpenRecent(item)}>{item.name}</button>
          <div>{item.width} × {item.height}{item.fps ? ` · ${item.fps} fps` : ''}</div><time>{timeLabel(item.openedAt)}</time></div>
        <button className="hub-project-remove" title="Remove from recent projects (does not delete file)" aria-label={`Remove ${item.name} from recents`} onClick={()=>{removeRecentProject(item.id);setRecents(readRecentProjects());}}><DeleteOutline fontSize="small"/></button>
      </article>)}</div> : <div className="hub-empty"><span>✦</span><strong>{recents.length?'No matching projects':'Your next masterpiece starts here'}</strong><p>{recents.length?'Try another search or project type.':'Saved projects will appear here for easy access.'}</p>{!recents.length&&<button onClick={onOpenVideo}>Open a video project</button>}</div>}
    </section>
    <footer className="hub-footer">Huelith · Create without limits <span>v0.3-alpha · Creative Suite Preview</span></footer>
  </main>;
}
