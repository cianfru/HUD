import { describe, it, expect } from 'vitest';
import {
  eteSeconds,
  formatDuration,
  etaUtc,
  formatUtcClock,
} from '../src/core/time.js';

describe('eteSeconds', () => {
  it('120 nm at 480 kt is 15 minutes', () => {
    expect(eteSeconds(120, 480)).toBeCloseTo(900);
  });
  it('returns null below a usable ground speed', () => {
    expect(eteSeconds(100, 5)).toBeNull();
  });
  it('returns null for missing inputs', () => {
    expect(eteSeconds(null, 480)).toBeNull();
    expect(eteSeconds(120, null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('shows MM:SS under an hour', () => {
    expect(formatDuration(900)).toBe('15:00');
    expect(formatDuration(65)).toBe('01:05');
  });
  it('shows H:MM over an hour', () => {
    expect(formatDuration(3661)).toBe('1:01');
    expect(formatDuration(2 * 3600 + 5 * 60)).toBe('2:05');
  });
  it('handles null/invalid', () => {
    expect(formatDuration(null)).toBe('--:--');
    expect(formatDuration(-5)).toBe('--:--');
  });
});

describe('etaUtc', () => {
  it('adds ETE to the current UTC time', () => {
    const now = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    expect(etaUtc(now, 900)).toBe('12:15Z');
    expect(etaUtc(now, 3600)).toBe('13:00Z');
  });
  it('handles null', () => {
    expect(etaUtc(new Date(), null)).toBe('--:--Z');
  });
});

describe('formatUtcClock', () => {
  it('formats zero-padded HH:MM:SS in UTC', () => {
    expect(formatUtcClock(new Date(Date.UTC(2026, 0, 1, 13, 42, 7)))).toBe('13:42:07');
  });
});
