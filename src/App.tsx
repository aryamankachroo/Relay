import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Show, useAuth, UserButton } from '@clerk/react-router'
import { setAuthTokenProvider } from './api/client.ts'
import { GlassCard } from './components/GlassCard.tsx'

export default function App({ children }: { children: ReactNode }) {
  const [introComplete, setIntroComplete] = useState(false)
  const finishIntro = useCallback(() => setIntroComplete(true), [])

  return (
    <>
      <ClerkSession />
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <div className="app-shell">
          <div className="atmosphere" aria-hidden="true"><NeighborhoodScene /></div>
          {introComplete ? children : <RelayIntro onDone={finishIntro} />}
        </div>
      </Show>
    </>
  )
}

// Adapted from ACA's Scene.tsx / geometry.ts: the same 8 × 8 isometric town.
const TW = 180, TH = 90, N = 8, ROAD_I = 3, ROAD_J = 4
const iso = (i: number, j: number) => ({ x: 800 + (i - j) * TW / 2, y: 170 + (i + j) * TH / 2 })
const diamond = (i: number, j: number, scale = 0.98) => {
  const { x, y } = iso(i, j), a = TW / 2 * scale, b = TH / 2 * scale
  return `${x},${y - b} ${x + a},${y} ${x},${y + b} ${x - a},${y}`
}
const homes = [
  { name: 'Your home', at: [2, 7], roof: 'var(--aqua)' },
  { name: 'Maya', at: [0, 5], roof: 'var(--sun)' },
  { name: 'Dev', at: [5, 0], roof: 'var(--leaf)' },
  { name: 'Rosa', at: [7, 2], roof: 'var(--sky)' },
  { name: 'Sam', at: [0, 2], roof: 'var(--rose)' },
]

function ClerkSession() {
  const { getToken, isSignedIn } = useAuth()
  setAuthTokenProvider(() => (isSignedIn ? getToken() : Promise.resolve(null)))
  return null
}

function House({ i, j, roof, lit, h = 64 }: { i: number; j: number; roof: string; lit: boolean; h?: number }) {
  const c = iso(i, j), a = TW * 0.28, b = a / 2, y = c.y - 6;
  const P = (pts: number[][]) => pts.map((p) => p.join(",")).join(" ");
  const L = [[c.x - a, y], [c.x, y + b], [c.x, y + b - h], [c.x - a, y - h]];
  const R = [[c.x, y + b], [c.x + a, y], [c.x + a, y - h], [c.x, y + b - h]];
  const apex = [c.x, y - h - 46];
  return (
    <g>
      <polygon points={P([[c.x - a, c.y + 4], [c.x, c.y + 4 + b], [c.x + a * 2.6, c.y + 4 + b * 0.2], [c.x + a * 1.4, c.y + 4 - b * 0.8]])} fill="var(--shadow-cast)" filter="url(#town-blur)" />
      <ellipse cx={c.x} cy={c.y + 10} rx={a * 2} ry={a * 0.8} fill={roof} opacity={lit ? 0.45 : 0.22} filter="url(#town-blur)" />
      <polygon points={P(L)} fill="url(#town-glass-left)" stroke="var(--aqua)" strokeOpacity={0.6} strokeWidth={1.2} />
      <polygon points={P(R)} fill="url(#town-glass-right)" stroke="var(--aqua)" strokeOpacity={0.9} strokeWidth={1.2} />
      {[0.3, 0.65].map((t) => (
        <polygon key={t} fill="var(--window)" opacity={0.9} filter="url(#town-soft)"
          points={P([[c.x - a * (1 - t) - 8, y + b * t - h * 0.55], [c.x - a * (1 - t) + 6, y + b * t - h * 0.55 + 7], [c.x - a * (1 - t) + 6, y + b * t - h * 0.3 + 7], [c.x - a * (1 - t) - 8, y + b * t - h * 0.3]])} />
      ))}
      <polygon fill="var(--window)" opacity={0.75} filter="url(#town-soft)"
        points={P([[c.x + a * 0.35, y + b * 0.65 - h * 0.6], [c.x + a * 0.7, y + b * 0.3 - h * 0.6], [c.x + a * 0.7, y + b * 0.3 - h * 0.3], [c.x + a * 0.35, y + b * 0.65 - h * 0.3]])} />
      <polygon points={P([L[3]!, L[2]!, apex])} fill={roof} opacity={0.75} />
      <polygon points={P([R[3]!, R[2]!, apex])} fill={roof} />
      <polyline points={P([L[3]!, apex, R[2]!])} fill="none" stroke="var(--highlight)" strokeOpacity={0.7} strokeWidth={1.5} />
    </g>
  );
}

