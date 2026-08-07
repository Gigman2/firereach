#!/usr/bin/env node
/**
 * Derives src/data/stations.bundled.json from the API repo's committed seed SQL.
 *
 * The seed is the single source of truth; this only reshapes it. Run manually
 * after the seed changes, then commit the result — the app build never invokes
 * this, and the app must build with no sibling repo present.
 *
 * Usage: node scripts/build-stations-bundle.mjs [path-to-dev_stations.sql]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath =
  process.argv[2] ?? resolve(here, "../../api/seeds/dev_stations.sql");
const outPath = resolve(here, "../src/data/stations.bundled.json");

const sql = readFileSync(seedPath, "utf8");

const stationRe =
  /INSERT INTO stations \(id, name, region, district, lat, lng, active\) VALUES\s*\(\s*'([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*(-?[\d.]+),\s*(-?[\d.]+),\s*true\)/g;

const contactRe =
  /INSERT INTO station_contacts \(station_id, phone, response_rate, active\) VALUES \('([^']+)', '([^']+)', ([\d.]+), true\)/g;

const unquote = (s) => s.replace(/''/g, "'");

const stations = new Map();
for (const m of sql.matchAll(stationRe)) {
  stations.set(m[1], {
    id: m[1],
    name: unquote(m[2]),
    region: unquote(m[3]),
    district: unquote(m[4]),
    lat: Number(m[5]),
    lng: Number(m[6]),
    contacts: [],
  });
}

let contactCount = 0;
for (const m of sql.matchAll(contactRe)) {
  const station = stations.get(m[1]);
  if (!station) throw new Error(`contact references unknown station ${m[1]}`);
  station.contacts.push({
    phone: m[2],
    responseRate: Number(m[3]),
    active: true,
  });
  contactCount++;
}

const rows = [...stations.values()].sort((a, b) => a.name.localeCompare(b.name));

if (rows.length === 0) throw new Error("parsed zero stations — seed format changed?");
for (const s of rows) {
  if (s.contacts.length === 0) throw new Error(`station ${s.name} has no contacts`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");

console.error(
  `wrote ${rows.length} stations / ${contactCount} contacts -> ${outPath}`
);
