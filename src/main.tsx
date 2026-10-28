import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Mealy render failed', error, info.componentStack)
  }
  render() {
    return this.state.error ? (
      <main className="screen">
        <h1>Something needs attention.</h1>
        <p role="alert">{this.state.error}</p>
        <button onClick={() => location.reload()}>Reload Mealy</button>
      </main>
    ) : (
      this.props.children
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
const updateSW = registerSW({
  onNeedRefresh() {
    document.querySelector('.updateNotice')?.remove()
    const notice = document.createElement('button')
    notice.className = 'updateNotice'
    notice.textContent = 'A new Mealy is ready. Tap to update.'
    notice.onclick = () => {
      void updateSW(true)
    }
    document.body.appendChild(notice)
  },
  onRegisterError(error) {
    console.error('Offline app-shell registration failed', error)
  },
})