/** ACA's glossy figure, with CSS gait and road movement instead of a loan store. */
function Stroller({ from, to, tone, duration, delay }: {
  from: [number, number]; to: [number, number]; tone: string; duration: number; delay: number
}) {
  const a = iso(...from), b = iso(...to)
  const style = {
    '--walk-start-x': `${a.x}px`, '--walk-start-y': `${a.y}px`,
    '--walk-end-x': `${b.x}px`, '--walk-end-y': `${b.y}px`,
    '--walk-duration': `${duration}s`, '--walk-delay': `${delay}s`,
  } as CSSProperties
  return (
    <g className="town-stroller" style={style}>
      <g transform="scale(1.4)">
        <ellipse rx="11" ry="4.5" fill="var(--shadow-cast)" />
        <g className="town-figure-bob">
          <g className="town-figure-facing">
            <line className="town-limb town-leg-left" x1="-3" y1="-14" x2="-3" y2="-1" stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" />
            <line className="town-limb town-leg-right" x1="3" y1="-14" x2="3" y2="-1" stroke="var(--ink)" strokeWidth="3.5" strokeLinecap="round" />
            <rect x="-7" y="-30" width="14" height="18" rx="6" fill={tone} stroke="white" strokeOpacity="0.8" />
            <rect x="-4" y="-28" width="4" height="8" rx="2" fill="white" opacity="0.6" />
            <line className="town-limb town-arm-left" x1="-6" y1="-26" x2="-9" y2="-16" stroke={tone} strokeWidth="3" strokeLinecap="round" />
            <line className="town-limb town-arm-right" x1="6" y1="-26" x2="9" y2="-16" stroke={tone} strokeWidth="3" strokeLinecap="round" />
            <circle cy="-38" r="7.5" fill="#f4cf94" stroke="white" strokeOpacity="0.8" />
            <circle cx="3" cy="-39" r="1.2" fill="var(--ink)" />
            <circle cx="-2" cy="-41" r="2.2" fill="white" opacity="0.7" />
          </g>
        </g>
      </g>
    </g>
  )
}

