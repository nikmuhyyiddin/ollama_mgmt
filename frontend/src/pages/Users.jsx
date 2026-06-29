import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Users as UsersIcon, Plus, Trash2, ShieldCheck, Eye } from 'lucide-react'
import api from '../api'
import { useModalKeys } from '../hooks/useModalKeys'

const ROLES = ['admin', 'viewer']

function RoleBadge({ role }) {
  const isAdmin = role === 'admin'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
      isAdmin
        ? 'bg-primary/15 text-primary border border-primary/20'
        : 'bg-secondary text-muted-foreground border border-border'
    }`}>
      {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      {role}
    </span>
  )
}

function CreateUserModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer' })
  const [creating, setCreating] = useState(false)
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!form.username.trim()) e.username = 'Required'
    if (form.password.length < 8) e.password = 'Min 8 characters'
    return e
  }

  async function handleCreate(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setCreating(true)
    try {
      await api.post('/api/users', form)
      toast.success(`User "${form.username}" created`)
      setForm({ username: '', password: '', role: 'viewer' })
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const modalRef = useModalKeys(onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={modalRef} className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl">
        <div className="p-6 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Create User</h2>
        </div>
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="user-username" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Username</label>
            <input
              id="user-username"
              type="text"
              value={form.username}
              onChange={e => { setForm({ ...form, username: e.target.value }); setErrors({}) }}
              placeholder="e.g. alice"
              className={`w-full px-3 py-2 bg-input border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all ${errors.username ? 'border-destructive' : 'border-border'}`}
            />
            {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="user-password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
            <input
              id="user-password"
              type="password"
              value={form.password}
              onChange={e => { setForm({ ...form, password: e.target.value }); setErrors({}) }}
              placeholder="Min 8 characters"
              className={`w-full px-3 py-2 bg-input border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all ${errors.password ? 'border-destructive' : 'border-border'}`}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</label>
            <div className="flex gap-2">
              {ROLES.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, role: r })}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border transition-all ${
                    form.role === r
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Admins can manage users, manage models, and view all settings. Viewers have read-only access.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-accent transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
            >
              <Plus className="w-4 h-4" /> {creating ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  async function fetchData(silent = false) {
    try {
      const [usersResp, meResp] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/users/me'),
      ])
      setUsers(usersResp.data)
      setCurrentUser(meResp.data)
    } catch (err) {
      if (silent) return
      if (err.response?.status === 403) {
        toast.error('Admin access required to manage users')
      } else {
        toast.error('Failed to load users')
      }
    } finally {
      setLoading(false)
    }
  }

  // ponytail: silent 15s poll, same as Models.
  useEffect(() => {
    fetchData()
    const t = setInterval(() => fetchData(true), 15000)
    return () => clearInterval(t)
  }, [])

  async function handleDelete(id, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      await api.delete(`/api/users/${id}`)
      setUsers(u => u.filter(x => x.id !== id))
      toast.success(`User "${username}" deleted`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user')
    }
  }

  const isMe = (id) => currentUser?.id === id

  return (
    <>
      <CreateUserModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={fetchData} />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Users</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''} — admin role required to manage</p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" /> New User
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <UsersIcon className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm">No users yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  {['Username', 'Role', 'Created', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary uppercase">{u.username[0]}</span>
                        </div>
                        <span className="font-medium text-foreground">{u.username}</span>
                        {isMe(u.id) && (
                          <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">you</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {!isMe(u.id) && (
                        <button
                          onClick={() => handleDelete(u.id, u.username)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title={`Delete ${u.username}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Info box */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">Role Permissions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div className="space-y-1">
              <p className="font-medium text-primary flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Admin</p>
              <ul className="space-y-0.5 ml-5 list-disc">
                <li>Manage all users (create / delete)</li>
                <li>Manage models (pull / delete)</li>
                <li>Manage IP rules and API keys</li>
                <li>View all analytics and logs</li>
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-muted-foreground flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Viewer</p>
              <ul className="space-y-0.5 ml-5 list-disc">
                <li>View GPU dashboard</li>
                <li>View model list</li>
                <li>View analytics (read-only)</li>
                <li>Change own password</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
