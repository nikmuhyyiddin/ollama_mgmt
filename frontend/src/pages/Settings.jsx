import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Settings as SettingsIcon, Mail, Send, Save, Bell, Check, CheckCheck,
  AlertTriangle, XCircle, Clock, Cpu, Eye, EyeOff
} from 'lucide-react'
import api from '../api'

const severityConfig = {
  critical: { color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/20', icon: XCircle, label: 'Critical' },
  warning: { color: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/20', icon: AlertTriangle, label: 'Warning' },
  info: { color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20', icon: Bell, label: 'Info' },
}

const alertTypeLabels = {
  pcie_degraded: 'PCIe Degraded',
  pcie_replays: 'PCIe Replays',
  temperature: 'Temperature',
  ollama_health: 'Ollama Health',
  ollama_timeout: 'Ollama Timeout',
  ollama_error: 'Ollama Error',
}

function SMTPCard() {
  const [form, setForm] = useState({
    smtp_server: '', smtp_port: 25, smtp_user: '', smtp_password: '',
    smtp_from: '', smtp_use_tls: false, alert_to_email: '',
  })
  const [passwordSet, setPasswordSet] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/settings/smtp')
      .then(res => {
        const d = res.data
        setForm({
          smtp_server: d.smtp_server || '',
          smtp_port: d.smtp_port || 25,
          smtp_user: d.smtp_user || '',
          smtp_password: '',
          smtp_from: d.smtp_from || '',
          smtp_use_tls: d.smtp_use_tls || false,
          alert_to_email: d.alert_to_email || '',
        })
        setPasswordSet(d.smtp_password_set || false)
      })
      .catch(() => toast.error('Failed to load SMTP settings'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/api/settings/smtp', form)
      toast.success('SMTP settings saved')
      if (form.smtp_password) setPasswordSet(true)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const res = await api.post('/api/settings/smtp/test', { to_email: form.alert_to_email })
      toast.success(res.data.message)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const inputClass = "w-full px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="p-5 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">SMTP / Email Alerts</h2>
          <p className="text-xs text-muted-foreground">Configure email notifications for GPU health alerts</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="smtp-server" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SMTP Server</label>
            <input id="smtp-server" type="text" value={form.smtp_server} disabled={saving}
              onChange={e => setForm({ ...form, smtp_server: e.target.value })}
              placeholder="smtp.example.com" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="smtp-port" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Port</label>
            <input id="smtp-port" type="number" value={form.smtp_port} disabled={saving}
              onChange={e => setForm({ ...form, smtp_port: parseInt(e.target.value) || 25 })}
              placeholder="25" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="smtp-user" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Username</label>
            <input id="smtp-user" type="text" value={form.smtp_user} disabled={saving}
              onChange={e => setForm({ ...form, smtp_user: e.target.value })}
              placeholder="user@example.com" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="smtp-password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Password {passwordSet && !form.smtp_password && <span className="text-emerald-400 normal-case">(saved)</span>}
            </label>
            <div className="relative">
              <input id="smtp-password" type={showPassword ? 'text' : 'password'} value={form.smtp_password} disabled={saving}
                onChange={e => setForm({ ...form, smtp_password: e.target.value })}
                placeholder={passwordSet ? '••••••••' : 'Enter password'}
                className={`${inputClass} pr-10`} />
              <button type="button" onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="smtp-from" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From Address</label>
            <input id="smtp-from" type="text" value={form.smtp_from} disabled={saving}
              onChange={e => setForm({ ...form, smtp_from: e.target.value })}
              placeholder="alerts@example.com" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="smtp-alert-to" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Alert Recipient</label>
            <input id="smtp-alert-to" type="email" value={form.alert_to_email} disabled={saving}
              onChange={e => setForm({ ...form, alert_to_email: e.target.value })}
              placeholder="admin@example.com" className={inputClass} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button"
            onClick={() => setForm({ ...form, smtp_use_tls: !form.smtp_use_tls })}
            className={`relative w-10 h-5 rounded-full transition-colors ${form.smtp_use_tls ? 'bg-primary' : 'bg-secondary border border-border'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.smtp_use_tls ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm text-muted-foreground">Use TLS/SSL</span>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button type="button" onClick={handleTest} disabled={testing || !form.smtp_server}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground border border-border rounded-md text-sm font-medium hover:bg-accent transition-all disabled:opacity-60">
            <Send className="w-4 h-4" /> {testing ? 'Sending…' : 'Send Test Email'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AlertsCard() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, active, resolved

  async function fetchAlerts() {
    try {
      const res = await api.get('/api/alerts?limit=100')
      setAlerts(res.data)
    } catch {
      toast.error('Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAlerts() }, [])

  async function handleResolve(id) {
    try {
      await api.put(`/api/alerts/${id}/resolve`)
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: 1, resolved_at: new Date().toISOString() } : a))
      toast.success('Alert resolved')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to resolve')
    }
  }

  async function handleResolveAll() {
    try {
      await api.put('/api/alerts/resolve-all')
      setAlerts(prev => prev.map(a => ({ ...a, resolved: 1, resolved_at: new Date().toISOString() })))
      toast.success('All alerts resolved')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to resolve')
    }
  }

  const filtered = alerts.filter(a => {
    if (filter === 'active') return !a.resolved
    if (filter === 'resolved') return a.resolved
    return true
  })

  const activeCount = alerts.filter(a => !a.resolved).length

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center">
            <Bell className="w-4 h-4 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              GPU Alerts
              {activeCount > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/20 rounded-full">
                  {activeCount} active
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground">PCIe, temperature, and Ollama health alerts (checked every 2 min)</p>
          </div>
        </div>
        {activeCount > 0 && (
          <button onClick={handleResolveAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary border border-border rounded-md hover:bg-accent transition-all">
            <CheckCheck className="w-3.5 h-3.5" /> Resolve All
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-5 pt-4 flex gap-1">
        {[
          { key: 'all', label: `All (${alerts.length})` },
          { key: 'active', label: `Active (${activeCount})` },
          { key: 'resolved', label: `Resolved (${alerts.length - activeCount})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filter === tab.key
                ? 'bg-primary/15 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {filter === 'all' ? 'No alerts recorded yet' : `No ${filter} alerts`}
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.map(alert => {
              const sev = severityConfig[alert.severity] || severityConfig.info
              const Icon = sev.icon
              return (
                <div key={alert.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                    alert.resolved ? 'bg-secondary/30 border-border opacity-60' : sev.bg
                  }`}>
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${alert.resolved ? 'text-muted-foreground' : sev.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        alert.resolved ? 'bg-secondary text-muted-foreground' : sev.bg + ' ' + sev.color
                      }`}>
                        {alertTypeLabels[alert.alert_type] || alert.alert_type}
                      </span>
                      {alert.gpu_id !== null && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> GPU {alert.gpu_id}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm ${alert.resolved ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                      {alert.resolved_at && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Check className="w-3 h-3" />
                          Resolved {new Date(alert.resolved_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {!alert.resolved && (
                    <button onClick={() => handleResolve(alert.id)}
                      className="flex-shrink-0 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-emerald-400 bg-secondary border border-border rounded-md hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all"
                      title="Mark as resolved">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Server configuration and alert management</p>
      </div>

      <SMTPCard />
      <AlertsCard />
    </div>
  )
}
