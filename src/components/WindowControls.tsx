import { useEffect, useState } from 'react';
import { Close, CropSquare, FilterNone, Remove } from '@mui/icons-material';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useEditor } from '../editor/store';
import { saveAllProjects } from '../editor/files';
import { guardCloseRequest } from './close-guard';

/**
 * All native close requests (custom X, Alt+F4, taskbar) pass through one
 * registered Tauri listener. No async work happens before preventDefault().
 */
export default function WindowControls() {
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const [maximized, setMaximized] = useState(false);
  const [ready, setReady] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!desktop) return;

    let disposed = false;
    let unlistenClose: (() => void) | undefined;
    let unlistenResize: (() => void) | undefined;

    async function initialize(): Promise<void> {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (disposed) return;
        const current = getCurrentWindow();

        // Install the close guard first: closing a dirty document must never
        // depend on whether a maximize-state query or resize hook succeeded.
        const removeCloseListener = await current.onCloseRequested(event => {
          if (disposed) return;
          const { tabs, textDraft } = useEditor.getState();
          guardCloseRequest(
            event,
            tabs.filter(tab => tab.dirty).length,
            textDraft !== null,
            () => setConfirmOpen(true),
          );
        });

        // StrictMode can unmount while the asynchronous registration is pending.
        // In that case remove the newly created listener immediately.
        if (disposed) {
          removeCloseListener();
          return;
        }
        unlistenClose = removeCloseListener;
        // Controls can work even if optional resize tracking cannot register.
        setReady(true);

        async function refreshMaximized(): Promise<void> {
          try {
            const value = await current.isMaximized();
            if (!disposed) setMaximized(value);
          } catch (cause) {
            if (!disposed) setError(`Could not read window state: ${String(cause)}`);
          }
        }

        await refreshMaximized();
        if (disposed) return;
        const removeResizeListener = await current.onResized(() => {
          void refreshMaximized();
        });
        if (disposed) {
          removeResizeListener();
          return;
        }
        unlistenResize = removeResizeListener;
      } catch (cause) {
        console.error('Huelith could not initialize window controls', cause);
        if (!disposed) setError(`Window controls unavailable: ${String(cause)}`);
      }
    }

    void initialize();
    return () => {
      disposed = true;
      unlistenClose?.();
      unlistenResize?.();
    };
  }, [desktop]);

  async function act(action: 'minimize' | 'toggleMaximize' | 'close'): Promise<void> {
    if (!desktop || !ready || closing) return;
    setError('');
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      // close() fires the same onCloseRequested listener as Alt+F4.
      await getCurrentWindow()[action]();
      if (action === 'toggleMaximize') {
        setMaximized(await getCurrentWindow().isMaximized());
      }
    } catch (cause) {
      console.error(`Failed to ${action} Huelith`, cause);
      setError(`Window action failed: ${String(cause)}`);
    }
  }

  async function finishClose(saveBeforeClosing: boolean): Promise<void> {
    if (closing) return;
    setClosing(true);
    setError('');
    try {
      if (saveBeforeClosing) {
        // Every dirty tab is saved, not just the active one. Cancelled save
        // dialogs or failed writes leave the desktop window open.
        const saved = await saveAllProjects();
        if (!saved) {
          setError('Close cancelled because not all documents were saved.');
          return;
        }
      }

      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      // destroy() is deliberate here: the user has already confirmed closure.
      // close() would re-enter the unsaved-document close listener.
      await getCurrentWindow().destroy();
    } catch (cause) {
      console.error('Huelith could not complete the close request', cause);
      setError(`Close failed: ${String(cause)}`);
    } finally {
      setClosing(false);
    }
  }

  return (
    <>
      <div className="huelith-window-controls" role="group" aria-label="Window controls">
        {error && <span role="alert" className="window-error" title={error}>Window error</span>}
        <button
          type="button"
          aria-label="Minimize window"
          title="Minimize"
          disabled={!ready || closing}
          onClick={() => void act('minimize')}
        >
          <Remove />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore window' : 'Maximize window'}
          title={maximized ? 'Restore' : 'Maximize'}
          disabled={!ready || closing}
          onClick={() => void act('toggleMaximize')}
        >
          {maximized ? <FilterNone /> : <CropSquare />}
        </button>
        <button
          type="button"
          className="window-close"
          aria-label="Close window"
          title="Close Huelith"
          disabled={!ready || closing}
          onClick={() => void act('close')}
        >
          <Close />
        </button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!closing) setConfirmOpen(false);
        }}
        aria-labelledby="huelith-close-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="huelith-close-title">Unsaved Huelith documents</DialogTitle>
        <DialogContent>
          Some changes have not been saved. Save all open documents before closing, discard
          unsaved changes, or continue editing.
          {error && <p role="alert" className="window-close-error">{error}</p>}
        </DialogContent>
        <DialogActions>
          <Button disabled={closing} onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button disabled={closing} onClick={() => void finishClose(false)} color="error">
            Discard &amp; Close
          </Button>
          <Button disabled={closing} variant="contained" onClick={() => void finishClose(true)}>
            Save All &amp; Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
