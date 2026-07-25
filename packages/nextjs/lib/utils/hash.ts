/**
 * Deterministic placeholder hash: same input → same hex. NOT cryptographic.
 * TODO: replace with the real hash produced by the backend/PolicyRegistry.
 */
export function deterministicHash(input: string, bytes = 32): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  let out = "";
  for (let i = 0; i < bytes; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 15), 2246822507) ^ h2;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909) ^ h1;
    out += (((h1 ^ h2) >>> 0) & 0xff).toString(16).padStart(2, "0");
  }
  return "0x" + out;
}
