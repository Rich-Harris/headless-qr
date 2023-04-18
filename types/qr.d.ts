/**
 * @param {string} input
 * @param {number} version 1 to 40
 * @param {'L' | 'M' | 'Q' | 'H'} correction
 */
export function qr(input: string, version?: number, correction?: 'L' | 'M' | 'Q' | 'H'): Module[][];
export type Module = boolean | null;
