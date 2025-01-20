/**
 * Useful util functions
 */

/**
 * @returns hex string representation of 'arr' without 0x prepended
 */
export const toHex = (arr: Uint8Array | number[]): string => {
  if (arr instanceof Uint8Array) {
    return Array.from(arr).map(byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    return arr.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
};

/**
 * @param hex: hex string without 0x prepended
 */
export function fromHex(hex: string): number[] {
    return Array.from(Buffer.from(hex, "hex"));
};
