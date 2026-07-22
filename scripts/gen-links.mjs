#!/usr/bin/env node
/**
 * gen-links.mjs
 * -------------
 * Access is now via a single SHARED link — each guest just enters the email
 * they signed up with. So there are no per-person links to generate. This
 * script instead scaffolds data/matches.json from a CSV of participants, so
 * you have an empty entry (keyed by email) to paste each person's AI matches
 * into.
 *
 * Usage:
 *   node scripts/gen-links.mjs participants.csv [matchesPerPerson] [baseUrl] [round]
 *
 * CSV format (header optional, comma-separated):
 *   email,name
 *   alice@example.com,Alice
 *   bob@example.com,Bob
 *
 * Notes:
 *   - `round` (default 1) picks the target file: round 1 -> data/matches.json,
 *     round N -> data/matches_N.json.
 *   - Existing people (matched by email) keep their data untouched.
 *   - New people get an entry with `matchesPerPerson` empty match slots
 *     (default 1 — matches round one).
 *   - The shared link everyone uses is just your site's base URL.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const [, , csvArg, countArg, baseUrlArg, roundArg] = process.argv;

if (!csvArg) {
  console.error(
    "Usage: node scripts/gen-links.mjs <participants.csv> [matchesPerPerson] [baseUrl] [round]"
  );
  process.exit(1);
}

const matchesPerPerson = Math.max(1, parseInt(countArg || "1", 10) || 1);
const baseUrl = (baseUrlArg || "https://your-app.vercel.app").replace(/\/$/, "");
const round = Math.max(1, parseInt(roundArg || "1", 10) || 1);
const matchesFile = round === 1 ? "matches.json" : `matches_${round}.json`;
const matchesPath = resolve(root, "data", matchesFile);

function emptyMatch() {
  return {
    name: "",
    tagline: "",
    vibe: "",
    compatibility: 0,
    whyMatched: "",
    commonAttributes: [],
    unexpectedFlex: "",
    canTeach: "",
    iceBreakers: [],
    whatToTalkAbout: "",
    quirkyComment: "",
  };
}

// --- Parse CSV -------------------------------------------------------------
const raw = readFileSync(resolve(process.cwd(), csvArg), "utf8").trim();
const rows = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(",").map((c) => c.trim()));

// Drop a header row if present.
if (rows.length && /email/i.test(rows[0][0])) rows.shift();

// --- Load existing matches.json -------------------------------------------
const matches = existsSync(matchesPath)
  ? JSON.parse(readFileSync(matchesPath, "utf8"))
  : {};

// --- Upsert people ---------------------------------------------------------
let added = 0;
for (const [emailRaw, nameRaw] of rows) {
  if (!emailRaw) continue;
  const email = emailRaw.toLowerCase();
  const name = nameRaw || "";

  if (!matches[email]) {
    matches[email] = {
      name,
      praise: "",
      matches: Array.from({ length: matchesPerPerson }, emptyMatch),
    };
    added++;
  } else if (name && !matches[email].name) {
    matches[email].name = name;
  }
}

// --- Write output ----------------------------------------------------------
writeFileSync(matchesPath, JSON.stringify(matches, null, 2) + "\n");

// --- Report ----------------------------------------------------------------
const total = Object.keys(matches).length;
console.log(`\n✅ Scaffolded round ${round}: ${matchesFile}`);
console.log(`   Added ${added} new person(s); ${total} total.`);
console.log(`   ${matchesPath}\n`);
console.log(`🔗 Shared link for EVERYONE (no per-person links needed):`);
console.log(`   ${baseUrl}\n`);
console.log(
  `Next for round ${round}:\n` +
    `  1. Fill in praise + match details in data/${matchesFile}\n` +
    `  2. Add a "${round}" entry with reveal times in data/schedule.json (California/Pacific)\n` +
    `  3. Add ${round} to enabledRounds in data/round.json to put it in play\n` +
    `  4. Commit and push to deploy. Matches accumulate — guests keep earlier rounds too.\n`
);
