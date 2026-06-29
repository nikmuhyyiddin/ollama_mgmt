import { useState, useRef } from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { Thermometer, Zap, HardDrive } from 'lucide-react'

const MAX_HISTORY = 60

function getTemperatureColor(temp) {
  if (temp >= 85) return 'text-red-400'
  if (temp >= 70) return 'text-yellow-400'
  return 'text-emerald-400'
}

function getUtilColor(pct) {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-500'
  return 'bg-primary'
}

function getVramColor(pct) {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 75) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

export function GPUCard({ gpu }) {
  const vramPct = Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100)
  const historyRef = useRef([])

  // Maintain rolling history
  historyRef.current = [
    ...historyRef.current.slice(-(MAX_HISTORY - 1)),
    { util: gpu.utilization_pct },
  ]
  const history = historyRef.current

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">GPU {gpu.id}</span>
          <h3 className="text-sm font-semibold text-foreground mt-0.5 leading-tight">{gpu.name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      {/* VRAM bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <HardDrive className="w-3.5 h-3.5" /> VRAM
          </span>
          <span className="metric text-xs text-foreground">
            {gpu.vram_used_mb.toLocaleString()} / {gpu.vram_total_mb.toLocaleString()} MB
          </span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full gpu-bar-fill ${getVramColor(vramPct)}`}
            style={{ width: `${vramPct}%` }}
          />
        </div>
        <div className="text-right">
          <span className="metric text-xs text-muted-foreground">{vramPct}%</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Zap className="w-3.5 h-3.5" /> Utilisation
          </div>
          <div className="metric text-xl font-bold text-foreground">{gpu.utilization_pct}<span className="text-sm text-muted-foreground ml-0.5">%</span></div>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full gpu-bar-fill ${getUtilColor(gpu.utilization_pct)}`}
              style={{ width: `${gpu.utilization_pct}%` }}
            />
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Thermometer className="w-3.5 h-3.5" /> Temperature
          </div>
          <div className={`metric text-xl font-bold ${getTemperatureColor(gpu.temperature_c)}`}>
            {gpu.temperature_c}<span className="text-sm text-muted-foreground ml-0.5">°C</span>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${gpu.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="bg-card border border-border rounded px-2 py-1 text-xs metric">
                    {payload[0].value}%
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="util"
              stroke="hsl(217 91% 60%)"
              strokeWidth={1.5}
              fill={`url(#grad-${gpu.id})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
