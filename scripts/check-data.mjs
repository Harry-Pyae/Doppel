// npm run data:check: data/characters.json and data/pairs.json are consistent.
// Unique ids, every pair points to two real, different characters, no pair twice,
// and each image either exists in public/characters/ or the placeholder is used.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The pair's database id: its two character ids, sorted. */
export const pairId = ([a, b]) => [a, b].sort().join("~");

export function checkData(characters = json("data/characters.json"), pairs = json("data/pairs.json")) {
  const errors = [];
  const placeholders = [];
  const ids = new Set();
  for (const [i, c] of characters.entries()) {
    const at = `characters[${i}] ${c?.id ?? ""}`.trim();
    if (!ID.test(c?.id ?? "")) errors.push(`${at}: id must be lower-case letters, digits and dashes`);
    else if (ids.has(c.id)) errors.push(`${at}: duplicate id`);
    ids.add(c?.id);
    if (typeof c?.name !== "string" || !c.name.trim()) errors.push(`${at}: name is missing`);
    if (typeof c?.category !== "string" || !c.category.trim()) errors.push(`${at}: category is missing`);
    if (c?.image !== null && c?.image !== `${c?.id}.webp`) errors.push(`${at}: image must be "${c?.id}.webp" (or null)`);
    else if (!c.image || !existsSync(new URL(`public/characters/${c.image}`, root))) placeholders.push(c.id);
  }
  const seen = new Set();
  for (const [i, pair] of pairs.entries()) {
    const at = `pairs[${i}]`;
    if (!Array.isArray(pair) || pair.length !== 2) {
      errors.push(`${at}: must be two character ids`);
      continue;
    }
    for (const id of pair) if (!ids.has(id)) errors.push(`${at}: unknown character "${id}"`);
    if (pair[0] === pair[1]) errors.push(`${at}: a pair needs two different characters`);
    if (seen.has(pairId(pair))) errors.push(`${at}: duplicate pair`);
    seen.add(pairId(pair));
  }
  if (pairs.length === 0) errors.push("pairs: at least one pair is needed");
  return { errors, placeholders, characters: characters.length, pairs: pairs.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, placeholders, characters, pairs } = checkData();
  console.log(`${characters} characters, ${pairs} pairs.`);
  if (placeholders.length) console.log(`Placeholder image (no public/characters/<id>.webp): ${placeholders.join(", ")}`);
  for (const e of errors) console.error(`✗ ${e}`);
  if (errors.length) process.exit(1);
  console.log("✓ Data is valid.");
}
