// Ícones SVG do login (componentes reais, cor via currentColor).
const s = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function CheckBadge() {
  return (
    <svg viewBox="0 0 48 48" {...s} strokeWidth={3.4}>
      <circle cx="24" cy="24" r="21" />
      <path d="m14 24 7 7 14-15" />
    </svg>
  );
}
export function CoinBullet() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" />
      <text x="24" y="25.5" textAnchor="middle" dominantBaseline="central" fontFamily="Montserrat, sans-serif" fontSize="27" fontWeight="800" fill="currentColor">$</text>
    </svg>
  );
}
export function Bell() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a6 6 0 0 0-6 6c0 5-2 6.5-2 6.5h16S18 13 18 8a6 6 0 0 0-6-6Z" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0Z" />
    </svg>
  );
}
export function User() {
  return (
    <svg viewBox="0 0 24 24" {...s} strokeWidth={1.6}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
// No Figma: pessoa/escudo/presente = contorno BRANCO; moeda + check = LARANJA.
const WHITE = "#f4eef6";
const ORANGE = "#f26a1b";

export function StepPerson() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
export function StepShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5 4.5 5.5V11c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V5.5L12 2.5Z" stroke={WHITE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m8.4 11.7 2.7 2.7 4.5-5" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function StepCoin() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" stroke={ORANGE} strokeWidth="3" />
      <text x="24" y="25.5" textAnchor="middle" dominantBaseline="central" fontFamily="Montserrat, sans-serif" fontSize="27" fontWeight="800" fill={ORANGE}>$</text>
    </svg>
  );
}
export function StepGift() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v9h14v-9" />
      <path d="M12 8S10.5 3 8 4.5 9.5 8 12 8Zm0 0s1.5-5 4-3.5S14.5 8 12 8Z" />
    </svg>
  );
}
export function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" {...s} strokeWidth={1.8}>
      <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.4 3.2M6.5 6.5A13.2 13.2 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4-.8" />
      <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" {...s} strokeWidth={1.8}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
