import { describe, expect, it } from 'vitest';
import { VIOLATION_META, readSettings } from '../src/lib/domain.js';

describe('audio monitoring catalogue and settings', () => {
  it('defines both audio codes with their severities', () => {
    expect(VIOLATION_META.VOICE_DETECTED.severity).toBe('MEDIUM');
    expect(VIOLATION_META.MIC_BLOCKED.severity).toBe('HIGH');
  });

  it('defines the object detection codes with their severities', () => {
    expect(VIOLATION_META.PHONE_DETECTED.severity).toBe('HIGH');
    expect(VIOLATION_META.NOTES_DETECTED.severity).toBe('MEDIUM');
  });

  it('keeps audio monitoring off for exams saved before the setting existed', () => {
    expect(readSettings({ shuffle: false, maxWarnings: 3 }).audioMonitoring).toBe(false);
    expect(readSettings(null).audioMonitoring).toBe(false);
  });

  it('keeps audio monitoring on when an exam turns it on', () => {
    expect(readSettings({ audioMonitoring: true }).audioMonitoring).toBe(true);
  });
});
