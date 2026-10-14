import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import type { Route } from '../lib/router'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

export function Check({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className="check" role="checkbox" aria-checked={checked} aria-label={label} onClick={onToggle}>
      {checked && <Icon name="check" size={18} />}
    </button>
  )
}

export function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {error && <div className="err-msg" role="alert">{error}</div>}
    </label>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  )
}

export function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

const NAV: [Route, string, IconName][] = [
  ['/', 'ホーム', 'home'],
  ['/do', '実行', 'bolt'],
  ['/life', '生活', 'pulse'],
  ['/review', '振り返り', 'moon'],
  ['/stats', '分析', 'chart'],
]

export function Nav({ route }: { route: Route }) {
  return (
    <nav className="nav" aria-label="メインメニュー">
      <ul>
        {NAV.map(([r, label, icon]) => (
          <li key={r}>
            <a href={`#${r}`} aria-current={route === r ? 'page' : undefined}>
              <Icon name={icon} />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

type IconName = 'home' | 'bolt' | 'pulse' | 'moon' | 'chart' | 'x' | 'check' | 'gear' | 'plus' | 'play' | 'pause' | 'left' | 'right' | 'alert' | 'back'
const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  back: 'M19 12H5M11 6l-6 6 6 6',
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const filled = name === 'play' || name === 'pause'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function TopBar({ title, sub, back, right }: { title: string; sub?: string; back?: string; right?: ReactNode }) {
  return (
    <header className="top">
      <div className="row grow">
        {back && (
          <a className="icon-btn" href={`#${back}`} aria-label="戻る">
            <Icon name="back" />
          </a>
        )}
        <div className="grow">
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      {right}
    </header>
  )
}

/** 単系列の棒グラフ。null は「記録なし」として棒を描かない（0 と区別） */
export function BarChart({ labels, values, format, goal, goalLabel, height = 120 }: { labels: string[]; values: (number | null)[]; format: (v: number) => string; goal?: number; goalLabel?: string; height?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const n = values.length
  const W = 320
  const H = height
  const pad = 18
  const max = Math.max(1, goal ?? 0, ...values.map((v) => v ?? 0))
  const slot = W / n
  const bw = Math.min(24, Math.max(3, slot - 2))
  const y = (v: number) => H - pad - (v / max) * (H - pad - 6)
  const step = n > 14 ? 7 : n > 7 ? 2 : 1
  const r = Math.min(4, bw / 2)
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${labels[0]}〜${labels[n - 1]}の推移`}>
        <line x1={0} x2={W} y1={H - pad} y2={H - pad} stroke="var(--line)" strokeWidth={1} />
        {goal != null && (
          <>
            <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--muted)" strokeWidth={1} />
            {goalLabel && (
              <text x={W} y={y(goal) - 4} textAnchor="end" fontSize={10} fill="var(--muted)">
                {goalLabel}
              </text>
            )}
          </>
        )}
        {values.map((v, i) => {
          const cx = i * slot + slot / 2
          const x = cx - bw / 2
          const top = v != null ? y(v) : H - pad
          const h = H - pad - top
          return (
            <g key={i} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {v == null ? (
                <line x1={cx - 2} x2={cx + 2} y1={H - pad - 3} y2={H - pad - 3} stroke="var(--dim)" strokeWidth={1.5} />
              ) : h > 0 ? (
                <path d={`M${x},${H - pad} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pad} Z`} fill="var(--accent)" opacity={sel == null || sel === i ? 1 : 0.4} />
              ) : null}
              {(n - 1 - i) % step === 0 ? (
                <text x={cx} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--dim)">
                  {labels[i]}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {sel != null && (
        <div className="tip" style={{ left: `${((sel + 0.5) / n) * 100}%` }}>
          {labels[sel]}：{values[sel] == null ? '記録なし' : format(values[sel]!)}
        </div>
      )}
      <details>
        <summary>数値を表で見る</summary>
        <table className="chart-table">
          <tbody>
            {labels.map((l, i) => (
              <tr key={i}>
                <td>{l}</td>
                <td>{values[i] == null ? '記録なし' : format(values[i]!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
