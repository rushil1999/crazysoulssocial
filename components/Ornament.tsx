import { SparkleGlyph } from "./icons";

/** Centered `——— ✦ ———` divider used above section headers. */
export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 text-gold/70 ${className}`}
    >
      <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold/45" />
      <SparkleGlyph />
      <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold/45" />
    </div>
  );
}

/** The closing tagline seen at the foot of the match card. */
export function FooterTag({ className = "" }: { className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <Ornament className="mb-5" />
      <p className="text-[11px] sm:text-xs tracking-[0.3em] text-gold/80 uppercase leading-6">
        Real Connections
        <br />
        Made to Feel Easy
      </p>
    </div>
  );
}
