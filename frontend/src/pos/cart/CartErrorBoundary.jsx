import { Component } from 'react'
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'

/** Isolates cart panel render errors so the product grid stays usable. */
export default class CartErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[POS Cart]', error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleClearCart = () => {
    this.props.onClearCart?.()
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4 min-h-0">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle size={22} className="text-red-500" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#071B52]">Cart could not load</p>
          <p className="text-xs text-[#64748B] mt-1">Products and checkout are still available.</p>
        </div>
        {this.state.error && (
          <pre className="text-[10px] text-left w-full max-h-24 overflow-auto bg-white/80 border border-[rgba(7,27,82,0.08)] rounded-lg p-2 text-red-600">
            {this.state.error.toString()}
          </pre>
        )}
        <div className="flex gap-2 w-full">
          <button type="button" onClick={this.handleRetry}
            className="flex-1 py-2 rounded-lg text-xs font-bold border border-[rgba(7,27,82,0.12)] bg-white text-[#071B52] flex items-center justify-center gap-1">
            <RefreshCw size={12} /> Retry
          </button>
          <button type="button" onClick={this.handleClearCart}
            className="flex-1 py-2 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-600 flex items-center justify-center gap-1">
            <Trash2 size={12} /> Clear cart
          </button>
        </div>
      </div>
    )
  }
}