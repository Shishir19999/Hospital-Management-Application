// Motion preferences: parallax only on larger screens, never with reduced motion or data saver.
const mq = (q) => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches;

export const prefersReducedMotion = () => mq('(prefers-reduced-motion: reduce)');

export function parallaxAllowed() {
  if (typeof window === 'undefined') return false;
  if (prefersReducedMotion()) return false;
  if (window.innerWidth < 768) return false;
  const nav = window.navigator;
  if (nav.connection?.saveData) return false;
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) return false;
  return true;
}
