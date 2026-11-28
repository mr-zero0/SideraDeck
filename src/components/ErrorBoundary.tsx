import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { fallback: ReactNode; label: string; children: ReactNode }
type State = { failed: boolean }

/** Isolates a failing subtree (a texture, the canvas, a panel) so the rest of the app keeps working. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack)
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
