import { useEffect, useRef, useState } from 'react';
import { Add, Pause, PlayArrow } from '@mui/icons-material';
import type {StartVideoCardDrag} from './useVideoLibraryDrag';
import { readRecording, searchRecordings, type Recording } from '../editor/video/audio-catalogue';

type Props = {
  query: string;
  category: string;
  playing: boolean;
  busy: boolean;
  onAdd: (recording: Recording) => void;
  onCardDrag:StartVideoCardDrag;
  onError: (message: string) => void;
};

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export default function VideoAudioCatalogue({ query, category, playing, busy, onAdd, onCardDrag, onError }: Props) {
  const [items, setItems] = useState<Recording[]>([]);
  const [next, setNext] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [duration, setDuration] = useState('all');
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef('');
  const audition = useRef<AbortController | undefined>(undefined);

  function stopPreview() {
    audition.current?.abort();
    audition.current = undefined;
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute('src');
      audio.current.load();
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = '';
    setPreview('');
  }

  useEffect(() => {
    setItems([]);
    setPage(0);
    setNext(undefined);
    stopPreview();
  }, [query, category, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(() => {
      void searchRecordings(query, category, page, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setItems(old => [...new Map([...old, ...result.recordings].map(item => [item.id, item])).values()]);
        setNext(result.next);
      }).catch(error => {
        if (!controller.signal.aborted) setError(String(error));
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 300);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, category, page, retry]);

  useEffect(() => { if (playing) stopPreview(); }, [playing]);
  useEffect(() => () => {
    audition.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  async function play(item: Recording) {
    const alreadyPlaying = preview === item.id;
    stopPreview();
    if (alreadyPlaying) return;
    const controller = new AbortController();
    audition.current = controller;
    setPreview(item.id);
    const element = audio.current;
    if (!element) return;
    try {
      element.src = item.url;
      element.volume = .65;
      try {
        await element.play();
      } catch {
        controller.signal.throwIfAborted();
        const blob = await readRecording(item, controller.signal);
        controller.signal.throwIfAborted();
        objectUrl.current = URL.createObjectURL(blob);
        element.src = objectUrl.current;
        await element.play();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      stopPreview();
      onError(`Audio preview failed. ${String(error)}`);
    }
  }

  const shown = items.filter(item => duration === 'all' || (duration === 'short' ? item.duration <= 30 : item.duration > 30));
  return <>
    <p className="hv-library-section">WIKIMEDIA COMMONS RECORDINGS</p>
    <div className="hv-tool-panel hv-audio-search-tools">
      <label className="hv-field">Duration
        <select value={duration} onChange={event => setDuration(event.target.value)}>
          <option value="all">Any length</option><option value="short">30 seconds or less</option><option value="long">Over 30 seconds</option>
        </select>
      </label>
      <small>Try a mood or genre like jazz, ambient, or orchestral.</small>
    </div>
    <audio ref={audio} onEnded={stopPreview} preload="none" />
    <div className="hv-audio-list">{shown.map(item => <div className={`hv-audio-item${!busy?' hv-draggable-card':''}${preview === item.id ? ' is-playing' : ''}`} key={item.id}
      onPointerDown={event=>{
        if(!busy&&!(event.target as Element).closest('button,a'))onCardDrag(event,{kind:'recording',recording:item,stopPreview},item.title);
      }}>
      <button className="hv-audio-audition" aria-label={`${preview === item.id ? 'Pause' : 'Preview'} ${item.title}`}
        disabled={playing} onClick={() => void play(item)}>{preview === item.id ? <Pause/> : <PlayArrow/>}</button>
      <div className="hv-audio-info">
        <b data-hint={item.title}>{item.title}</b>
        <small data-hint={item.creator}>{item.creator} · {clock(item.duration)}</small>
        <small><a href={item.sourceUrl} target="_blank" rel="noreferrer">Recording source</a> · <a href={item.licenseUrl} target="_blank" rel="noreferrer">{item.license}</a></small>
      </div>
      <button className="hv-audio-add hv-draggable-card" disabled={busy}
        onPointerDown={event=>onCardDrag(event,{kind:'recording',recording:item,stopPreview},item.title)} aria-label={`Download and add ${item.title}`}
        onClick={() => { stopPreview(); onAdd(item); }}><Add/></button>
    </div>)}</div>
    <div className="hv-tool-panel">
      {loading && <small role="status">Searching recordings…</small>}
      {error && <><small role="alert">{error}</small><button onClick={() => setRetry(value => value + 1)}>Retry</button></>}
      {!loading && !error && !shown.length && <small>No compatible recordings on this page. Try different keywords or look for more.</small>}
      {!loading && !error && next !== undefined && <button onClick={() => setPage(next)}>More recordings</button>}
    </div>
    <p className="hv-license-note">Downloads stay in the project media library. Huelith saves the recording source, artist and licence with each import.</p>
  </>;
}
