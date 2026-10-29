import { describe, expect, it } from 'vitest'
import type { SubmitVariant } from '../src/screens/Submitted'

describe('Submission Variant Resolution', () => {
  const resolveVariant = (submission: { disqualified?: boolean; autoSubmitted?: boolean } | null): SubmitVariant => {
    if (submission?.disqualified) return 'DISQUALIFIED'
    if (submission?.autoSubmitted) return 'AUTO_SUBMITTED'
    return 'SUBMITTED'
  }

  it('resolves normal submission to SUBMITTED', () => {
    expect(resolveVariant({ autoSubmitted: false })).toBe('SUBMITTED')
    expect(resolveVariant(null)).toBe('SUBMITTED')
  })

  it('resolves auto-submission to AUTO_SUBMITTED', () => {
    expect(resolveVariant({ autoSubmitted: true })).toBe('AUTO_SUBMITTED')
  })

  it('resolves terminated/disqualified session to DISQUALIFIED', () => {
    expect(resolveVariant({ autoSubmitted: true, disqualified: true })).toBe('DISQUALIFIED')
    expect(resolveVariant({ disqualified: true })).toBe('DISQUALIFIED')
  })
})

describe('Submission Reason Formatting', () => {
  const formatReason = (reason?: string) => (reason === 'TIME_UP' ? 'Time limit reached' : reason)

  it('formats TIME_UP to human readable message', () => {
    expect(formatReason('TIME_UP')).toBe('Time limit reached')
  })

  it('preserves custom policy violation messages', () => {
    expect(formatReason('Violation limit reached: MULTIPLE_FACES')).toBe('Violation limit reached: MULTIPLE_FACES')
  })
})
