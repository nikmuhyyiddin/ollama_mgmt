import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

// Catches render-time crashes (e.g. an unexpected API shape) so one bad page
// shows a recoverable fallback instead of white-screening the whole app.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <AlertTriangle className="w-12 h-12 mb-4 text-destructive opacity-70" />
        <h2 className="text-base font-semibold text-foreground mb-1">Something went wrong</h2>
        <p className="text-sm mb-4 max-w-md break-words">{String(this.state.error?.message || this.state.error)}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-all"
        >
          Try again
        </button>
      </div>
    )
  }
}