function NeighborhoodScene() {
  const park = iso(7, 0)
  return (
    <div className="neighborhood-scene">
      <div className="town-sun" />
      <div className="town-cloud town-cloud-a" />
      <div className="town-cloud town-cloud-b" />
      <svg className="town-map" viewBox="0 0 1600 1000" focusable="false">
        <defs>
          <linearGradient id="town-glass-left" x2="0" y2="1">
            <stop stopColor="var(--sky)" stopOpacity="0.35" /><stop offset="1" stopColor="var(--tile)" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="town-glass-right" x2="0" y2="1">
            <stop stopColor="var(--aqua)" stopOpacity="0.45" /><stop offset="1" stopColor="var(--tile)" stopOpacity="0.7" />
          </linearGradient>
          <filter id="town-blur"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="town-soft"><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>
        {Array.from({ length: N * N }, (_, k) => {
          const i = k % N, j = Math.floor(k / N)
          return <polygon key={k} points={diamond(i, j)} fill={i === ROAD_I || j === ROAD_J ? 'var(--road)' : 'var(--tile)'} stroke="white" strokeOpacity="0.9" />
        })}
        {[[ROAD_I, -0.5, ROAD_I, N - 0.5], [-0.5, ROAD_J, N - 0.5, ROAD_J]].map(([i, j, endI, endJ], k) => {
          const a = iso(i, j), b = iso(endI, endJ)
          return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--sky)" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="14 14" />
        })}
        <g>
          <polygon points={diamond(7, 0, 0.94)} fill="var(--leaf)" opacity="0.55" stroke="white" />
          <ellipse cx={park.x + 18} cy={park.y + 4} rx="34" ry="14" fill="var(--sky)" stroke="white" />
          {[8, 20, 30].map((x) => <ellipse key={x} cx={park.x + x} cy={park.y + 3} rx="5" ry="2.5" fill="var(--leaf)" />)}
          {[[-56, 0], [44, -10], [-20, -22], [60, 10], [-70, 14]].map(([x, y], k) => (
            <g key={k} transform={`translate(${park.x + x},${park.y + y})`}>
              <ellipse cx="6" cy="1" rx="12" ry="4" fill="var(--shadow-cast)" />
              <line y2="-10" stroke="var(--ink-soft)" strokeWidth="3" />
              <circle cy="-20" r="13" fill="var(--leaf)" stroke="white" strokeOpacity="0.7" />
              <circle cx="-4" cy="-24" r="4" fill="white" opacity="0.5" />
            </g>
          ))}
        </g>
        {[[3, 1], [3, 6], [1, 4], [6, 4], [3, 3]].map(([i, j], k) => {
          const p = iso(i + 0.35, j - 0.35)
          return <g key={k}><ellipse cx={p.x} cy={p.y} rx="26" ry="12" fill="var(--sun)" opacity="0.16" /><line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 46} stroke="var(--ink-soft)" strokeWidth="2.5" /><circle cx={p.x} cy={p.y - 48} r="5" fill="var(--window)" /></g>
        })}
        {homes.map(({ name, at, roof }) => <House key={name} i={at[0]} j={at[1]} roof={roof} lit />)}
        <Stroller from={[3.3, -0.2]} to={[3.3, 7.2]} tone="var(--leaf)" duration={46} delay={-10} />
        <Stroller from={[7.2, 3.7]} to={[-0.2, 3.7]} tone="var(--sun)" duration={52} delay={-30} />
      </svg>
      <div className="town-fog" />
    </div>
  )
}

function RelayIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(onDone, reduced ? 300 : 3300)
    return () => window.clearTimeout(timer)
  }, [onDone])

  return (
    <section className="relay-intro" aria-label="Welcome to Relay">
      <div className="intro-copy">
        <h1>Relay</h1>
        <p>Good things are closer than you think.</p>
      </div>
    </section>
  )
}

export function AuthPage({ signUp = false, children }: { signUp?: boolean; children: ReactNode }) {
  return (
    <main className="login-page">
      <div className="login-brand"><span>Relay</span></div>
      <section className="login-content" aria-labelledby="login-title">
        <GlassCard tone="glass" className="login-card">
          <Show when="signed-out">
            <p className="eyebrow">{signUp ? 'Join your neighborhood' : 'Share nearby'}</p>
            <h1 id="login-title">{signUp ? 'Make yourself at home.' : 'Before you buy it, find it nearby.'}</h1>
            <p className="login-description">{signUp ? 'Create an account to find what you need and share what you have.' : "Tell Relay what you're making. Neighbors light up with what they can lend."}</p>
            <div className="relay-auth-form">{children}</div>
          </Show>
          <Show when="signed-in">
            <p className="eyebrow">Share nearby</p>
            <h1 id="login-title">Welcome to Relay.</h1>
            <p className="login-description">You're signed in. Your neighborhood is right here.</p>
            <div className="relay-account"><UserButton /><span>Manage your account</span></div>
          </Show>
        </GlassCard>
      </section>
    </main>
  )
}
