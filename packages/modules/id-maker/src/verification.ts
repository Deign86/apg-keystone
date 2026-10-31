/**
 * The 21×21 pattern on the back of an ID card: three finder squares and a field seeded
 * from the card's number and name, bit for bit the prototype's `drawCode`, so a card
 * looks the same wherever it is printed. A visual check mark, not a scannable QR code.
 */
export const VERIFICATION_SIZE = 21;

export const verificationSeed = (no: string, name: string) => `${no}|${name}`;

/** cells[y][x] is true where the square is dark. */
export function verificationCells(text: string): boolean[][] {
  let h = 2166136261 >>> 0;

  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }

  const rnd = () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;

    return h / 4294967296;
  };

  const n = VERIFICATION_SIZE;
  const grid = Array.from({ length: n }, () => Array<boolean>(n).fill(false));

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);

      if (!inFinder && rnd() < 0.45) grid[y][x] = true;
    }
  }

  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        grid[fy + y][fx + x] = Math.max(Math.abs(x - 3), Math.abs(y - 3)) !== 2;
      }
    }
  }

  return grid;
}
