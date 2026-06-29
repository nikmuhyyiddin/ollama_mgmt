import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import api from '../api'
import { Download, Trash2, Package, X, Plus, Cloud } from 'lucide-react'
import { useModalKeys } from '../hooks/useModalKeys'

// Gateway (LiteLLM) models — what clients call, incl. cloud providers.
// Provider → litellm path prefix + (Ollama) api_base. Cloud keys live in
// LiteLLM's env (/etc/litellm.env), so no key is entered here.
// needsKey: provider key not in LiteLLM's env → enter it here (stored encrypted in DB).
// OpenAI/Anthropic keys are already in /etc/litellm.env, so the key field is optional there.
const PROVIDERS = {
  Ollama:     { prefix: 'ollama_chat/', api_base: 'http://127.0.0.1:11434', needsKey: false, hint: 'e.g. mistral:latest, phi3:mini (pull it on the host first)' },
  OpenAI:     { prefix: 'openai/',      api_base: null, needsKey: false, hint: 'e.g. gpt-4o, gpt-4o-mini' },
  Anthropic:  { prefix: 'anthropic/',   api_base: null, needsKey: false, hint: 'e.g. claude-opus-4-8, claude-haiku-4-5' },
  Gemini:     { prefix: 'gemini/',      api_base: null, needsKey: true,  hint: 'e.g. gemini-1.5-pro, gemini-2.0-flash' },
  OpenRouter: { prefix: 'openrouter/',  api_base: null, needsKey: true,  hint: 'e.g. anthropic/claude-3.5-sonnet, meta-llama/llama-3.1-70b' },
  Grok:       { prefix: 'xai/',         api_base: null, needsKey: true,  hint: 'e.g. grok-2, grok-2-mini' },
  Kimi:       { prefix: 'moonshot/',    api_base: null, needsKey: true,  hint: 'e.g. moonshot-v1-8k, moonshot-v1-32k' },
  Custom:     { prefix: '',             api_base: null, needsKey: true,  hint: 'full litellm path, e.g. mistral/mistral-large-latest' },
}

