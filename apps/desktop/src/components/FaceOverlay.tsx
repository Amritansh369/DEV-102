import { useEffect, useRef, type RefObject } from 'react'

export type LivenessStep = 'centre' | 'left' | 'right' | 'blink'
export type OverlayStatus = 'idle' | 'scanning' | 'captured' | 'failed'
export type DetectionMode = 'face-api' | 'simulated'

interface Pt { x: number; y: number }

/** Minimal surface of face-api.js we use. If window.faceapi is absent (or models are not loaded) we simulate. */
interface FaceApiLike {
  detectSingleFace(input: HTMLVideoElement): {
    withFaceLandmarks(): Promise<{ landmarks: { positions: ReadonlyArray<Pt> } } | undefined>
  }
}
const getFaceApi = (): FaceApiLike | undefined => (window as unknown as { faceapi?: FaceApiLike }).faceapi

interface FaceOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>
  step: LivenessStep
  status: OverlayStatus
  onDetection?: (found: boolean, mode: DetectionMode) => void
}

const YAW_TARGET: Record<LivenessStep, number> = { centre: 0, left: -0.9, right: 0.9, blink: 0 }
const COLOR: Record<OverlayStatus, string> = { idle: '#FFFFFF', scanning: '#1E6FF0', captured: '#16A34A', failed: '#DC2626' }

/** 68 normalised landmarks (face width ≈ 1), yaw in [-1,1], blink in [0,1]. */
function buildLandmarks(yaw: number, blink: number): Pt[] {
  const pts: Pt[] = []
  const push = (x: number, y: number, depth = 0) =>
    pts.push({ x: x * (1 - 0.22 * Math.abs(yaw)) + yaw * (0.16 + depth * 0.12), y })
  for (let i = 0; i < 17; i++) { const a = (Math.PI * i) / 16; push(-Math.cos(a) * 0.46, 0.08 + Math.sin(a) * 0.5) }
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const t = i / 4; push(s * (0.36 - t * 0.28), -0.27 - Math.sin(t * Math.PI) * 0.04) }
  for (let i = 0; i < 4; i++) push(0, -0.16 + i * 0.07, 0.5)
  for (let i = 0; i < 5; i++) push(-0.1 + i * 0.05, 0.12 + (i === 2 ? 0.02 : 0), 0.8)
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const a = (Math.PI * 2 * i) / 6; push(s * 0.2 + Math.cos(a) * 0.085, -0.13 + Math.sin(a) * 0.035 * (1 - blink * 0.9)) }
  for (let i = 0; i < 12; i++) { const a = (Math.PI * 2 * i) / 12; push(Math.cos(a) * 0.15, 0.33 + Math.sin(a) * 0.05, 0.2) }
  for (let i = 0; i < 8; i++) { const a = (Math.PI * 2 * i) / 8; push(Math.cos(a) * 0.1, 0.33 + Math.sin(a) * 0.025, 0.2) }
  return pts
}

export function FaceOverlay({ videoRef, step, status, onDetection }: FaceOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const realRef = useRef<Pt[] | null>(null)
  const poseRef = useRef({ yaw: 0, blink: 0 })
  const liveRef = useRef({ step, status })
  const onDetRef = useRef(onDetection)

  useEffect(() => { liveRef.current = { step, status } }, [step, status])
  useEffect(() => { onDetRef.current = onDetection }, [onDetection])

  // Detection: real face-api landmarks when available, otherwise "found" once video has frames.
  useEffect(() => {
    const faceApi = getFaceApi()
    let last: boolean | null = null
    let busy = false
    const report = (found: boolean) => {
      if (found === last) return
      last = found
      onDetRef.current?.(found, faceApi ? 'face-api' : 'simulated')
    }
    const id = window.setInterval(async () => {
      const v = videoRef.current
      if (!v || v.readyState < 2) return report(false)
      if (!faceApi) return report(true)
      if (busy) return
      busy = true
      try {
        const r = await faceApi.detectSingleFace(v).withFaceLandmarks()
        realRef.current = r ? [...r.landmarks.positions] : null
        report(Boolean(r))
      } catch {
        realRef.current = null
        report(false)
      } finally {
        busy = false
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [videoRef])

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { clientWidth: w, clientHeight: h } = parent
      sizeRef.current = { w, h }
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    resize()

    let raf = 0
    const draw = (ts: number) => {
      const { w, h } = sizeRef.current
      const { step: curStep, status: curStatus } = liveRef.current
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const rx = Math.min(w * 0.28, h * 0.3)
      const ry = Math.min(h * 0.42, rx * 1.3)

      // Dim everything outside the oval.
      ctx.fillStyle = 'rgba(15,23,42,0.55)'
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill('evenodd')

      ctx.strokeStyle = COLOR[curStatus]
      ctx.lineWidth = 3
      ctx.setLineDash(curStatus === 'idle' || curStatus === 'scanning' ? [10, 8] : [])
      ctx.lineDashOffset = -ts / 40
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])

      if (curStatus === 'scanning') {
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.clip()
        const y = cy - ry + ((ts / 1800) % 1) * ry * 2
        const g = ctx.createLinearGradient(0, y - 24, 0, y)
        g.addColorStop(0, 'rgba(30,111,240,0)')
        g.addColorStop(1, 'rgba(30,111,240,0.45)')
        ctx.fillStyle = g
        ctx.fillRect(cx - rx, y - 24, rx * 2, 24)
        ctx.restore()
      }

      let points: Pt[]
      const real = realRef.current
      const v = videoRef.current
      if (real && v && v.videoWidth > 0) {
        // Map video pixels to the (mirrored, object-cover) canvas.
        const s = Math.max(w / v.videoWidth, h / v.videoHeight)
        const ox = (w - v.videoWidth * s) / 2
        const oy = (h - v.videoHeight * s) / 2
        points = real.map((p) => ({ x: w - (ox + p.x * s), y: oy + p.y * s }))
      } else {
        const pose = poseRef.current
        const sway = Math.sin(ts / 900) * 0.04
        pose.yaw += (YAW_TARGET[curStep] + sway - pose.yaw) * 0.08
        const blinkNow = curStep === 'blink' && ts % 1400 < 180 ? 1 : 0
        pose.blink += (blinkNow - pose.blink) * 0.4
        const S = ry * 1.7
        points = buildLandmarks(pose.yaw, pose.blink).map((p) => ({ x: cx + p.x * S, y: cy - 0.1 * S + p.y * S }))
      }

      if (curStatus !== 'idle') {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        points.slice(0, 17).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        for (const p of points) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [videoRef])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />
}
