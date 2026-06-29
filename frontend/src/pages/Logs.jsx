import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import api from '../api'

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: '2xx OK', value: '2' },
  { label: '4xx Client', value: '4' },
  { label: '5xx Server', value: '5' },
]

function StatusBadge({ status }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  const code = parseInt(status)
  const cls =
    code < 300 ? 'bg-emerald-500/15 text-emerald-400' :
    code < 400 ? 'bg-blue-500/15 text-blue-400' :
    code < 500 ? 'bg-yellow-500/15 text-yellow-400' :
                 'bg-red-500/15 text-red-400'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium metric ${cls}`}>
      {status}
    </span>
  )
}

function LatencyBar({ ms }) {
  if (ms == null) return <span className="text-muted-foreground metric text-xs">—</span>
  const color = ms > 5000 ? 'text-red-400' : ms > 1000 ? 'text-yellow-400' : 'text-emerald-400'
  return <span className={`metric text-xs ${color}`}>{ms.toLocaleString()}ms</span>
}

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({ ip: '', model: '', status: '' })
  const [draftFilters, setDraftFilters] = useState({ ip: '', model: '', status: '' })

  const LIMIT = 25

  const fetchLogs = useCallback(async (pg = page, f = filters) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', LIMIT)
      params.set('offset', pg * LIMIT)
      if (f.ip) params.set('ip', f.ip)
      if (f.model) params.set('model', f.model)
      if (f.status) params.set('status', f.status)
      const { data } = await api.get(`/api/logs?${params}`)
      setLogs(data.logs)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load logs')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => { fetchLogs() }, [page])

  function applyFilters(e) {
    e.preventDefault()
    setFilters(draftFilters)
    setPage(0)
    fetchLogs(0, draftFilters)
  }

  function clearFilters() {
    const empty = { ip: '', model: '', status: '' }
    setDraftFilters(empty)
    setFilters(empty)
    setPage(0)
    fetchLogs(0, empty)
  }

  const totalPages = Math.ceil(total / LIMIT)
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Request Logs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total.toLocaleString()} total request{total !== 1 ? 's' : ''}
            {hasFilters && <span className="text-primary ml-1">(filtered)</span>}
          </p>
        </div>
        <button
          onClick={() => fetchLogs()}
          aria-label="Refresh logs"
          title="Refresh logs"
          className="flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-accent transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter bar */}
      <form onSubmit={applyFilters} className="bg-card border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" /> Filters
          </div>

          <div className="flex-1 min-w-[140px] space-y-1">
            <label htmlFor="log-filter-ip" className="text-xs text-muted-foreground">IP Address</label>
            <input
              id="log-filter-ip"
              type="text"
              value={draftFilters.ip}
              onChange={e => setDraftFilters({ ...draftFilters, ip: e.target.value })}
              placeholder="e.g. 192.168.1.10"
              className="w-full px-3 py-1.5 bg-input border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex-1 min-w-[140px] space-y-1">
            <label htmlFor="log-filter-model" className="text-xs text-muted-foreground">Model</label>
            <input
              id="log-filter-model"
              type="text"
              value={draftFilters.model}
              onChange={e => setDraftFilters({ ...draftFilters, model: e.target.value })}
              placeholder="e.g. llama3:8b"
              className="w-full px-3 py-1.5 bg-input border border-border rounded-md text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <div className="flex gap-1">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDraftFilters({ ...draftFilters, status: opt.value })}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    draftFilters.status === opt.value
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-semibold hover:bg-primary/90 transition-all"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-1.5 bg-secondary text-muted-foreground rounded-md text-xs hover:text-foreground transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Table */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  {['Timestamp', 'IP', 'Model', 'Latency', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                      No logs found{hasFilters ? ' — try adjusting your filters' : ''}
                    </td>
                  </tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs metric whitespace-nowrap">
                      {new Date(log.timestamp + 'Z').toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-foreground metric text-xs">{log.ip || '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground metric text-xs">{log.model || '—'}</td>
                    <td className="px-4 py-2.5"><LatencyBar ms={log.latency_ms} /></td>
                    <td className="px-4 py-2.5"><StatusBadge status={log.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/30">
              <p className="text-xs text-muted-foreground">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = Math.max(0, Math.min(page - 2, totalPages - 5)) + i
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${
                        pg === page
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      {pg + 1}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
