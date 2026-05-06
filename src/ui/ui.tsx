import React, { useState, useEffect, useCallback, CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { IconSetMetadata, PluginMessage, UIMessage, ReleaseSummary, SelectionData } from '../types';

type PendingSwitch =
  | { kind: 'selection'; data: SelectionData }
  | { kind: 'no_selection' }
  | { kind: 'invalid_selection' };

type AppState =
  | { status: 'loading' }
  | { status: 'no_selection' }
  | { status: 'invalid_selection' }
  | {
      status: 'editing';
      nodeId: string;
      nodeName: string;
      form: IconSetMetadata;
      isDirty: boolean;
      pending: PendingSwitch | null;
      releasing: boolean;
      releaseStep: string;
    }
  | { status: 'release_done'; summary: ReleaseSummary };

const EMPTY_FORM: IconSetMetadata = { name: '', sizes: [], tags: [], categories: [] };

function post(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function applyPending(pending: PendingSwitch): AppState {
  if (pending.kind === 'selection') {
    return {
      status: 'editing',
      nodeId: pending.data.nodeId,
      nodeName: pending.data.nodeName,
      form: pending.data.metadata ?? { ...EMPTY_FORM },
      isDirty: false,
      pending: null,
      releasing: false,
      releaseStep: '',
    };
  }
  return { status: pending.kind };
}

function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' });
  const [rootFrameName, setRootFrameName] = useState('По назначению');
  const [frameNameDirty, setFrameNameDirty] = useState(false);

  useEffect(() => {
    post({ type: 'GET_SELECTION' });
    post({ type: 'GET_SETTINGS' });

    function onMessage(event: MessageEvent) {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (!msg) return;

      setState(prev => {
        switch (msg.type) {
          case 'SELECTION_DATA': {
            const incoming: PendingSwitch = { kind: 'selection', data: msg.data };
            if (prev.status === 'editing' && prev.isDirty) {
              return { ...prev, pending: incoming };
            }
            return applyPending(incoming);
          }
          case 'NO_SELECTION': {
            if (prev.status === 'editing' && prev.isDirty) {
              return { ...prev, pending: { kind: 'no_selection' } };
            }
            return { status: 'no_selection' };
          }
          case 'INVALID_SELECTION': {
            if (prev.status === 'editing' && prev.isDirty) {
              return { ...prev, pending: { kind: 'invalid_selection' } };
            }
            return { status: 'invalid_selection' };
          }
          case 'SAVE_DONE':
            if (prev.status === 'editing') return { ...prev, isDirty: false };
            return prev;
          case 'RELEASE_PROGRESS':
            if (prev.status === 'editing') return { ...prev, releaseStep: msg.step };
            return prev;
          case 'RELEASE_DONE':
            return { status: 'release_done', summary: msg.summary };
          case 'RELEASE_ERROR':
            if (prev.status === 'editing') return { ...prev, releasing: false, releaseStep: '' };
            return prev;
          case 'REMOVE_DONE':
            return { status: 'no_selection' };
          default:
            return prev;
        }
      });

      if (msg.type === 'SETTINGS_DATA') {
        setRootFrameName(msg.rootFrameName);
      }
      if (msg.type === 'SETTINGS_SAVED') {
        setFrameNameDirty(false);
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const updateForm = useCallback((patch: Partial<IconSetMetadata>) => {
    setState(prev => {
      if (prev.status !== 'editing') return prev;
      return { ...prev, form: { ...prev.form, ...patch }, isDirty: true };
    });
  }, []);

  const saveCurrentForm = useCallback(() => {
    setState(prev => {
      if (prev.status !== 'editing') return prev;
      post({ type: 'SAVE_METADATA', nodeId: prev.nodeId, metadata: prev.form });
      return { ...prev, isDirty: false };
    });
  }, []);

  const discardAndSwitch = useCallback((pending: PendingSwitch) => {
    setState(applyPending(pending));
  }, []);

  const saveAndSwitch = useCallback((pending: PendingSwitch) => {
    setState(prev => {
      if (prev.status !== 'editing') return prev;
      post({ type: 'SAVE_METADATA', nodeId: prev.nodeId, metadata: prev.form });
      return applyPending(pending);
    });
  }, []);

  const settingsSection = (
    <div style={s.settings}>
      <div style={s.label}>Overview frame name</div>
      <input
        style={s.input}
        value={rootFrameName}
        onChange={e => { setRootFrameName(e.target.value); setFrameNameDirty(true); }}
        onBlur={() => {
          if (frameNameDirty) {
            post({ type: 'SAVE_SETTINGS', rootFrameName });
            setFrameNameDirty(false);
          }
        }}
      />
    </div>
  );

  if (state.status === 'loading') {
    return <div style={s.empty}>Loading…</div>;
  }

  if (state.status === 'no_selection') {
    return (
      <div style={s.root}>
        <div style={s.empty}>Select a Component Set to begin.</div>
        {settingsSection}
      </div>
    );
  }

  if (state.status === 'invalid_selection') {
    return (
      <div style={s.root}>
        <div style={s.empty}>Select a Component Set (or a variant inside one).</div>
        {settingsSection}
      </div>
    );
  }

  if (state.status === 'release_done') {
    const { summary } = state;
    return (
      <div style={s.root}>
        <div style={s.section}>
          <div style={s.summaryTitle}>Release complete</div>
          <div style={s.summaryRow}><span>Created</span><span style={s.summaryNum}>{summary.created}</span></div>
          <div style={s.summaryRow}><span>Updated</span><span style={s.summaryNum}>{summary.updated}</span></div>
          <div style={s.summaryRow}><span>Removed</span><span style={s.summaryNum}>{summary.removed}</span></div>
          <button style={{ ...s.btn, marginTop: 12 }} onClick={() => post({ type: 'GET_SELECTION' })}>
            Back
          </button>
        </div>
        {settingsSection}
      </div>
    );
  }

  // editing
  const { nodeId, nodeName, form, isDirty, pending, releasing, releaseStep } = state;

  return (
    <div style={s.root}>
      {pending && (
        <div style={s.banner}>
          <span style={{ flex: 1 }}>Unsaved changes</span>
          <button style={s.bannerBtn} onClick={() => saveAndSwitch(pending)}>Save</button>
          <button style={s.bannerBtn} onClick={() => discardAndSwitch(pending)}>Discard</button>
        </div>
      )}

      <div style={s.section}>
        <div style={s.label}>Component Set</div>
        <div style={s.nodeNameText}>{nodeName}</div>
      </div>

      <div style={s.section}>
        <label style={s.label}>Name</label>
        <input
          style={s.input}
          value={form.name}
          onChange={e => updateForm({ name: e.target.value })}
          placeholder="Icon set name"
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Sizes (space-separated)</label>
        <input
          style={s.input}
          value={form.sizes.join(' ')}
          onChange={e => {
            const sizes = e.target.value.split(/\s+/).filter(Boolean).map(Number).filter(n => !isNaN(n));
            updateForm({ sizes });
          }}
          placeholder="16 24 32 44"
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Tags (comma-separated)</label>
        <input
          style={s.input}
          value={form.tags.join(', ')}
          onChange={e => {
            const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
            updateForm({ tags });
          }}
          placeholder="like, hand, рука"
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Categories (comma-separated)</label>
        <input
          style={s.input}
          value={form.categories.join(', ')}
          onChange={e => {
            const categories = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
            updateForm({ categories });
          }}
          placeholder="Kitchen, System"
        />
      </div>

      <div style={s.actions}>
        <button style={s.btn} onClick={saveCurrentForm} disabled={!isDirty}>
          Save
        </button>
        <button
          style={{ ...s.btn, ...s.btnDanger }}
          onClick={() => {
            if (confirm('Remove this icon set from plugin management? Its cards will be deleted.')) {
              post({ type: 'REMOVE_ICONSET', nodeId });
            }
          }}
        >
          Remove
        </button>
      </div>

      <div style={{ ...s.section, marginTop: 4 }}>
        {releasing ? (
          <div style={s.progress}>{releaseStep || 'Releasing…'}</div>
        ) : (
          <button
            style={{ ...s.btn, ...s.btnPrimary }}
            onClick={() => {
              setState(prev =>
                prev.status === 'editing' ? { ...prev, releasing: true, releaseStep: '' } : prev
              );
              post({ type: 'RELEASE' });
            }}
          >
            Release All
          </button>
        )}
      </div>

      {settingsSection}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    color: '#888',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  section: {
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    fontWeight: 600,
  },
  nodeNameText: {
    fontWeight: 600,
    fontSize: 13,
    color: '#1a1a1a',
  },
  input: {
    border: '1px solid #e0e0e0',
    borderRadius: 5,
    padding: '5px 8px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
  },
  actions: {
    display: 'flex',
    gap: 8,
    padding: '4px 12px',
  },
  btn: {
    padding: '6px 12px',
    borderRadius: 5,
    border: '1px solid #e0e0e0',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'Inter, sans-serif',
    color: '#1a1a1a',
  },
  btnPrimary: {
    background: '#0066FF',
    color: '#fff',
    border: 'none',
    width: '100%',
    fontWeight: 600,
  },
  btnDanger: {
    color: '#d93025',
    borderColor: '#fad2cf',
  },
  banner: {
    background: '#fffbeb',
    borderBottom: '1px solid #fcd34d',
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: '#92400e',
  },
  bannerBtn: {
    padding: '3px 10px',
    borderRadius: 4,
    border: '1px solid #d0d0d0',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'Inter, sans-serif',
  },
  progress: {
    color: '#666',
    fontStyle: 'italic',
    fontSize: 12,
    padding: '4px 0',
  },
  settings: {
    marginTop: 'auto',
    borderTop: '1px solid #f0f0f0',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  summaryTitle: {
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 8,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    borderBottom: '1px solid #f5f5f5',
    fontSize: 13,
  },
  summaryNum: {
    fontWeight: 600,
    color: '#0066FF',
  },
};

createRoot(document.getElementById('root')!).render(<App />);
