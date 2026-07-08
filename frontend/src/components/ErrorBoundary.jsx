import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Global React Error Boundary.
 * Catches any unhandled render errors and shows a recovery UI instead of a blank screen.
 *
 * Wrap your app (or page sections) with this:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    // Log to console — Sentry will pick this up automatically if configured
    console.error('[ErrorBoundary]', error, info)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, info: null })
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, info: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { fallback } = this.props
    if (fallback) return fallback

    return (
      <div className="fixed inset-0 bg-bg flex items-center justify-center p-6 z-50">
        <div className="max-w-md w-full text-center space-y-6">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red-400" />
          </div>

          {/* Copy */}
          <div>
            <h2 className="font-display text-xl font-bold text-txt mb-2">Something went wrong</h2>
            <p className="text-txt-3 text-sm">
              An unexpected error occurred. Your data is safe — this only affects the display.
            </p>
          </div>

          {/* Error detail — always shown so we can debug */}
          {this.state.error && (
            <pre className="text-left text-[10px] bg-white/[0.03] border border-white/10 rounded-xl p-4 text-red-300 overflow-auto max-h-40">
              {this.state.error.toString()}
              {this.state.info?.componentStack?.split('\n').slice(0,6).join('\n')}
            </pre>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 rounded-xl border border-white/10 bg-glass text-txt-2 text-sm font-semibold hover:bg-white/10 transition-all"
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="btn-gold px-5 py-2.5 flex items-center gap-2 text-sm font-bold"
            >
              <RefreshCw size={14} /> Reload App
            </button>
          </div>

          {/* Branding */}
          <p className="text-txt-3 text-xs">DGC RetailOS</p>
        </div>
      </div>
    )
  }
}
