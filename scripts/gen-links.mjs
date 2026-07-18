#!/usr/bin/env node
/**
 * gen-links.mjs
 * -------------
 * Reads a CSV of participants (email,name), generates a unique token per
 * person, scaffolds/updates data/matches.json with empty match slots, and
 * prints each person's shareable link for distribution (SMS / QR / email).
 *
 * Usage:
 *   node scripts/gen-links.mjs participants.csv https://your-app.vercel.app
 *
 * CSV format (header optional, comma-separated):
 *   email,name
 *   alice@example.com,Alice
 *   bob@example.com,Bob
 *
 * Notes:
 *   - Existing people (matched by email) keep their existing token + data.
 *   - New people get a fresh token and 3 empty match slots to fill in.
 *   - Writes the updated matches.json and a links CSV to scripts/output/.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const matchesPath = resolve(root, "data/matches.json");
const outDir = resolve(root, "scripts/output");

const [, , csvArg, baseUrlArg] = process.argv;

if (!csvArg) {
  console.error("Usage: node scripts/gen-links.mjs <participants.csv> [baseUrl]");
  process.exit(1);
}

const baseUrl = (baseUrlArg || "https://your-app.vercel.app").replace(/\/$/, "");

// Unambiguous token alphabet (no 0/O/1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeToken(len = 6) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function emptyMatch() {
  return {
    name: "",
    photo: "",
    whyMatched: "",
    commonAttributes: [],
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

const usedTokens = new Set(
  Object.values(matches).map((p) => String(p.token).toUpperCase())
);
function uniqueToken() {
  let t;
  do {
    t = makeToken();
  } while (usedTokens.has(t));
  usedTokens.add(t);
  return t;
}

// --- Upsert people ---------------------------------------------------------
const links = [];
for (const [emailRaw, nameRaw] of rows) {
  if (!emailRaw) continue;
  const email = emailRaw.toLowerCase();
  const name = nameRaw || "";

  if (!matches[email]) {
    matches[email] = {
      token: uniqueToken(),
      name,
      praise: "",
      matches: [emptyMatch(), emptyMatch(), emptyMatch()],
    };
  } else if (name && !matches[email].name) {
    matches[email].name = name;
  }

  links.push({
    email,
    name: matches[email].name,
    token: matches[email].token,
    link: `${baseUrl}/m/${matches[email].token}`,
  });
}

// --- Write outputs ---------------------------------------------------------
writeFileSync(matchesPath, JSON.stringify(matches, null, 2) + "\n");

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const linksCsv =
  "email,name,token,link\n" +
  links.map((l) => `${l.email},${l.name},${l.token},${l.link}`).join("\n") +
  "\n";
writeFileSync(resolve(outDir, "links.csv"), linksCsv);

// --- Report ----------------------------------------------------------------
console.log(`\n✅ Processed ${links.length} participant(s).`);
console.log(`   Updated: ${matchesPath}`);
console.log(`   Links CSV: ${resolve(outDir, "links.csv")}\n`);
for (const l of links) {
  console.log(`   ${l.name || l.email}`.padEnd(28), l.link);
}
console.log(
  "\nNext: fill in praise + match details for each person in data/matches.json,\n" +
    "set reveal times in data/schedule.json, commit, and push to deploy.\n"
);
