import type { Guest } from "@/lib/store";
import { pairKey } from "@/lib/store";

/**
 * "Never match these two."
 *
 * The host types one pair per line, in whatever form is to hand at the door:
 *
 *     Priya, Sam
 *     alex@example.com, jordan@example.com
 *     Maya and Dev
 *
 * Names are resolved against the roster, so a line can be entered before
 * either guest has filled the form — it simply starts applying once they have.
 * Anything that can't be resolved is reported back rather than ignored, since
 * a silently dropped line is worse than no line at all.
 */

export type NeverMatch = {
  /** Order-independent pair keys to exclude from matching. */
  keys: Set<string>;
  /** Lines we understood but couldn't resolve to two guests, with the reason. */
  unresolved: { line: string; reason: string }[];
  /** How many lines resolved cleanly. */
  resolved: number;
};

/** Find a guest by email, full name, or first name. Case-insensitive. */
function find(token: string, guests: Guest[]): Guest | "none" | "ambiguous" {
  const t = token.trim().toLowerCase();
  if (!t) return "none";

  const byEmail = guests.filter((g) => g.email.toLowerCase() === t);
  if (byEmail.length === 1) return byEmail[0];

  const byFullName = guests.filter((g) => g.name.trim().toLowerCase() === t);
  if (byFullName.length === 1) return byFullName[0];
  if (byFullName.length > 1) return "ambiguous";

  const byFirstName = guests.filter(
    (g) => g.name.trim().split(/\s+/)[0].toLowerCase() === t
  );
  if (byFirstName.length === 1) return byFirstName[0];
  if (byFirstName.length > 1) return "ambiguous";

  return "none";
}

export function resolveNeverMatch(
  text: string,
  guests: Guest[]
): NeverMatch {
  const keys = new Set<string>();
  const unresolved: { line: string; reason: string }[] = [];
  let resolved = 0;

  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    // Blank lines and # comments let the host annotate the list.
    if (!line || line.startsWith("#")) continue;

    const parts = line
      .split(/,|;|\s+and\s+|\s+\+\s+|\s+&\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length !== 2) {
      unresolved.push({
        line,
        reason: "needs exactly two people, separated by a comma",
      });
      continue;
    }

    const a = find(parts[0], guests);
    const b = find(parts[1], guests);

    for (const [token, hit] of [
      [parts[0], a],
      [parts[1], b],
    ] as const) {
      if (hit === "ambiguous") {
        unresolved.push({
          line,
          reason: `more than one guest matches "${token}" — use their email`,
        });
      }
    }
    if (a === "ambiguous" || b === "ambiguous") continue;

    if (a === "none" || b === "none") {
      const missing = [a === "none" && parts[0], b === "none" && parts[1]]
        .filter(Boolean)
        .join(" and ");
      unresolved.push({
        line,
        reason: `no guest called ${missing} yet — this starts working once they fill the form`,
      });
      continue;
    }

    if (a.email === b.email) {
      unresolved.push({ line, reason: "both halves are the same guest" });
      continue;
    }

    keys.add(pairKey(a.email, b.email));
    resolved++;
  }

  return { keys, unresolved, resolved };
}
