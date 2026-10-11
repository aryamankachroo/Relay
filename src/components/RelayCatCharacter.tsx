import { useEffect, useRef, useState } from 'react'
import { Alignment, Fit, Layout } from '@rive-app/webgl2'
import { useRive } from '@rive-app/react-webgl2'

const RIVE_SRC = '/animations/relay-cat.riv'
const STATE_MACHINE = 'State Machine 1'
/** Soft follow so page-wide pointer updates don't feel jittery. */
const FOLLOW_SMOOTHING = 0.18

type RelayCatCharacterProps = {
  /** Element that owns pointer tracking (defaults to the window). */
  trackingRoot?: HTMLElement | null
}

export function RelayCatCharacter({ trackingRoot = null }: RelayCatCharacterProps) {
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const smoothed = useRef({ x: 0, y: 0, primed: false })
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)

  const { rive, RiveComponent, canvas } = useRive({
    src: RIVE_SRC,
    artboard: 'RobotCat_02',
    stateMachine: STATE_MACHINE,
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.BottomCenter,
    }),
    onLoad: () => {
      setReady(true)
      setFailed(false)
    },
    onLoadError: () => {
      setFailed(true)
      setReady(false)
    },
  })

  useEffect(() => {
    if (!rive || !import.meta.env.DEV) return
    const contents = rive.contents
    const summary = {
      artboards: contents.artboards?.map((board) => board.name),
      stateMachineNames: rive.stateMachineNames,
      contents,
    }
    console.info('[RelayCat] Rive contents', summary)
    ;(window as Window & { __relayCatMeta?: typeof summary }).__relayCatMeta = summary
  }, [rive])

  useEffect(() => {
    if (!rive || !canvas || !ready || failed) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduceMotion.matches) {
      rive.pause()
      return
    }

    const flush = () => {
      rafRef.current = null
      const pending = pendingRef.current
      if (!pending) return

      const { x, y } = pending
      if (!smoothed.current.primed) {
        smoothed.current = { x, y, primed: true }
      } else {
        smoothed.current.x += (x - smoothed.current.x) * FOLLOW_SMOOTHING
        smoothed.current.y += (y - smoothed.current.y) * FOLLOW_SMOOTHING
      }

      const canvasRect = canvas.getBoundingClientRect()
      if (canvasRect.width < 1 || canvasRect.height < 1) return

      // HitPointerMove is authored in the .riv. Map the tracking root into the
      // canvas so pond-wide cursor motion stays inside the artboard hit target.
      const rootRect = trackingRoot?.getBoundingClientRect()
      let clientX = smoothed.current.x
      let clientY = smoothed.current.y
      if (rootRect && rootRect.width > 0 && rootRect.height > 0) {
        const nx = Math.min(1, Math.max(0, (smoothed.current.x - rootRect.left) / rootRect.width))
        const ny = Math.min(1, Math.max(0, (smoothed.current.y - rootRect.top) / rootRect.height))
        clientX = canvasRect.left + nx * canvasRect.width
        clientY = canvasRect.top + ny * canvasRect.height
      }

      canvas.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX,
          clientY,
          bubbles: false,
          cancelable: false,
          view: window,
        }),
      )

      const dx = Math.abs(x - smoothed.current.x)
      const dy = Math.abs(y - smoothed.current.y)
      if (dx > 0.4 || dy > 0.4) {
        rafRef.current = window.requestAnimationFrame(flush)
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      pendingRef.current = { x: event.clientX, y: event.clientY }
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(flush)
      }
    }

    const root: EventTarget = trackingRoot ?? window
    root.addEventListener('pointermove', onPointerMove as EventListener, { passive: true })

    const onReduceMotionChange = () => {
      if (reduceMotion.matches) rive.pause()
      else rive.play()
    }
    reduceMotion.addEventListener('change', onReduceMotionChange)

    return () => {
      root.removeEventListener('pointermove', onPointerMove as EventListener)
      reduceMotion.removeEventListener('change', onReduceMotionChange)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [rive, canvas, ready, failed, trackingRoot])

  if (failed) return null

  return (
    <div className={ready ? 'relay-cat is-ready' : 'relay-cat'} aria-hidden="true">
      <RiveComponent className="relay-cat-stage" />
    </div>
  )
}
