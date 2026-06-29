import { useGPU } from '../hooks/useGPU'
import { useSystem } from '../hooks/useSystem'
import { GPUCard } from '../components/GPUCard'
import { SystemPanel } from '../components/SystemPanel'
import { WifiOff } from 'lucide-react'

export default function Dashboard() {
  const { gpuData, connected } = useGPU()
  const { systemData, connected: systemConnected } = useSystem()
  const allConnected = connected && systemConnected

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">System Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Real-time telemetry: GPU, CPU, memory, disk</p>
        </div>
        <div className="flex items-center gap-2">
          {allConnected ? (
            <>
              <span className="live-dot w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Reconnecting…</span>
            </>
          )}
        </div>
      </div>

      {/* System (CPU / RAM / Disk) */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Host</h2>
        {systemData ? (
          <SystemPanel system={systemData} />
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin mb-3" />
            <p className="text-sm">Connecting to system telemetry…</p>
          </div>
        )}
      </div>

      {/* GPU cards grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">GPUs</h2>
        {gpuData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin mb-3" />
            <p className="text-sm">Connecting to GPU telemetry…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {gpuData.map((gpu) => (
              <GPUCard key={gpu.id} gpu={gpu} />
            ))}
          </div>
        )}
      </div>

      {/* Summary bar */}
      {gpuData.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mt-2">
          {[
            { label: 'Total VRAM', value: `${(gpuData.reduce((s, g) => s + g.vram_total_mb, 0) / 1024).toFixed(1)} GB` },
            { label: 'VRAM In Use', value: `${(gpuData.reduce((s, g) => s + g.vram_used_mb, 0) / 1024).toFixed(1)} GB` },
            { label: 'Avg Utilisation', value: `${Math.round(gpuData.reduce((s, g) => s + g.utilization_pct, 0) / gpuData.length)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="metric text-lg font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
