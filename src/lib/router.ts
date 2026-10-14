import { useEffect, useState } from 'react'

// ハッシュベースの簡易ルーター（静的ホスティング・オフラインでも動く）
export type Route = '/' | '/do' | '/life' | '/review' | '/stats' | '/settings' | '/checkin' | '/reset' | '/focus'

const ROUTES: Route[] = ['/', '/do', '/life', '/review', '/stats', '/settings', '/checkin', '/reset', '/focus']

function parse(): { route: Route; query: URLSearchParams } {
  const raw = location.hash.replace(/^#/, '') || '/'
  const [path, q = ''] = raw.split('?')
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : '/'
  return { route, query: new URLSearchParams(q) }
}

export function useRoute() {
  const [state, setState] = useState(parse)
  useEffect(() => {
    const on = () => {
      setState(parse())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return state
}

export function go(path: string) {
  location.hash = path
}
