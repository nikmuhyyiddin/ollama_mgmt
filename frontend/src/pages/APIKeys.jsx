import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Copy, Key, Plus, Trash2, AlertTriangle, Pencil, X, ChevronRight, ChevronLeft } from 'lucide-react'
import api from '../api'
import { useModalKeys } from '../hooks/useModalKeys'

// Two-panel model assignment: left = available, right = allowed. Empty right = all models.
function ModelTransfer({ all, selected, onChange }) {
  const available = all.filter(m => !selected.includes(m))
  const Panel = ({ title, items, onClick, side }) => (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{title}</p>
      <div className="border border-border rounded-md bg-input h-44 overflow-y-auto p-1.5 space-y-1">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground/70 px-1.5 py-2">
            {side === 'right' ? 'None → all models allowed' : 'All added'}
          </p>
        )}
        {items.map(m => (
          <button type="button" key={m} onClick={() => onClick(m)}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-medium bg-secondary text-foreground border border-border hover:border-primary/50 hover:text-primary transition-all">
            <span className="truncate">{m}</span>
            {side === 'left' ? <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" /> : <X className="w-3.5 h-3.5 flex-shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
  return (
    <div className="flex items-stretch gap-3">
      <Panel title={`Available (${available.length})`} items={available} side="left" onClick={m => onChange([...selected, m])} />
      <Panel title={`Allowed (${selected.length || 'all'})`} items={selected} side="right" onClick={m => onChange(selected.filter(x => x !== m))} />
    </div>
  )
}

// Gateway (LiteLLM) keys: created via /api/gateway/keys, scoped by model + budget.

function KeyBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20">
      <Key className="w-3 h-3" />{label || 'unnamed'}
    </span>
  )
}

function CreateKeyModal({ open, onClose, onCreated, models }) {
  const [form, setForm] = useState({ key_alias: '', models: [], max_budget: '', duration: '' })
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const payload = {
        key_alias: form.key_alias || null,
        models: form.models,                       // [] = all models
        max_budget: form.max_budget ? parseFloat(form.max_budget) : null,
        duration: form.duration || null,           // e.g. "30d"
      }
      const { data } = await api.post('/api/gateway/keys', payload)
      setNewKey(data)
      onCreated()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(newKey.key)
    toast.success('Key copied to clipboard')
  }

  function handleClose() {
    setNewKey(null)
    setForm({ key_alias: '', models: [], max_budget: '', duration: '' })
    onClose()
  }

  const modalRef = useModalKeys(handleClose)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!newKey ? handleClose : undefined} />
      <div ref={modalRef} className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl">
        <div className="p-6 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {newKey ? '🔑 Save your key' : 'Generate Gateway Key'}
          </h2>
        </div>

        {newKey ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <p className="text-xs text-yellow-300">Shown only once. Copy it now.</p>
            </div>
            <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg font-mono text-xs text-foreground break-all border border-border">
              <span className="flex-1">{newKey.key}</span>
              <button onClick={copyKey} className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button onClick={handleClose} className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="key-alias" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name / Alias</label>
              <input
                id="key-alias"
                type="text"
                value={form.key_alias}
                onChange={e => setForm({ ...form, key_alias: e.target.value })}
                placeholder="e.g. cursor-dev, team-a"
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Models <span className="text-muted-foreground/60 normal-case">(click to move · none allowed = all)</span>
              </label>
              <ModelTransfer all={models} selected={form.models} onChange={m => setForm({ ...form, models: m })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="key-budget" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Max Budget ($)</label>
                <input
                  id="key-budget"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.max_budget}
                  onChange={e => setForm({ ...form, max_budget: e.target.value })}
                  placeholder="unlimited"
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="key-duration" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expires In</label>
                <input
                  id="key-duration"
                  type="text"
                  value={form.duration}
                  onChange={e => setForm({ ...form, duration: e.target.value })}
                  placeholder="e.g. 30d, 24h (blank = never)"
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={handleClose} className="flex-1 py-2.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-accent transition-all">
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
              >
                <Key className="w-4 h-4" /> {creating ? 'Generating…' : 'Generate Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function EditKeyModal({ target, onClose, onSaved, models }) {
  const [sel, setSel] = useState([])
  const [budget, setBudget] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (target) {
      setSel(target.models || [])
      setBudget(target.max_budget != null ? String(target.max_budget) : '')
    }
  }, [target])


  async function save() {
    setSaving(true)
    try {
      await api.patch('/api/gateway/keys', {
        token: target.token,
        models: sel,                                   // [] = all
        max_budget: budget === '' ? null : parseFloat(budget),
      })
      toast.success('Key updated')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update key')
    } finally {
      setSaving(false)
    }
  }

  const modalRef = useModalKeys(onClose)
  if (!target) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={modalRef} className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl">
        <div className="p-6 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Edit “{target.alias || target.key_name}”</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Models <span className="text-muted-foreground/60 normal-case">(click to move · none allowed = all)</span>
            </label>
            <ModelTransfer all={models} selected={sel} onChange={setSel} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-budget" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Max Budget ($)</label>
            <input id="edit-budget" type="number" step="0.01" min="0" value={budget}
              onChange={e => setBudget(e.target.value)} placeholder="unlimited"
              className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-accent transition-all">Cancel</button>
            <button type="button" onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function APIKeys() {
  const [keys, setKeys] = useState([])
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  async function fetchKeys(silent = false) {
    try {
      const { data } = await api.get('/api/gateway/keys')
      setKeys(data)
    } catch {
      if (!silent) toast.error('Failed to load keys')
    } finally {
      setLoading(false)
    }
  }

  async function fetchModels() {
    try {
      const { data } = await api.get('/api/gateway/models')
      setModels(data.map(m => m.model_name).filter(Boolean))
    } catch { /* models list is best-effort for the picker */ }
  }

  // ponytail: silent 15s poll, same as before. Spend updates live here.
  useEffect(() => {
    fetchKeys()
    fetchModels()
    const t = setInterval(() => fetchKeys(true), 15000)
    return () => clearInterval(t)
  }, [])

  async function handleRevoke(token, alias) {
    if (!confirm(`Revoke key "${alias || token?.slice(0, 8)}"?`)) return
    try {
      await api.delete('/api/gateway/keys', { params: { token } })
      setKeys(k => k.filter(x => x.token !== token))
      toast.success('Key revoked')
    } catch {
      toast.error('Failed to revoke key')
    }
  }

  const isExpired = (exp) => exp && new Date(exp) < new Date()
  const overBudget = (k) => k.max_budget != null && (k.spend || 0) >= k.max_budget

  return (
    <>
      <CreateKeyModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={fetchKeys} models={models} />
      <EditKeyModal target={editTarget} onClose={() => setEditTarget(null)} onSaved={fetchKeys} models={models} />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">API Keys</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{keys.length} gateway key{keys.length !== 1 ? 's' : ''} — use <span className="metric text-foreground">Authorization: Bearer sk-…</span></p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" /> New Key
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Key className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">No keys yet. Generate one to allow programmatic access.</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  {['Name', 'Key', 'Models', 'Spend / Budget', 'Expires', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map(k => (
                  <tr key={k.token} className={`hover:bg-secondary/30 transition-colors ${isExpired(k.expires) ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <KeyBadge label={k.alias} />
                      {isExpired(k.expires) && <span className="ml-2 text-xs text-destructive">expired</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground metric text-xs">{k.key_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground metric text-xs">{k.models?.length ? k.models.join(', ') : 'all'}</td>
                    <td className="px-4 py-3 metric text-xs">
                      <span className={overBudget(k) ? 'text-destructive' : 'text-foreground'}>${(k.spend || 0).toFixed(4)}</span>
                      <span className="text-muted-foreground"> / {k.max_budget != null ? `$${k.max_budget}` : '∞'}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{k.expires ? new Date(k.expires).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => setEditTarget(k)} className="text-muted-foreground hover:text-primary transition-colors" title="Edit key">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRevoke(k.token, k.alias)} className="text-muted-foreground hover:text-destructive transition-colors" title="Revoke key">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Usage</h2>
          <pre className="text-xs metric text-muted-foreground bg-secondary/50 rounded-lg p-4 overflow-x-auto">{`# OpenAI-compatible — works with any provider behind the gateway
OPENAI_API_KEY=sk-<your-key>
OPENAI_BASE_URL=${window.location.origin}/v1

# cURL
curl ${window.location.origin}/v1/chat/completions \\
  -H "Authorization: Bearer sk-<key>" \\
  -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"Hello"}]}'`}</pre>
        </div>
      </div>
    </>
  )
}
