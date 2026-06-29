import { useState, useEffect, useRef } from 'react'

export function useGPU() {
  const [gpuData, setGpuData] = useState([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${location.host}/ws/gpu`)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.gpus) setGpuData(data.gpus)
        } catch {
          // ignore malformed payloads
        }
      }
      ws.onclose = () => {
        setConnected(false)
        if (!cancelled) setTimeout(connect, 2000) // auto-reconnect
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      cancelled = true
      wsRef.current?.close()
    }
  }, [])

  return { gpuData, connected }
}
