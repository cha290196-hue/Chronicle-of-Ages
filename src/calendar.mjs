/** Calendar primitives shared by current storage and archived readers. */
export const FIRST_YEAR=-3200,LAST_YEAR=2026;
export function validYear(y) { return Number.isInteger(y) && y >= FIRST_YEAR && y <= LAST_YEAR && y !== 0; }
export function tick(y) { if (!validYear(y)) throw new RangeError('INVALID_HISTORICAL_YEAR'); return y < 0 ? y + 1 : y; }
export function untick(t) { const y = t <= 0 ? t - 1 : t; if (!validYear(y)) throw new RangeError('INVALID_HISTORICAL_YEAR'); return y; }
export class MatrixError extends Error { constructor(code,detail='') { super(`${code}${detail ? ': '+detail : ''}`); this.name='MatrixError'; this.code=code; } }
