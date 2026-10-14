import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { StoreProvider } from './lib/store'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)

// オフライン対応（本番ビルドのみ。HTTPS または localhost でのみ有効）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker 登録失敗', e))
  })
}
