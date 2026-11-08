import { createRequire } from 'node:module';
import * as THREE from 'three';
import { buildCountriesMesh } from './src/utils/geo';
import { EASY_COUNTRY_DESCRIPTIONS } from './src/data/countriesEasy';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');
const { countryOutlines, countryInfoList } = buildCountriesMesh(world);

function centroid(idx: number): THREE.Vector3 {
  let best: THREE.Vector3[] = [];
  let bestSpread = -1;
  for (const ring of countryOutlines[idx] ?? []) {
    const m = new THREE.Vector3();
    ring.forEach((q) => m.add(q));
    const spread = ring.length ? 1 - m.length() / ring.length : 0;
    if (spread > bestSpread) { bestSpread = spread; best = ring; }
  }
  const c = new THREE.Vector3();
  best.forEach((q) => c.add(q));
  return c.lengthSq() > 0 ? c.normalize() : new THREE.Vector3(0, 0, 1);
}
// Spherical polygon area of every ring, as a share of the globe.
function area(idx: number): number {
  let total = 0;
  for (const ring of countryOutlines[idx] ?? []) {
    if (ring.length < 3) continue;
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const lon1 = Math.atan2(a.x, a.z), lat1 = Math.asin(Math.max(-1, Math.min(1, a.y)));
      const lon2 = Math.atan2(b.x, b.z), lat2 = Math.asin(Math.max(-1, Math.min(1, b.y)));
      let d = lon2 - lon1;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      sum += d * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    total += Math.abs(sum / 2);
  }
  return total; // steradians
}
const EARTH_KM2 = 510072000;
const byName = new Map(countryInfoList.map((c) => [c.name.toLowerCase(), c]));

const easy = EASY_COUNTRY_DESCRIPTIONS.map((d) => d.name);
const mediumWanted = ['Canada', 'Mexico', 'Germany', 'Spain', 'Russia', 'Argentina', 'South Africa',
  'Greece', 'Turkey', 'South Korea', 'Netherlands', 'Norway', 'Sweden', 'Switzerland', 'Portugal',
  'Poland', 'Ireland', 'New Zealand', 'Thailand', 'Vietnam', 'Indonesia', 'Saudi Arabia', 'Kenya',
  'Nigeria', 'Peru', 'Chile'];
const hardWanted = ['Kazakhstan', 'Mongolia', 'Bolivia', 'Madagascar', 'Mali', 'Zambia', 'Myanmar',
  'Uzbekistan', 'Namibia', 'Nepal', 'Paraguay', 'Angola', 'Chad', 'Niger', 'Sudan', 'Ethiopia',
  'Papua New Guinea', 'Mozambique', 'Botswana', 'Turkmenistan', 'Laos', 'Oman', 'Suriname', 'Guyana',
  'Belarus', 'Romania', 'Bulgaria', 'Tunisia', 'Ecuador', 'Uruguay'];

function show(label: string, names: string[]) {
  console.log(`\n=== ${label} ===`);
  console.log(`${'name'.padEnd(20)} ${'in map'.padStart(7)} ${'lat'.padStart(7)} ${'area'.padStart(12)} ${'reach'.padStart(6)}`);
  for (const n of names) {
    const info = byName.get(n.toLowerCase());
    if (!info) { console.log(`${n.padEnd(20)} ${'MISSING'.padStart(7)}`); continue; }
    const u = centroid(info.index);
    const lat = (Math.asin(u.y) * 180) / Math.PI;
    const km2 = area(info.index) / (4 * Math.PI) * EARTH_KM2;
    // beacon reach: yaw can only supply dir.x while |dir.x| <= cos(lat); beacons go to 38 deg
    const maxDx = Math.sin((38 * Math.PI) / 180);
    const reach = Math.abs(u.y) >= Math.sqrt(1 - maxDx * maxDx) ? 'tight' : 'ok';
    console.log(`${n.padEnd(20)} ${'yes'.padStart(7)} ${((lat >= 0 ? lat.toFixed(1) + 'N' : (-lat).toFixed(1) + 'S')).padStart(7)} ${(Math.round(km2).toLocaleString()).padStart(12)} ${reach.padStart(6)}`);
  }
}
show('easy (existing)', easy);
show('medium candidates', mediumWanted);
show('hard candidates', hardWanted);

console.log('\nsmallest easy country for reference:',
  Math.round(Math.min(...easy.map((n) => area(byName.get(n.toLowerCase())!.index) / (4 * Math.PI) * EARTH_KM2)).valueOf()).toLocaleString(), 'km2');
