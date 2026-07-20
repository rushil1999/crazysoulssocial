import RevealExperience from "@/components/RevealExperience";

// Backwards-compatible: older per-person links (/m/<token>) still work.
// Access is now email-based, so the token is no longer required — this simply
// renders the same shared experience.
export default function TokenPage() {
  return <RevealExperience />;
}
