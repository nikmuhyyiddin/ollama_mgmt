import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import api from '../api'
import { Plus, Trash2, ShieldCheck, ShieldX } from 'lucide-react'

export default function AccessControl() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ cidr: '', action: 'allow', label: '', priority: 100 })
  const [adding, setAdding] = useState(false)

  async function fetchRules() {
    try {
      const { data } = await api.get('/api/access/rules')
      setRules(data)
    } catch {
      toast.error('Failed to load IP rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRules() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setAdding(true)
    try {
      const { data } = await api.post('/api/access/rules', form)
      setRules((r) => [...r, data])
      setForm({ cidr: '', action: 'allow', label: '', priority: 100 })
      toast.success(`Rule added: ${form.cidr}`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add rule')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id, cidr) {
    if (!confirm(`Delete IP rule "${cidr}"? This changes who can reach Ollama.`)) return
    try {
      await api.delete(`/api/access/rules/${id}`)
      setRules((r) => r.filter((x) => x.id !== id))
      toast.success(`Rule deleted: ${cidr}`)
    } catch (err) {
      toast.error('Failed to delete rule')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Access Control</h1>
        <p className="text-muted-foreground text-sm mt-0.5">IP allowlist enforced on all Ollama proxy requests</p>
      </div>

      {/* No-rules notice */}
      {!loading && rules.length === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 text-sm">
          <ShieldX className="w-5 h-5 flex-shrink-0" />
          <span>No IP rules defined. All IPs are currently allowed. Add rules to restrict access.</span>
        </div>
      )}

      {/* Add rule form */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Add IP Rule</h2>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            aria-label="CIDR"
            placeholder="CIDR e.g. 192.168.1.0/24"
            value={form.cidr}
            onChange={(e) => setForm({ ...form, cidr: e.target.value })}
            required
            className="sm:col-span-2 px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            aria-label="Rule action"
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
            className="px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
          <input
            type="text"
            aria-label="Rule label"
            placeholder="Label (optional)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={adding}
            className="sm:col-span-4 flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
          >
            <Plus className="w-4 h-4" /> {adding ? 'Adding…' : 'Add Rule'}
          </button>
        </form>
      </div>

      {/* Rules table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        </div>
      ) : rules.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">CIDR</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Label</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground metric">{rule.cidr}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                      rule.action === 'allow'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}>
                      {rule.action === 'allow' ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                      {rule.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{rule.label || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground metric">{rule.priority}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(rule.id, rule.cidr)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete rule"
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
    </div>
  )
}
