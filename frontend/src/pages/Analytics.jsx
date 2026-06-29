import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { BarChart2, Clock, Globe, TrendingUp, Coins, DollarSign, Activity, Download, Calendar } from 'lucide-react'
import api from '../api'

const isoDay = (d) => d.toISOString().slice(0, 10)

const DAYS_OPTIONS = [1, 7, 14, 30]
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-3">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="metric text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function HeatmapCell({ count, max }) {
  const intensity = max > 0 ? count / max : 0
  const bg = intensity === 0
    ? 'bg-secondary'
    : intensity < 0.25
      ? 'bg-primary/25'
      : intensity < 0.5
        ? 'bg-primary/50'
        : intensity < 0.75
          ? 'bg-primary/75'
          : 'bg-primary'
  return (
    <div
      className={`w-4 h-4 rounded-sm ${bg} transition-colors`}
      title={`${count} requests`}
    />
  )
}

export default function Analytics() {
  const [days, setDays] = useState(7)
  const [summary, setSummary] = useState(null)
  const [timeseries, setTimeseries] = useState([])
  const [heatmap, setHeatmap] = useState([])
  const [latencyByModel, setLatencyByModel] = useState([])
  const [loading, setLoading] = useState(true)
  const [gw, setGw] = useState(null)   // LiteLLM gateway spend (independent of the custom-proxy logs)

  // Gateway spend — its own fetch + 15s poll; not date-filtered by the day picker.
  useEffect(() => {
    const load = () => api.get('/api/gateway/spend').then(r => setGw(r.data)).catch(() => {})
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  // Historical report — date-range query against LiteLLM's daily rollups.
  const [repStart, setRepStart] = useState(isoDay(new Date(Date.now() - 30 * 864e5)))
  const [repEnd, setRepEnd] = useState(isoDay(new Date()))
  const [report, setReport] = useState(null)
  useEffect(() => {
    api.get(`/api/gateway/report?start=${repStart}&end=${repEnd}`).then(r => setReport(r.data)).catch(() => {})
  }, [repStart, repEnd])

  async function downloadCsv(group) {
    try {
      const res = await api.get(`/api/gateway/report.csv?start=${repStart}&end=${repEnd}&group=${group}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `gateway-report-${group}-${repStart}_to_${repEnd}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Export failed') }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get(`/api/analytics/summary?days=${days}`),
      api.get(`/api/analytics/timeseries?days=${days}`),
      api.get(`/api/analytics/heatmap?days=${days}`),
      api.get(`/api/analytics/latency-by-model?days=${days}`),
    ])
      .then(([s, t, h, l]) => {
        setSummary(s.data)
        setTimeseries(t.data)
        setHeatmap(h.data)
        setLatencyByModel(l.data)
      })
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [days])

  // Build heatmap grid: 7 rows (days) × 24 cols (hours)
  const heatmapGrid = (() => {
    const map = {}
    heatmap.forEach(r => { map[`${r.dow}-${r.hour}`] = r.count })
    const maxCount = heatmap.reduce((m, r) => Math.max(m, r.count), 0)
    return { map, maxCount }
  })()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Request volume, latency, and usage patterns</p>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                days === d
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── Gateway (LiteLLM) spend — always shown; this is the live traffic path ── */}
      {gw && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Gateway Spend</h2>
            <span className="text-xs text-muted-foreground">— across all providers</span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard icon={DollarSign} label="Total Spend" value={`$${(gw.total_spend ?? 0).toFixed(4)}`} sub="all keys · all providers" />
            <StatCard icon={Activity} label="Gateway Requests" value={(gw.total_requests ?? 0).toLocaleString()} />
            <StatCard icon={Coins} label="Tokens" value={(gw.total_tokens ?? 0).toLocaleString()} />
          </div>

          {/* Historical report — date range + daily chart + CSV export */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Historical Report
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={repStart} max={repEnd} onChange={e => setRepStart(e.target.value)}
                  className="px-2 py-1.5 bg-input border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                <span className="text-xs text-muted-foreground">→</span>
                <input type="date" value={repEnd} min={repStart} onChange={e => setRepEnd(e.target.value)}
                  className="px-2 py-1.5 bg-input border border-border rounded-md text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                <div className="flex items-center gap-1 ml-1">
                  {['key', 'model', 'day'].map(g => (
                    <button key={g} onClick={() => downloadCsv(g)} title={`Export by ${g}`}
                      className="flex items-center gap-1 px-2 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:bg-accent transition-all">
                      <Download className="w-3 h-3" /> {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {report && (
              <>
                <div className="flex flex-wrap gap-6 text-sm">
                  <span className="text-muted-foreground">Spend <span className="metric text-foreground">${(report.total_spend ?? 0).toFixed(4)}</span></span>
                  <span className="text-muted-foreground">Requests <span className="metric text-foreground">{(report.total_requests ?? 0).toLocaleString()}</span></span>
                  <span className="text-muted-foreground">Tokens <span className="metric text-foreground">{(report.total_tokens ?? 0).toLocaleString()}</span></span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {/* Requests per day */}
                  {report.daily?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Requests per day</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={report.daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 18%)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: 'hsl(222 47% 9%)', border: '1px solid hsl(217 33% 18%)', borderRadius: '8px', fontSize: '12px' }} />
                          <Bar dataKey="requests" name="Requests" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Requests per key / user */}
                  {report.by_key?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Requests by key / user</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={report.by_key.slice(0, 12)} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 18%)" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickLine={false} axisLine={false} />
                          <YAxis dataKey="key" type="category" width={100} tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: 'hsl(222 47% 9%)', border: '1px solid hsl(217 33% 18%)', borderRadius: '8px', fontSize: '12px' }}
                            formatter={(v, n, p) => [`${v} req · $${(p.payload.spend || 0).toFixed(4)} · ${p.payload.tokens} tok`, p.payload.key]} />
                          <Bar dataKey="requests" name="Requests" radius={[0, 4, 4, 0]}>
                            {report.by_key.slice(0, 12).map((_, i) => (
                              <Cell key={i} fill={`hsl(217 91% ${Math.max(42, 68 - i * 4)}%)`} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Usage by key / bearer */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Usage by Key / User</h3>
            {gw.by_key?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground border-b border-border">
                    <tr className="text-left">
                      <th className="font-medium pb-2 pr-2">Key / User</th>
                      <th className="font-medium pb-2 pr-2 text-right">Requests</th>
                      <th className="font-medium pb-2 pr-2 text-right">Tokens</th>
                      <th className="font-medium pb-2 text-right">Spend</th>
                      <th className="font-medium pb-2 pl-4 w-1/3">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {gw.by_key.map((k, i) => {
                      const maxReq = gw.by_key[0].requests || 1
                      const pct = Math.round((k.requests / maxReq) * 100)
                      return (
                        <tr key={i}>
                          <td className="py-2 pr-2 metric text-foreground truncate max-w-[12rem]">{k.key}</td>
                          <td className="py-2 pr-2 text-right metric text-muted-foreground">{k.requests.toLocaleString()}</td>
                          <td className="py-2 pr-2 text-right metric text-muted-foreground">{(k.tokens || 0).toLocaleString()}</td>
                          <td className="py-2 text-right metric text-muted-foreground">${(k.spend || 0).toFixed(4)}</td>
                          <td className="py-2 pl-4">
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-muted-foreground">No gateway traffic yet.</p>}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Spend by model */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Spend by Model</h3>
              {gw.by_model?.length ? (
                <div className="space-y-2">
                  {gw.by_model.map(m => {
                    const max = gw.by_model[0].spend || 1
                    const pct = Math.round(((m.spend || 0) / max) * 100)
                    return (
                      <div key={m.model} className="flex items-center gap-3">
                        <span className="text-sm text-foreground metric flex-1 truncate">{m.model}</span>
                        <div className="w-28 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="metric text-xs text-muted-foreground w-20 text-right">${(m.spend || 0).toFixed(4)}</span>
                        <span className="metric text-xs text-muted-foreground w-14 text-right">{m.requests} req</span>
                      </div>
                    )
                  })}
                </div>
              ) : <p className="text-xs text-muted-foreground">No gateway traffic yet.</p>}
            </div>

            {/* Recent requests */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Recent Gateway Requests</h3>
              {gw.recent?.length ? (
                <div className="overflow-x-auto max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="font-medium pb-2 pr-2">Time</th>
                        <th className="font-medium pb-2 pr-2">Key</th>
                        <th className="font-medium pb-2 pr-2">Model</th>
                        <th className="font-medium pb-2 text-right">Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {gw.recent.map((r, i) => (
                        <tr key={i} className={r.status === 'failure' ? 'opacity-50' : ''}>
                          <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">{r.time ? new Date(r.time).toLocaleTimeString() : '—'}</td>
                          <td className="py-1.5 pr-2 metric text-foreground truncate max-w-[8rem]">{r.key}</td>
                          <td className="py-1.5 pr-2 metric text-muted-foreground">{r.model}</td>
                          <td className="py-1.5 text-right metric text-muted-foreground">${(r.spend || 0).toFixed(5)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-muted-foreground">No gateway traffic yet.</p>}
            </div>
          </div>

          <div className="border-t border-border pt-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Proxy request analytics</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (!summary || summary.total_requests === 0) ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <BarChart2 className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">No request data yet for this period. Stats appear once traffic flows through the proxy.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard icon={TrendingUp} label="Total Requests" value={summary.total_requests.toLocaleString()} sub={`${summary.success_count} success · ${summary.error_count} errors`} />
              <StatCard icon={Coins} label="Total Tokens" value={(summary.total_tokens ?? 0).toLocaleString()} sub={`${(summary.total_prompt_tokens ?? 0).toLocaleString()} in · ${(summary.total_completion_tokens ?? 0).toLocaleString()} out`} />
              <StatCard icon={Clock} label="Avg Latency" value={`${summary.avg_latency_ms}ms`} sub={`P95: ${summary.p95_latency_ms}ms`} />
              <StatCard icon={Globe} label="Unique IPs" value={summary.distinct_ips} />
            </div>
          )}

          {/* Request volume timeseries */}
          {timeseries.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Request Volume</h2>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeseries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vol-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 18%)" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={v => v ? v.substring(11, 16) : ''}
                    tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(222 47% 9%)', border: '1px solid hsl(217 33% 18%)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: 'hsl(210 40% 96%)' }}
                  />
                  <Area type="monotone" dataKey="request_count" name="Requests" stroke="hsl(217 91% 60%)" fill="url(#vol-grad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Latency by model */}
            {latencyByModel.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Avg Latency by Model</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={latencyByModel} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 18%)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickLine={false} axisLine={false} unit="ms" />
                    <YAxis dataKey="model" type="category" tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} tickLine={false} axisLine={false} width={80} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(222 47% 9%)', border: '1px solid hsl(217 33% 18%)', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="avg_latency_ms" name="Avg Latency (ms)" radius={[0, 4, 4, 0]}>
                      {latencyByModel.map((_, i) => (
                        <Cell key={i} fill={`hsl(217 91% ${Math.max(40, 70 - i * 8)}%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Heatmap */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Request Heatmap (hour × day)</h2>
              <div className="space-y-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map(dow => (
                  <div key={dow} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground w-7 flex-shrink-0">{DOW_LABELS[dow]}</span>
                    <div className="flex gap-0.5 flex-1">
                      {Array.from({ length: 24 }, (_, h) => (
                        <HeatmapCell
                          key={h}
                          count={heatmapGrid.map[`${dow}-${h}`] || 0}
                          max={heatmapGrid.maxCount}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-xs text-muted-foreground w-7" />
                  <div className="flex gap-0.5">
                    {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
                      <span key={h} className="text-[9px] text-muted-foreground" style={{ width: `${4 * 18}px` }}>{String(h).padStart(2, '0')}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 mt-4">
                <span className="text-xs text-muted-foreground">Less</span>
                {['bg-secondary', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'].map((c, i) => (
                  <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
                ))}
                <span className="text-xs text-muted-foreground">More</span>
              </div>
            </div>
          </div>

          {/* Top models table */}
          {summary?.top_models?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Top Models</h2>
              <div className="space-y-2">
                {summary.top_models.map((m, i) => {
                  const maxCount = summary.top_models[0].count
                  const pct = Math.round((m.count / maxCount) * 100)
                  return (
                    <div key={m.model} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-sm text-foreground metric flex-1 truncate">{m.model}</span>
                      <div className="w-32 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="metric text-xs text-muted-foreground w-16 text-right">{m.count.toLocaleString()} req</span>
                      <span className="metric text-xs text-muted-foreground w-24 text-right">{(m.total_tokens ?? 0).toLocaleString()} tok</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
