import { KeyboardEvent, RefObject, useEffect, useRef, useState } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import { CameraOff, Maximize2, Minimize2, ScanFace, UserX, Users } from 'lucide-react'

export type FaceStatus = 'OK' | 'NO_FACE' | 'MULTIPLE_FACES' | 'FACE_MISMATCH'
export type LinkQuality = 'GOOD' | 'FAIR' | 'POOR' | 'OFFLINE'

interface WebcamThumbProps {
  /** Element the thumbnail may be dragged within. */
  constraintsRef: RefObject<HTMLElement | null>
  faceStatus: FaceStatus
  quality: LinkQuality
  onCameraLost?: () => void
}

const FACE: Record<FaceStatus, { label: string; cls: string; icon: typeof ScanFace }> = {
  OK: { label: 'Face verified', cls: 'bg-green-600/90', icon: ScanFace },
  NO_FACE: { label: 'No face', cls: 'bg-red-600/90', icon: UserX },
  MULTIPLE_FACES: { label: 'Multiple faces', cls: 'bg-red-600/90', icon: Users },
  FACE_MISMATCH: { label: 'Face mismatch', cls: 'bg-red-600/90', icon: UserX },
}

const QUALITY: Record<LinkQuality, { bars: number; label: string; cls: string }> = {
  GOOD: { bars: 3, label: 'Good', cls: 'bg-green-400' },
  FAIR: { bars: 2, label: 'Fair', cls: 'bg-amber-400' },
  POOR: { bars: 1, label: 'Poor', cls: 'bg-red-400' },
  OFFLINE: { bars: 0, label: 'Offline', cls: 'bg-slate-400' },
}

const STEP = 24

export default function WebcamThumb({ constraintsRef, faceStatus, quality, onCameraLost }: WebcamThumbProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<boolean | null>(null)
  const [large, setLarge] = useState(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const lostRef = useRef(onCameraLost)
  lostRef.current = onCameraLost

  useEffect(() => {
    const media = navigator.mediaDevices
    if (!media) {
      setLive(false)
      lostRef.current?.()
      return
    }
    let cancelled = false
    let stream: MediaStream | null = null
    media
      .getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
        setLive(true)
        s.getVideoTracks()[0]?.addEventListener('ended', () => {
          setLive(false)
          lostRef.current?.()
        })
      })
      .catch(() => {
        if (!cancelled) {
          setLive(false)
          lostRef.current?.()
        }
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Keyboard alternative to dragging; movement is clamped to the constraints element.
  const nudge = (dx: number, dy: number) => {
    const el = rootRef.current
    const box = constraintsRef.current
    if (!el || !box) return
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    x.set(x.get() + Math.min(Math.max(dx, b.left - r.left), b.right - r.right))
    y.set(y.get() + Math.min(Math.max(dy, b.top - r.top), b.bottom - r.bottom))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const moves: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    e.stopPropagation()
    nudge(m[0], m[1])
  }

  const face = FACE[faceStatus]
  const FaceIcon = face.icon
  const q = QUALITY[quality]

  return (
    <motion.div
      ref={rootRef}
      data-webcam
      role="group"
      tabIndex={0}
      aria-label="Webcam preview. Drag, or focus and use arrow keys, to move."
      drag
      dragConstraints={constraintsRef}
      dragMomentum={false}
      dragElastic={0}
      whileDrag={{ scale: 1.03 }}
      onKeyDown={onKeyDown}
      style={{ x, y }}
      className={`absolute bottom-4 right-4 z-30 cursor-grab overflow-hidden rounded-2xl border-2 bg-ink shadow-xl active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${faceStatus === 'OK' ? 'border-white' : 'border-danger'} ${large ? 'w-72' : 'w-44'}`}
    >
      <div className="relative aspect-[4/3]">
        <video ref={videoRef} data-proctor-camera autoPlay muted playsInline aria-hidden className={`h-full w-full object-cover [transform:scaleX(-1)] ${live ? '' : 'hidden'}`} />
        {!live && (
          <div className="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-700 to-slate-900 text-center text-white/70">
            <CameraOff className="h-6 w-6" aria-hidden />
            <span className="px-2 text-[10px]">{live === null ? 'Starting camera…' : 'Camera preview unavailable'}</span>
          </div>
        )}

        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden /> REC
        </span>

        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white" title={`Connection: ${q.label}`}>
          <span className="flex items-end gap-px" aria-hidden>
            {[1, 2, 3].map((b) => (
              <span key={b} className={`w-[3px] rounded-sm ${b <= q.bars ? q.cls : 'bg-white/30'}`} style={{ height: 3 + b * 3 }} />
            ))}
          </span>
          <span className="sr-only">Connection quality </span>
          {q.label}
        </span>

        <span role="status" className={`absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white ${face.cls}`}>
          <FaceIcon className="h-3 w-3" aria-hidden /> {face.label}
        </span>

        <button
          type="button"
          onClick={() => setLarge((v) => !v)}
          aria-label={large ? 'Shrink webcam preview' : 'Enlarge webcam preview'}
          className="absolute bottom-2 right-2 rounded-md bg-black/55 p-1 text-white hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-white"
        >
          {large ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>
    </motion.div>
  )
}
