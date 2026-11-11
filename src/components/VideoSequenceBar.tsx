import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import type { VideoProject } from '../editor/project-hub';
import { addLinkedVariant, addSequence, MAIN_SEQUENCE, switchSequence } from '../editor/video/sequences';

type Props = {
  project: VideoProject;
  path: readonly string[];
  selectedCount: number;
  onChange: (project: VideoProject) => void;
  onUp: () => void;
  onCompound: () => void;
  onError: (message: string) => void;
};

export default function VideoSequenceBar({ project, path, selectedCount, onChange, onUp, onCompound, onError }: Props) {
  const current = project.sequence ?? MAIN_SEQUENCE;
  const [action, setAction] = useState<'new' | 'copy' | 'rename'>();
  const [name, setName] = useState('');
  const count = (project.sequences?.length ?? 0) + 1;

  function start(mode: typeof action) {
    setName(mode === 'rename' ? current.name : mode === 'copy' ? `${current.name} copy`.slice(0, 120) : `Timeline ${count + 1}`);
    setAction(mode);
  }

  function finish() {
    if (!action || !name.trim()) return;
    try {
      onChange(action === 'rename' ? { ...project, sequence: { ...current, name: name.trim() } }
        : addSequence(project, name, action === 'copy'));
      setAction(undefined);
    } catch (error) { onError(String(error)); }
  }

  return <div className="hv-sequence-bar">
    {!!path.length && <button onClick={onUp}>‹ Parent timeline</button>}
    <label className="hv-sequence-picker"><span>Sequence</span>
      <select aria-label="Active sequence" value={current.id} onChange={event => onChange(switchSequence(project, event.target.value))}>
        <option value={current.id}>{current.name}</option>
        {(project.sequences ?? []).map(sequence => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}
      </select>
    </label>
    <select aria-label="Sequence actions" value="" onChange={event=>{
      const mode=event.target.value;
      if(mode==='portrait'||mode==='square'){
        try{onChange(addLinkedVariant(project,mode));}catch(error){onError(String(error));}
      }else start(mode as typeof action);
    }}>
      <option value="">Manage</option><option value="new" disabled={count >= 32}>New sequence</option>
      <option value="copy" disabled={count >= 32}>Duplicate sequence</option><option value="rename">Rename sequence</option>
      <option value="portrait" disabled={count>=32||!!path.length}>Linked vertical variant</option>
      <option value="square" disabled={count>=32||!!path.length}>Linked square variant</option>
    </select>
    {(project.linkedVariants?.[current.id]||Object.values(project.linkedVariants??{}).includes(current.id))&&<small>Linked cuts</small>}
    <button disabled={selectedCount < 2 || path.length >= 6} onClick={onCompound}>Make compound</button>
    {!!path.length && <small>Editing compound</small>}
    <Dialog open={!!action} onClose={() => setAction(undefined)} fullWidth maxWidth="xs">
      <DialogTitle>{action === 'copy' ? 'Duplicate sequence' : action === 'rename' ? 'Rename sequence' : 'New sequence'}</DialogTitle>
      <DialogContent><TextField label="Sequence name" autoFocus fullWidth value={name} slotProps={{ htmlInput: { maxLength: 120 } }}
        onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') finish(); }} sx={{ mt: 1 }} /></DialogContent>
      <DialogActions><Button onClick={() => setAction(undefined)}>Cancel</Button><Button disabled={!name.trim()} onClick={finish}>Save</Button></DialogActions>
    </Dialog>
  </div>;
}
