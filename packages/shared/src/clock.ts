/**
 * The `Clock` port. It lives in `shared` (not `platform`) so that
 * `assistant-core`, which may only import `shared`, can still take time as
 * a dependency instead of calling `Date.now()` directly (ARCHITECTURE
 * section 4). `platform` supplies the real system-clock adapter later;
 * `FakeClock` here is the one every test uses.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FakeClock implements Clock {
  private current: Date;

  constructor(initial: Date) {
    this.current = initial;
  }

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date): void {
    this.current = date;
  }
}
