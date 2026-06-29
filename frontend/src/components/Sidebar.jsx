import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useModalKeys } from '../hooks/useModalKeys'
import {
  Cpu, Package, Shield, LogOut, Activity, Key, BarChart2,
  Users, ScrollText, Lock, X, Eye, EyeOff, Settings, MessageSquare
} from 'lucide-react'
import api from '../api'

const navItems = [
  { to: '/', icon: Activity, label: 'Dashboard', end: true },
  { to: '/models', icon: Package, label: 'Models' },
  { to: '/playground', icon: MessageSquare, label: 'Playground' },
  { to: '/access', icon: Shield, label: 'Access Control' },
  { to: '/api-keys', icon: Key, label: 'API Keys' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

function ChangePasswordModal({ open, onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.current_password) e.current_password = 'Required'
    if (form.new_password.length < 8) e.new_password = 'Min 8 characters'
    if (form.new_password !== form.confirm) e.confirm = 'Passwords do not match'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      await api.put('/api/users/me/password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      toast.success('Password changed successfully')
      setForm({ current_password: '', new_password: '', confirm: '' })
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const modalRef = useModalKeys(onClose)

  if (!open) return null

  const inputClass = (field) =>
    `w-full px-3 py-2 bg-input border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all pr-10 ${errors[field] ? 'border-destructive' : 'border-border'}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={modalRef} className="relative w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Change Password
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Current password */}
          <div className="space-y-1.5">
            <label htmlFor="pw-current" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Password</label>
            <div className="relative">
              <input
                id="pw-current"
                type={showCurrent ? 'text' : 'password'}
                value={form.current_password}
                onChange={e => { setForm({ ...form, current_password: e.target.value }); setErrors({}) }}
                placeholder="Your current password"
                className={inputClass('current_password')}
              />
              <button type="button" onClick={() => setShowCurrent(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.current_password && <p className="text-xs text-destructive">{errors.current_password}</p>}
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <label htmlFor="pw-new" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New Password</label>
            <div className="relative">
              <input
                id="pw-new"
                type={showNew ? 'text' : 'password'}
                value={form.new_password}
                onChange={e => { setForm({ ...form, new_password: e.target.value }); setErrors({}) }}
                placeholder="Min 8 characters"
                className={inputClass('new_password')}
              />
              <button type="button" onClick={() => setShowNew(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.new_password && <p className="text-xs text-destructive">{errors.new_password}</p>}
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <label htmlFor="pw-confirm" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confirm New Password</label>
            <input
              id="pw-confirm"
              type="password"
              value={form.confirm}
              onChange={e => { setForm({ ...form, confirm: e.target.value }); setErrors({}) }}
              placeholder="Repeat new password"
              className={inputClass('confirm')}
            />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
          </div>

          {/* Password strength hint */}
          {form.new_password.length > 0 && (
            <div className="flex gap-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                  form.new_password.length >= [8, 12, 16, 20][i]
                    ? ['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500'][i]
                    : 'bg-secondary'
                }`} />
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-accent transition-all">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
              {loading ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const { logout, getUsername } = useAuth()
  const navigate = useNavigate()
  const [pwModalOpen, setPwModalOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <>
      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} />

      <aside className="w-60 flex-shrink-0 h-full bg-card border-r border-border flex flex-col">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Cpu className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">Ollama Manager</p>
              <p className="text-xs text-muted-foreground">GPU Ops Platform</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-border space-y-0.5">
          {/* Avatar + name */}
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary uppercase">{getUsername()?.[0] || 'A'}</span>
            </div>
            <span className="text-sm text-foreground font-medium truncate flex-1">{getUsername() || 'Admin'}</span>
          </div>

          {/* Change password */}
          <button
            onClick={() => setPwModalOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
          >
            <Lock className="w-4 h-4" /> Change Password
          </button>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>

          {/* Attribution */}
          <p className="px-3 pt-2 text-[10px] text-muted-foreground/60 text-center tracking-wide">
            Built by Hj. NikM · 2026
          </p>
        </div>
      </aside>
    </>
  )
}
