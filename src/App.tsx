import { Nav, Toasts } from './components/ui'
import { useRoute } from './lib/router'
import { useStore } from './lib/store'
import { Analytics } from './screens/Analytics'
import { CheckIn } from './screens/CheckIn'
import { Execution } from './screens/Execution'
import { Focus } from './screens/Focus'
import { Home } from './screens/Home'
import { Reset } from './screens/Reset'
import { Review } from './screens/Review'
import { Settings } from './screens/Settings'
import { Tracker } from './screens/Tracker'

const FULL = new Set(['/checkin', '/reset', '/focus', '/settings'])

export function App() {
  const { ready, loadError } = useStore()
  const { route, query } = useRoute()

  if (!ready) return <div className="loading">読み込み中…</div>
  if (loadError)
    return (
      <main className="app">
        <div className="card danger">
          <h2>データを読み込めませんでした</h2>
          <p className="small">{loadError}</p>
          <p className="small muted" style={{ marginTop: 8 }}>
            プライベートブラウズでは保存できない場合があります。通常のタブで開くか、他の LIFE OS のタブを閉じて再読み込みしてください。
          </p>
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => location.reload()}>
            再読み込み
          </button>
        </div>
      </main>
    )

  const full = FULL.has(route)
  return (
    <>
      <Toasts />
      <main className={`app${full ? ' full' : ''}`}>
        {route === '/' && <Home />}
        {route === '/do' && <Execution />}
        {route === '/life' && <Tracker />}
        {route === '/review' && <Review />}
        {route === '/stats' && <Analytics />}
        {route === '/checkin' && <CheckIn />}
        {route === '/reset' && <Reset />}
        {route === '/focus' && <Focus key={query.get('task') ?? ''} query={query} />}
        {route === '/settings' && <Settings />}
      </main>
      {!full && <Nav route={route} />}
    </>
  )
}
