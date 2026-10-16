import { describe, expect, it } from 'vitest';
import { FakeClock, SystemClock } from './clock';

describe('FakeClock', () => {
  it('returns the fixed time until advanced', () => {
    const clock = new FakeClock(new Date('2026-10-14T10:00:00Z'));
    expect(clock.now()).toEqual(new Date('2026-10-14T10:00:00Z'));
    expect(clock.now()).toEqual(new Date('2026-10-14T10:00:00Z'));
  });

  it('advances by a duration', () => {
    const clock = new FakeClock(new Date('2026-10-14T10:00:00Z'));
    clock.advance(5000);
    expect(clock.now()).toEqual(new Date('2026-10-14T10:00:05Z'));
  });

  it('can be set to an exact time', () => {
    const clock = new FakeClock(new Date('2026-10-14T10:00:00Z'));
    clock.set(new Date('2027-01-01T00:00:00Z'));
    expect(clock.now()).toEqual(new Date('2027-01-01T00:00:00Z'));
  });
});

describe('SystemClock', () => {
  it('returns a Date close to real now', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const got = clock.now().getTime();
    const after = Date.now();
    expect(got).toBeGreaterThanOrEqual(before);
    expect(got).toBeLessThanOrEqual(after);
  });
});
