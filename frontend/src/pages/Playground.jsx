import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import api from '../api'
import { MessageSquare, Send, Columns2, Square, Trash2, User, Bot } from 'lucide-react'

// Stream one chat turn from /api/chat (JWT-gated). Calls onToken for each
// content delta and onDone with the final stats chunk from Ollama.
async function streamChat(model, messages, onToken, signal) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify({ model, messages }),
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let final = null
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()  // keep the trailing partial line
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.message?.content) onToken(data.message.content)
        if (data.done) final = data
      } catch { /* ignore partial JSON */ }
    }
  }
  return final
}

// tokens/s from Ollama's final chunk (eval_duration is in nanoseconds).
function tokensPerSec(final) {
  if (!final?.eval_count || !final?.eval_duration) return null
  return (final.eval_count / (final.eval_duration / 1e9)).toFixed(1)
}

function Pane({ pane, models, onModelChange, single }) {
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [pane.messages, pane.streaming])

  return (
    <div className={`flex flex-col min-h-0 bg-card border border-border rounded-xl ${single ? '' : 'flex-1'}`}>
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Bot className="w-4 h-4 text-primary flex-shrink-0" />
        <select
          value={pane.model}
          onChange={e => onModelChange(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-input border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {models.length === 0 && <option value="">No models</option>}
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {pane.statsLabel && <span className="text-xs text-muted-foreground whitespace-nowrap">{pane.statsLabel}</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {pane.messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">Send a message to start the conversation.</p>
        )}
        {pane.messages.map((m, i) => (
          <div key={i} className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
              {m.role === 'user' ? <User className="w-3.5 h-3.5 text-muted-foreground" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
            </div>
            <div className="text-sm text-foreground whitespace-pre-wrap break-words flex-1">
              {m.content || (pane.streaming && i === pane.messages.length - 1 ? '…' : '')}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

export default function Playground() {
  const [models, setModels] = useState([])
  const [compare, setCompare] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // One pane in single mode, two in compare mode.
  const [panes, setPanes] = useState([
    { model: '', messages: [], streaming: false, statsLabel: '' },
    { model: '', messages: [], streaming: false, statsLabel: '' },
  ])
  const abortRef = useRef(null)

  useEffect(() => {
    api.get('/api/models')
      .then(({ data }) => {
        const names = (data.models || []).map(m => m.name)
        setModels(names)
        setPanes(p => p.map((pane, i) => ({ ...pane, model: pane.model || names[i] || names[0] || '' })))
      })
      .catch(() => toast.error('Failed to load models'))
  }, [])

  const activePanes = compare ? [0, 1] : [0]

  function setPane(idx, patch) {
    setPanes(p => p.map((pane, i) => (i === idx ? { ...pane, ...patch } : pane)))
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const targets = activePanes.filter(i => panes[i].model)
    if (targets.length === 0) { toast.error('Pick a model first'); return }

    setBusy(true)
    setInput('')
    abortRef.current = new AbortController()

    // Append the user turn + an empty assistant turn to each active pane.
    setPanes(p => p.map((pane, i) =>
      targets.includes(i)
        ? { ...pane, streaming: true, statsLabel: '', messages: [...pane.messages, { role: 'user', content: text }, { role: 'assistant', content: '' }] }
        : pane
    ))

    await Promise.all(targets.map(async (idx) => {
      const history = [...panes[idx].messages, { role: 'user', content: text }]
      const t0 = performance.now()
      try {
        const final = await streamChat(
          panes[idx].model,
          history,
          (delta) => setPanes(p => p.map((pane, i) => {
            if (i !== idx) return pane
            const msgs = pane.messages.slice()
            msgs[msgs.length - 1] = { role: 'assistant', content: msgs[msgs.length - 1].content + delta }
            return { ...pane, messages: msgs }
          })),
          abortRef.current.signal,
        )
        const ms = Math.round(performance.now() - t0)
        const tps = tokensPerSec(final)
        setPane(idx, { streaming: false, statsLabel: `${(ms / 1000).toFixed(1)}s${tps ? ` · ${tps} tok/s` : ''}` })
      } catch (err) {
        if (err.name !== 'AbortError') toast.error(`Chat failed: ${err.message}`)
        setPane(idx, { streaming: false })
      }
    }))
    setBusy(false)
  }

  function stop() {
    abortRef.current?.abort()
    setBusy(false)
    setPanes(p => p.map(pane => ({ ...pane, streaming: false })))
  }

  function clear() {
    abortRef.current?.abort()
    setPanes(p => p.map(pane => ({ ...pane, messages: [], streaming: false, statsLabel: '' })))
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Playground</h1>
        <span className="text-xs text-muted-foreground">Chat with installed models{compare ? ' — comparing two side by side' : ''}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCompare(c => !c)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${compare ? 'bg-primary/15 text-primary border border-primary/20' : 'bg-secondary text-secondary-foreground hover:bg-accent'}`}
          >
            <Columns2 className="w-3.5 h-3.5" /> Compare
          </button>
          <button onClick={clear}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:bg-accent transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>

      <div className={`flex-1 min-h-0 grid gap-4 ${compare ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {activePanes.map(idx => (
          <Pane key={idx} pane={panes[idx]} models={models} single={!compare}
            onModelChange={(v) => setPane(idx, { model: v })} />
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="flex-1 px-3 py-2 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        {busy ? (
          <button onClick={stop}
            className="flex items-center gap-2 px-4 py-2.5 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold hover:bg-destructive/90 transition-all">
            <Square className="w-4 h-4" /> Stop
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim()}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
            <Send className="w-4 h-4" /> Send
          </button>
        )}
      </div>
    </div>
  )
}
