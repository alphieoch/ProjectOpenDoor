/** Stagger marble motion so avatars with different seeds do not drift in lockstep. */
export function marbleDrift(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return {
    delay: -((n % 240) / 10),
    duration: 24 + (n % 12),
  };
}
