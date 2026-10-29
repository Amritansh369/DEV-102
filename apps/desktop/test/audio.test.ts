import { describe, expect, it } from 'vitest'
import { VoiceDetector, measure, type AudioEvent, type AudioFrame } from '../src/lib/audio'

const FRAME_MS = 100
const QUIET: AudioFrame = { voiceDb: -70, flatness: 0.8, totalDb: -55 }
const SPEECH: AudioFrame = { voiceDb: -35, flatness: 0.2, totalDb: -25 }
const DEAD: AudioFrame = { voiceDb: -Infinity, flatness: 1, totalDb: -Infinity }

/** Feeds `seconds` of one frame type and returns every event raised. */
function feed(d: VoiceDetector, frame: AudioFrame, seconds: number): AudioEvent[] {
  const out: AudioEvent[] = []
  for (let i = 0; i < (seconds * 1000) / FRAME_MS; i++) {
    const e = d.push(frame)
    if (e) out.push(e)
  }
  return out
}

/** A detector that has already learned a quiet room. */
function calibrated(room: AudioFrame = QUIET): VoiceDetector {
  const d = new VoiceDetector()
  expect(feed(d, room, 20)).toEqual([])
  return d
}

describe('VoiceDetector', () => {
  it('stays silent while learning the room, even if someone talks', () => {
    const d = new VoiceDetector()
    expect(feed(d, SPEECH, 10)).toEqual([])
    expect(feed(d, QUIET, 10)).toEqual([])
    expect(d.noiseFloorDb).not.toBeNull()
  })

  it('raises nothing in a quiet room', () => {
    expect(feed(calibrated(), QUIET, 60)).toEqual([])
  })

  it('raises one VOICE_DETECTED after 6 seconds of talking', () => {
    const d = calibrated()
    expect(feed(d, SPEECH, 5.9)).toEqual([])
    const events = feed(d, SPEECH, 2)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ code: 'VOICE_DETECTED', confidence: 0.6 })
    expect(events[0]!.message).toBe('Speech was detected for 6 of the last 10 seconds.')
  })

  it('ignores short sounds such as a cough or a sentence to themselves', () => {
    const d = calibrated()
    const events: AudioEvent[] = []
    for (let i = 0; i < 6; i++) events.push(...feed(d, SPEECH, 2), ...feed(d, QUIET, 8))
    expect(events).toEqual([])
  })

  it('ignores talking that fills only half of each window', () => {
    const d = calibrated()
    const events: AudioEvent[] = []
    for (let i = 0; i < 15; i++) events.push(...feed(d, SPEECH, 1), ...feed(d, QUIET, 1))
    expect(events).toEqual([])
  })

  it('reports a long conversation once per 6 seconds of speech, not every frame', () => {
    const events = feed(calibrated(), SPEECH, 30)
    expect(events).toHaveLength(5)
    expect(events.every((e) => e.code === 'VOICE_DETECTED')).toBe(true)
  })

  it('adapts to a noisy room and ignores loud but flat noise like a fan', () => {
    const noisy: AudioFrame = { voiceDb: -45, flatness: 0.9, totalDb: -35 }
    const d = calibrated(noisy)
    expect(feed(d, noisy, 30)).toEqual([])
    expect(feed(d, { voiceDb: -28, flatness: 0.9, totalDb: -20 }, 20)).toEqual([])
    expect(d.noiseFloorDb).toBeGreaterThan(-45)
  })

  it('still hears speech that rises clearly above a noisy room', () => {
    const d = calibrated({ voiceDb: -50, flatness: 0.9, totalDb: -40 })
    expect(feed(d, { voiceDb: -30, flatness: 0.25, totalDb: -22 }, 7)).toHaveLength(1)
  })

  it('raises MIC_BLOCKED once after 10 seconds of digital silence', () => {
    const d = calibrated()
    expect(feed(d, DEAD, 9.9)).toEqual([])
    const events = feed(d, DEAD, 30)
    expect(events).toEqual([expect.objectContaining({ code: 'MIC_BLOCKED' })])
  })

  it('raises MIC_BLOCKED again if the microphone comes back and then goes silent again', () => {
    const d = calibrated()
    expect(feed(d, DEAD, 11)).toHaveLength(1)
    expect(feed(d, QUIET, 5)).toEqual([])
    expect(feed(d, DEAD, 11)).toHaveLength(1)
  })

  it('notices a dead microphone even before calibration finishes', () => {
    expect(feed(new VoiceDetector(), DEAD, 10)).toEqual([expect.objectContaining({ code: 'MIC_BLOCKED' })])
  })
})

describe('measure', () => {
  const BINS = 1024
  const RATE = 48_000
  const binOf = (hz: number) => Math.round(hz / (RATE / 2 / BINS))

  it('reads digital silence as -Infinity', () => {
    expect(measure(new Float32Array(BINS).fill(-200), new Float32Array(2048), RATE).totalDb).toBe(-Infinity)
  })

  it('reads a full-scale square wave as 0 dBFS', () => {
    const time = Float32Array.from({ length: 2048 }, (_, i) => (i % 2 ? 1 : -1))
    expect(measure(new Float32Array(BINS).fill(-100), time, RATE).totalDb).toBeCloseTo(0, 5)
  })

  it('gives tonal sound in the speech band a low flatness', () => {
    const freq = new Float32Array(BINS).fill(-100)
    for (const hz of [200, 400, 600, 800, 1000]) freq[binOf(hz)] = -20
    const f = measure(freq, new Float32Array(2048).fill(0.1), RATE)
    expect(f.flatness).toBeLessThan(0.2)
    expect(f.voiceDb).toBeGreaterThan(-60)
  })

  it('gives even noise a flatness near 1', () => {
    const f = measure(new Float32Array(BINS).fill(-60), new Float32Array(2048).fill(0.01), RATE)
    expect(f.flatness).toBeCloseTo(1, 5)
    expect(f.voiceDb).toBeCloseTo(-60, 5)
  })

  it('ignores energy outside 300-3400 Hz', () => {
    const freq = new Float32Array(BINS).fill(-100)
    freq[binOf(100)] = -10
    freq[binOf(8000)] = -10
    expect(measure(freq, new Float32Array(2048).fill(0.1), RATE).voiceDb).toBeCloseTo(-100, 5)
  })
})
