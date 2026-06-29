import { useRef } from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { Cpu, MemoryStick, HardDrive } from 'lucide-react'

const MAX_HISTORY = 60

function getUsageColor(pct) {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 75) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

function Sparkline({ data, dataKey, gradientId, color }) {
  return (
    <div className="h-12">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="bg-card border border-border rounded px-2 py-1 text-xs metric">
                  {Math.round(payload[0].value)}%
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SystemPanel({ system }) {
  const cpuHistoryRef = useRef([])
  const memHistoryRef = useRef([])

  cpuHistoryRef.current = [
    ...cpuHistoryRef.current.slice(-(MAX_HISTORY - 1)),
    { v: system.cpu.percent },
  ]
  memHistoryRef.current = [
    ...memHistoryRef.current.slice(-(MAX_HISTORY - 1)),
    { v: system.memory.percent },
  ]

  const memUsedGb = (system.memory.used_mb / 1024).toFixed(1)
  const memTotalGb = (system.memory.total_mb / 1024).toFixed(1)
  const swapUsedGb = (system.memory.swap_used_mb / 1024).toFixed(1)
  const swapTotalGb = (system.memory.swap_total_mb / 1024).toFixed(1)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* CPU */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CPU</span>
            <h3 className="text-sm font-semibold text-foreground mt-0.5 leading-tight flex items-center gap-1.5">
              <Cpu className="w-4 h-4" /> {system.cpu.count} threads
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">Utilisation</div>
          <div className="metric text-2xl font-bold text-foreground">
            {Math.round(system.cpu.percent)}<span className="text-sm text-muted-foreground ml-0.5">%</span>
          </div>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full gpu-bar-fill ${getUsageColor(system.cpu.percent)}`}
              style={{ width: `${system.cpu.percent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['1m', system.cpu.load_avg_1],
            ['5m', system.cpu.load_avg_5],
            ['15m', system.cpu.load_avg_15],
          ].map(([label, val]) => (
            <div key={label} className="bg-secondary/30 rounded p-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Load {label}</div>
              <div className="metric text-sm font-semibold text-foreground">{val.toFixed(2)}</div>
            </div>
          ))}
        </div>

        <Sparkline data={cpuHistoryRef.current} dataKey="v" gradientId="grad-cpu" color="hsl(217 91% 60%)" />
      </div>

      {/* Memory */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">MEMORY</span>
            <h3 className="text-sm font-semibold text-foreground mt-0.5 leading-tight flex items-center gap-1.5">
              <MemoryStick className="w-4 h-4" /> {memTotalGb} GB total
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">RAM</span>
            <span className="metric text-xs text-foreground">{memUsedGb} / {memTotalGb} GB</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full gpu-bar-fill ${getUsageColor(system.memory.percent)}`}
              style={{ width: `${system.memory.percent}%` }}
            />
          </div>
          <div className="text-right">
            <span className="metric text-xs text-muted-foreground">{system.memory.percent}%</span>
          </div>
        </div>

        {system.memory.swap_total_mb > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Swap</span>
              <span className="metric text-xs text-foreground">{swapUsedGb} / {swapTotalGb} GB</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full gpu-bar-fill bg-purple-500"
                style={{
                  width: `${
                    system.memory.swap_total_mb > 0
                      ? (system.memory.swap_used_mb / system.memory.swap_total_mb) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        <Sparkline data={memHistoryRef.current} dataKey="v" gradientId="grad-mem" color="hsl(280 70% 60%)" />
      </div>

      {/* Disk */}
      <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">DISK</span>
            <h3 className="text-sm font-semibold text-foreground mt-0.5 leading-tight flex items-center gap-1.5">
              <HardDrive className="w-4 h-4" /> {system.disks.length} mount{system.disks.length === 1 ? '' : 's'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>

        <div className="space-y-3 flex-1">
          {system.disks.length === 0 ? (
            <div className="text-xs text-muted-foreground">No disks reported</div>
          ) : (
            system.disks.map((d) => (
              <div key={d.path} className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="metric text-xs text-foreground">{d.path}</span>
                  <span className="metric text-xs text-muted-foreground">
                    {d.used_gb} / {d.total_gb} GB
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full gpu-bar-fill ${getUsageColor(d.percent)}`}
                    style={{ width: `${d.percent}%` }}
                  />
                </div>
                <div className="text-right">
                  <span className="metric text-[10px] text-muted-foreground">{d.percent}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
