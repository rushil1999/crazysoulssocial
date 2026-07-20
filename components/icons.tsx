import type { SVGProps } from "react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** The little twin-sparkle used in the divider ornaments. */
export function SparkleGlyph({ size = 18, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} {...p}>
      <path d="M11 3.2c.6 3.7 1.7 4.8 5.4 5.4-3.7.6-4.8 1.7-5.4 5.4-.6-3.7-1.7-4.8-5.4-5.4 3.7-.6 4.8-1.7 5.4-5.4Z" />
      <path d="M17.8 13.6c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5Z" />
    </svg>
  );
}

export function PinIcon({ size = 14, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} {...p}>
      <path d="M12 21s-6-5.1-6-10a6 6 0 1 1 12 0c0 4.9-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

export function EyeIcon({ size = 16, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke} {...p}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

/** Filled closing-quote mark ("99" style) for ice-breaker rows. */
export function QuoteIcon({ size = 20, ...p }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...p}>
      <path d="M6.5 6h4.2v5.4c0 2.9-1.6 4.8-4.4 5.6l-.6-1.7c1.4-.5 2.2-1.3 2.4-2.5H6.5V6Zm7.3 0H18v5.4c0 2.9-1.6 4.8-4.4 5.6l-.6-1.7c1.4-.5 2.2-1.3 2.4-2.5h-1.6V6Z" />
    </svg>
  );
}

// --- Interest icons --------------------------------------------------------

function Wine(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M7 4h10c0 4-2 6.5-5 6.5S7 8 7 4Z" />
      <path d="M12 10.5V19M8.5 19h7" />
    </svg>
  );
}
function Music(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M9 18V6l10-2v11" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  );
}
function Book(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M4 5.5A2 2 0 0 1 6 4h5v15H6a2 2 0 0 0-2 1.3Z" />
      <path d="M20 5.5A2 2 0 0 0 18 4h-5v15h5a2 2 0 0 1 2 1.3Z" />
    </svg>
  );
}
function Camera(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
function Plane(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M10.5 3.2c.8-.8 1.6-.5 1.6.6v6l6.5 3.8v1.8l-6.5-1.9v3.9l1.9 1.4v1.4l-3.5-1-3.5 1v-1.4l1.9-1.4v-3.9L3 15.4v-1.8l6.4-3.8v-6c0-.5.4-.4 1.1.2Z" />
    </svg>
  );
}
function Leaf(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M5 19c0-8 5-13 14-13 0 9-5 13-14 13Z" />
      <path d="M5 19c2.5-4 5.5-6.5 9-8" />
    </svg>
  );
}
function Coffee(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M5 8h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
      <path d="M16 9h2.2a2.3 2.3 0 0 1 0 4.6H16M7 3v2M11 3v2" />
    </svg>
  );
}
function Film(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4" />
    </svg>
  );
}
function Heart(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M12 20s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.5 12 20 12 20Z" />
    </svg>
  );
}
function Star(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...stroke} {...p}>
      <path d="M12 4.5c.8 4.4 2.3 5.9 6.7 6.7-4.4.8-5.9 2.3-6.7 6.7-.8-4.4-2.3-5.9-6.7-6.7 4.4-.8 5.9-2.3 6.7-6.7Z" />
    </svg>
  );
}

const ICONS: Record<string, (p: SVGProps<SVGSVGElement>) => JSX.Element> = {
  wine: Wine,
  drinks: Wine,
  music: Music,
  concerts: Music,
  book: Book,
  books: Book,
  poetry: Book,
  reading: Book,
  camera: Camera,
  photography: Camera,
  photo: Camera,
  plane: Plane,
  travel: Plane,
  leaf: Leaf,
  garden: Leaf,
  gardening: Leaf,
  plants: Leaf,
  hiking: Leaf,
  outdoors: Leaf,
  coffee: Coffee,
  film: Film,
  cinema: Film,
  movies: Film,
  heart: Heart,
  star: Star,
  sparkle: Star,
};

/** Pick an interest icon by explicit name or by keyword found in the label. */
export function InterestIcon({
  name,
  size = 22,
  ...p
}: { name?: string; size?: number } & SVGProps<SVGSVGElement>) {
  const key = (name || "").toLowerCase();
  let Comp = ICONS[key];
  if (!Comp) {
    const hit = Object.keys(ICONS).find((k) => key.includes(k));
    Comp = hit ? ICONS[hit] : Star;
  }
  return <Comp width={size} height={size} {...stroke} {...p} />;
}