function GatewayModels() {
  const [rows, setRows] = useState([])
  const [provider, setProvider] = useState('Anthropic')
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)

  const [importing, setImporting] = useState(false)
  async function load() {
    try { const { data } = await api.get('/api/gateway/models'); setRows(data) } catch { /* best-effort */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t) }, [])

  async function importOllama() {
    setImporting(true)
    try {
      const { data } = await api.post('/api/gateway/models/import-ollama')
      toast.success(data.count ? `Imported ${data.count} Ollama model(s)` : 'Already up to date')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed')
    } finally { setImporting(false) }
  }

  async function add() {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      const p = PROVIDERS[provider]
      // Custom: user types the whole path; others: prefix + name.
      const model = provider === 'Custom' ? n : `${p.prefix}${n}`
      await api.post('/api/gateway/models', {
        model_name: n, model, api_base: p.api_base,
        api_key: apiKey.trim() || null,   // sent for new providers; stored encrypted in DB
      })
      toast.success(`Added ${n}`)
      setName(''); setApiKey('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add model')
    } finally { setBusy(false) }
  }

  async function remove(id, mn) {
    if (!id) { toast.error('This model is config-defined; edit config.yaml to remove it.'); return }
    if (!confirm(`Remove gateway model "${mn}"?`)) return
    try {
      await api.delete('/api/gateway/models', { params: { id } })
      setRows(r => r.filter(x => x.id !== id))
      toast.success(`Removed ${mn}`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Remove failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Cloud className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Gateway Models</h2>
        <span className="text-xs text-muted-foreground">— what clients call (incl. cloud); {rows.length} configured</span>
        <button onClick={importOllama} disabled={importing}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:bg-accent transition-all disabled:opacity-60"
          title="Register all models on the Ollama host">
          <Download className="w-3.5 h-3.5" /> {importing ? 'Importing…' : 'Import from Ollama'}
        </button>
      </div>

      {/* Add form */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Provider</label>
          <select value={provider} onChange={e => setProvider(e.target.value)}
            className="px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            {Object.keys(PROVIDERS).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 flex-1 min-w-[14rem]">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</label>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
            placeholder={PROVIDERS[provider].hint}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        {PROVIDERS[provider].needsKey && (
          <div className="space-y-1.5 min-w-[14rem]">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              API Key {provider === 'Gemini' || provider === 'OpenRouter' || provider === 'Grok' || provider === 'Kimi'
                ? <span className="text-muted-foreground/60 normal-case">(provider key)</span> : null}
            </label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="paste provider key — stored encrypted"
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        )}
        <button onClick={add} disabled={busy || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
          <Plus className="w-4 h-4" /> {busy ? 'Adding…' : 'Add'}
        </button>
      </div>

      {/* List */}
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 border-b border-border">
            <tr>
              {['Model', 'Provider', 'Backing', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(m => (
              <tr key={m.id || m.model_name} className="hover:bg-secondary/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground metric">{m.model_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.provider}</td>
                <td className="px-4 py-3 text-muted-foreground metric text-xs">{m.backing_model}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(m.id, m.model_name)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title={m.id ? `Remove ${m.model_name}` : 'Config-defined (edit config.yaml)'}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatBytes(mb) {
  if (!mb) return '—'
  const gb = mb / 1024
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function PullDrawer({ open, onClose, onPulled }) {
  const [modelName, setModelName] = useState('')
  const [progress, setProgress] = useState(null)  // { status, completed, total }
  const [pulling, setPulling] = useState(false)

  async function handlePull() {
    if (!modelName.trim()) return
    setPulling(true)
    setProgress({ status: 'Starting…', completed: 0, total: 0 })
    try {
      const response = await fetch('/api/models/pull', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ name: modelName.trim() }),
      })
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              setProgress(data)
              if (data.status === 'success') {
                toast.success(`Model ${modelName} pulled successfully`)
                onPulled()
                onClose()
              }
            } catch { /* ignore partial JSON */ }
          }
        }
      }
    } catch (err) {
      toast.error('Pull failed: ' + (err.message || 'unknown error'))
    } finally {
      setPulling(false)
      setProgress(null)
    }
  }

  const modalRef = useModalKeys(onClose)

  if (!open) return null

  const pct = progress?.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={modalRef} className="relative ml-auto w-full max-w-md bg-card border-l border-border h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Pull Model</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="pull-model-name" className="text-sm font-medium text-foreground">Model name</label>
            <input
              id="pull-model-name"
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. llama3:8b, qwen2.5:14b"
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              disabled={pulling}
            />
            <p className="text-xs text-muted-foreground">Browse available models at <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="text-primary hover:underline">ollama.com/library</a></p>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={
                    pct == null
                      ? { width: '100%', animation: 'pulse 1s ease-in-out infinite' }
                      : { width: `${pct}%` }
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {progress.status}
                {pct != null && ` — ${pct}%`}
              </p>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-border">
          <button
            onClick={handlePull}
            disabled={pulling || !modelName.trim()}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {pulling ? 'Pulling…' : 'Pull Model'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Models() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)

  async function fetchModels(silent = false) {
    try {
      const { data } = await api.get('/api/models')
      setModels(data.models || [])
    } catch (err) {
      if (!silent) toast.error('Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  // ponytail: dumb 15s poll keeps the list fresh; silent so a flaky Ollama
  // doesn't spam toasts. No SWR/React Query for one list.
  useEffect(() => {
    fetchModels()
    const t = setInterval(() => fetchModels(true), 15000)
    return () => clearInterval(t)
  }, [])

  async function handleDelete(name) {
    if (!confirm(`Delete model "${name}"?`)) return
    setDeleting(name)
    try {
      await api.delete(`/api/models/${name}`)
      toast.success(`Deleted ${name}`)
      setModels((m) => m.filter((x) => x.name !== name))
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <PullDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onPulled={fetchModels} />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Models</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{models.length} model{models.length !== 1 ? 's' : ''} installed</p>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Download className="w-4 h-4" /> Pull Model
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          </div>
        ) : models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Package className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">No models installed. Pull one to get started.</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Size</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Family</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Parameters</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {models.map((m) => (
                  <tr key={m.name} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground metric">{m.name}</td>
                    <td className="px-4 py-3 text-muted-foreground metric">{formatBytes(m.size ? m.size / 1024 / 1024 : null)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.details?.family || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.details?.parameter_size || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(m.name)}
                        disabled={deleting === m.name}
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        title={`Delete ${m.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Gateway (LiteLLM) model management — incl. cloud providers */}
        <div className="border-t border-border pt-6">
          <GatewayModels />
        </div>
      </div>
    </>
  )
}
