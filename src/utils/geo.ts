import * as THREE from 'three';
import earcutModule from 'earcut';

// Ensure earcut function is correctly extracted across CJS/ESM
const earcut: (vertices: number[], holes?: number[], dimensions?: number) => number[] =
  // @ts-expect-error handle default or direct export
  earcutModule.default || earcutModule;

// ============================================================
// Tweakables
// ============================================================

// How far the country tops sit above the ocean surface (globe units; globe radius = 2).
export const LAND_ELEVATION = 0.08;

// Relief *within* a country: how far the low-poly land facets rise and fall, peak to
// peak (globe units). 0 gives perfectly flat country tops. This is what makes the
// faceting visible, so raise it to exaggerate the terrain.
export const LAND_RELIEF = 0.13;

// How much of that relief digs *below* the flat land level; the rest rises above it.
// Relief is mostly upward so that raising it carves valleys far more slowly than it
// raises peaks, and the land keeps its clearance over the ocean.
export const LAND_RELIEF_SINK = 0.035;

// Extra per-vertex height applied to interior lattice points only. This is what
// tilts neighbouring facets against each other, which is what actually reads as
// "low poly" - the smooth waves above move whole regions together. Coastline
// vertices are deliberately left out: they sit far closer together than the lattice,
// so jittering them would fray the coast and the wall tops instead of faceting
// the surface.
export const LAND_FACET_JITTER = 0.013;

// Islands / exclaves that share no border with another country and are smaller
// than this (km²) are omitted. 0 keeps everything.
export const MIN_ISLAND_AREA_KM2 = 0;

// Each top-face triangle gets one of two shades: the country colour, or the
// colour multiplied by this factor (1 = no variation, lower = darker alternate).
export const FACE_SHADE_DIM = 0.88;

// Ocean sphere tessellation (IcosahedronGeometry detail): 20 * (detail + 1)² faces.
export const OCEAN_DETAIL = 4;

// Density of the interior points used for land faces (higher = more, smaller faces).
// Keep (LAND_LATTICE_DETAIL + 1) a multiple of (OCEAN_DETAIL + 1) so the land
// lattice contains every ocean vertex and land facets line up with ocean facets.
export const LAND_LATTICE_DETAIL = 14;

// Each ocean face gets one of these brightness multipliers (applied to the ocean colour).
export const OCEAN_FACE_SHADES = [1.0, 0.95, 0.9, 0.85];

// ============================================================

export const GLOBE_RADIUS = 2.0;
// All countries are on the EXACT SAME LEVEL
export const LAND_RADIUS = GLOBE_RADIUS + LAND_ELEVATION;
// Country walls extend below the ocean surface so no seam shows, even where the
// flat low-poly ocean faces dip under GLOBE_RADIUS.
export const BOTTOM_RADIUS = GLOBE_RADIUS * 0.97;

// Fixed plane waves summed into the land relief field. Each entry is
// [dirX, dirY, dirZ, frequency, phase, weight]; frequency is in inverse radians on
// the unit sphere, so a wave's features span roughly (2*PI / frequency) radians.
// The first waves are broad highlands and basins, the last are facet-scale ridges.
// The weights fall off far more slowly than the frequencies rise, which puts most of
// the slope at facet scale: that is what makes neighbouring facets catch the light
// differently. Weighting them the other way just tilts whole regions as one shell.
// The top frequency stays near 2.5 lattice cells per wavelength so the field is still
// sampled cleanly rather than aliasing into noise.
const RELIEF_WAVES: number[][] = [
  [0.82, 0.41, 0.40, 4.6, 0.0, 1.0],
  [-0.33, 0.88, 0.34, 7.2, 1.7, 0.83],
  [0.46, -0.27, 0.84, 11.0, 3.1, 0.72],
  [-0.71, -0.52, 0.47, 15.5, 5.2, 0.67],
  [0.28, 0.63, -0.72, 21.0, 2.4, 0.61],
  [-0.59, 0.36, -0.72, 28.0, 4.6, 0.56],
  [0.64, -0.75, 0.17, 34.0, 0.9, 0.50],
];

// Pre-scaled wave vectors: [kx, ky, kz, phase, weight], plus the total weight used
// to normalise the sum back into [-1, 1].
const RELIEF_K: number[][] = RELIEF_WAVES.map(([x, y, z, freq, phase, weight]) => {
  const len = Math.hypot(x, y, z) || 1;
  const k = freq / len;
  return [x * k, y * k, z * k, phase, weight];
});
const RELIEF_WEIGHT_SUM = RELIEF_WAVES.reduce((sum, w) => sum + w[5], 0);

// Valley floors never come closer than this to the ocean surface, whatever the relief
// settings above ask for, so the ocean's flat facets can never poke up through land.
const MIN_LAND_FREEBOARD = 0.025;
const LAND_FLOOR_RADIUS = GLOBE_RADIUS + MIN_LAND_FREEBOARD;

/** Smooth relief field in [-1, 1]: the sum of the fixed waves, normalised. */
function reliefField(dir: THREE.Vector3): number {
  let h = 0;
  for (let i = 0; i < RELIEF_K.length; i++) {
    const [kx, ky, kz, phase, weight] = RELIEF_K[i];
    h += weight * Math.sin(kx * dir.x + ky * dir.y + kz * dir.z + phase);
  }
  return h / RELIEF_WEIGHT_SUM;
}

function landRadiusRaw(dir: THREE.Vector3): number {
  return LAND_RADIUS - LAND_RELIEF_SINK + LAND_RELIEF * (reliefField(dir) * 0.5 + 0.5);
}

/**
 * Radius of the country top surface in a given direction, following the smooth relief
 * only. Use for coastline vertices: the border ring, the tops of the side walls and
 * the hover outline, all of which have to agree exactly.
 *
 * Depends on the unit direction alone, so every vertex that lands on the same spot
 * gets the same height: triangles within a country stay welded, two countries meeting
 * at a border agree along it, and the side walls meet the cap they belong to.
 */
export function landRadiusAt(dir: THREE.Vector3): number {
  return Math.max(LAND_FLOOR_RADIUS, landRadiusRaw(dir));
}

/**
 * Radius for a top-cap vertex: the smooth relief plus the per-vertex facet jitter.
 * The jitter is keyed to the shared lattice, so a coastline vertex gets none and this
 * agrees with landRadiusAt() exactly along every border.
 */
export function landRadiusAtVertex(dir: THREE.Vector3): number {
  return Math.max(LAND_FLOOR_RADIUS, landRadiusRaw(dir) + latticeJitter(dir));
}

/** Quantised key for a unit-sphere point; lattice points are far further apart than
 *  the 1e-5 rounding, so this only ever merges points that are meant to be the same. */
function latticeKey(x: number, y: number, z: number): string {
  return `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
}

let latticeJitterCache: Map<string, number> | null = null;

/** Per-lattice-point height offset, fixed per point so that every triangle meeting at
 *  that point moves with it and the surface stays welded. 0 for anything else. */
function latticeJitter(dir: THREE.Vector3): number {
  if (!latticeJitterCache) {
    latticeJitterCache = new Map();
    for (const lp of getLatticePoints()) {
      const h = Math.sin(lp.x * 127.1 + lp.y * 311.7 + lp.z * 74.7) * 43758.5453;
      const unit = (h - Math.floor(h)) * 2 - 1; // [-1, 1)
      latticeJitterCache.set(latticeKey(lp.x, lp.y, lp.z), unit * LAND_FACET_JITTER);
    }
  }
  return latticeJitterCache.get(latticeKey(dir.x, dir.y, dir.z)) ?? 0;
}

// Angular spacing between neighbouring lattice points (icosahedron edge = atan(2)).
const LATTICE_SPACING = Math.atan(2) / (LAND_LATTICE_DETAIL + 1);
// Lattice points closer than this (relative to spacing) to a border are skipped
// to avoid sliver triangles.
const LATTICE_BORDER_MARGIN = 0.4;

// Curated playful, modern, low-poly toy palette
export const COUNTRY_PALETTE = [
  '#FF6F59', // Warm Coral
  '#25A18E', // Jade Mint
  '#FFBA08', // Sunflower Yellow
  '#3F88C5', // Sky Cerulean
  '#9B5DE5', // Soft Lilac Purple
  '#F15BB5', // Rose Pink
  '#00BBF9', // Crisp Turquoise
  '#F77F00', // Tangerine Orange
  '#52B788', // Emerald Grass
  '#E76F51', // Warm Terracotta
  '#4361EE', // Royal Indigo Blue
  '#DDA15E', // Sand Ochre
];

export const ANTARCTICA_COLOR = '#E2F1F8'; // Glacial Icy White
export const GREENLAND_COLOR = '#D8EDF5';   // Glacial Mint

export interface CountryInfo {
  index: number;
  id: string;
  name: string;
  color: string;
}

/**
 * Converts longitude & latitude (in degrees) to a 3D unit Vector3.
 */
export function lonLatToVector3(lon: number, lat: number, r: number = 1): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.cos(phi);
  const z = r * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/**
 * Douglas-Peucker simplification for shared arcs.
 * Splits closed-loop arcs in half so closed loops never collapse.
 */
function simplifyDP(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length <= 2) return pts;

  // Closed loop arc (first and last points match)
  if (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) {
    const mid = Math.floor(pts.length / 2);
    const h1 = simplifyDP(pts.slice(0, mid + 1), tol);
    const h2 = simplifyDP(pts.slice(mid), tol);
    const combined = h1.slice(0, -1).concat(h2);
    if (combined.length < 4) {
      const pA = pts[0];
      const pB = pts[Math.floor(pts.length / 3)];
      const pC = pts[Math.floor((pts.length * 2) / 3)];
      return [pA, pB, pC, pA];
    }
    return combined;
  }

  const sqTol = tol * tol;
  let maxSq = 0;
  let idx = -1;
  const p0 = pts[0];
  const pN = pts[pts.length - 1];

  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = pN[0] - p0[0];
    const dy = pN[1] - p0[1];
    let x = p0[0];
    let y = p0[1];
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = pN[0];
        y = pN[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    const sq = (p[0] - x) ** 2 + (p[1] - y) ** 2;
    if (sq > maxSq) {
      maxSq = sq;
      idx = i;
    }
  }

  if (maxSq > sqTol) {
    const left = simplifyDP(pts.slice(0, idx + 1), tol);
    const right = simplifyDP(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }

  return [p0, pN];
}

/**
 * Greedy coloring so adjacent countries never share a color.
 */
function computeGreedyMap(neighbors: Set<number>[], paletteSize: number, offset: number = 0): number[] {
  const n = neighbors.length;
  const assigned = new Array<number>(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const used = new Set<number>();
    for (const neighborIdx of neighbors[i]) {
      if (assigned[neighborIdx] !== -1) {
        used.add(assigned[neighborIdx]);
      }
    }
    let val = (i * 3 + offset) % paletteSize;
    let attempts = 0;
    while (used.has(val) && attempts < paletteSize) {
      val = (val + 1) % paletteSize;
      attempts++;
    }
    assigned[i] = val;
  }

  return assigned;
}


const EARTH_RADIUS_KM = 6371;

/**
 * Area of a lon/lat ring (degrees) on the sphere, in km².
 * Works on 3D unit vectors (signed spherical-triangle fan from the ring's centroid),
 * so rings crossing the antimeridian (e.g. Fiji) are measured correctly.
 */
export function ringAreaKm2(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const pts = ring.map(([lon, lat]) => lonLatToVector3(lon, lat, 1));
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  if (c.lengthSq() < 1e-12) return 0;
  c.normalize();

  const cross = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // Van Oosterom–Strackee: signed solid angle of triangle (c, a, b).
    const triple = c.dot(cross.crossVectors(a, b));
    const denom = 1 + c.dot(a) + a.dot(b) + b.dot(c);
    sum += 2 * Math.atan2(triple, denom);
  }
  return Math.abs(sum) * EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

/**
 * Deterministic pseudo-random value in [0, 1) from a triangle's centroid, so
 * face shading patterns are stable across reloads and independent of build order.
 */
function faceHash01(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const x = a.x + b.x + c.x;
  const y = a.y + b.y + c.y;
  const z = a.z + b.z + c.z;
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function isDimFace(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): boolean {
  return faceHash01(a, b, c) < 0.5;
}

/**
 * Low-poly ocean sphere with per-face brightness variation (OCEAN_FACE_SHADES).
 * Vertex colours are multipliers, so use with a material that has `vertexColors: true`.
 */
export function buildOceanGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(GLOBE_RADIUS, OCEAN_DETAIL); // non-indexed
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let v = 0; v < pos.count; v += 3) {
    a.fromBufferAttribute(pos, v);
    b.fromBufferAttribute(pos, v + 1);
    c.fromBufferAttribute(pos, v + 2);
    const idx = Math.floor(faceHash01(a, b, c) * OCEAN_FACE_SHADES.length);
    const s = OCEAN_FACE_SHADES[Math.min(idx, OCEAN_FACE_SHADES.length - 1)];
    colors.fill(s, v * 3, v * 3 + 9);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

let latticeCache: THREE.Vector3[] | null = null;

/**
 * Fixed, globally shared unit-sphere points (deduplicated icosphere vertices).
 * Every country samples the same lattice, so interior vertices are consistent worldwide.
 */
function getLatticePoints(): THREE.Vector3[] {
  if (latticeCache) return latticeCache;
  const geo = new THREE.IcosahedronGeometry(1, LAND_LATTICE_DETAIL);
  const pos = geo.getAttribute('position');
  const seen = new Set<string>();
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const key = latticeKey(v.x, v.y, v.z);
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push(v.clone());
  }
  geo.dispose();
  latticeCache = pts;
  return pts;
}

function pointInRing2D(x: number, y: number, flat: number[], n: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], yi = flat[i * 2 + 1];
    const xj = flat[j * 2], yj = flat[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function minDistToRing2D(x: number, y: number, flat: number[], n: number): number {
  let best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = flat[j * 2], ay = flat[j * 2 + 1];
    const bx = flat[i * 2], by = flat[i * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

function orient2D(p: number[], a: number, b: number, c: number): number {
  return (
    (p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1]) -
    (p[b * 2 + 1] - p[a * 2 + 1]) * (p[c * 2] - p[a * 2])
  );
}

/** > 0 when d lies inside the circumcircle of CCW triangle (a, b, c). */
function inCircle2D(p: number[], a: number, b: number, c: number, d: number): number {
  const dx = p[d * 2], dy = p[d * 2 + 1];
  const adx = p[a * 2] - dx, ady = p[a * 2 + 1] - dy;
  const bdx = p[b * 2] - dx, bdy = p[b * 2 + 1] - dy;
  const cdx = p[c * 2] - dx, cdy = p[c * 2 + 1] - dy;
  return (
    (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) -
    (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) +
    (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady)
  );
}

/**
 * Lawson edge flipping toward a constrained Delaunay triangulation.
 * Border (ring) edges are never flipped, so the country outline is preserved.
 * Stereographic projection maps circles to circles, so this is Delaunay on the sphere too.
 */
function delaunayFlip(p: number[], tris: number[], ringCount: number): number[] {
  const t = tris.slice();
  const triCount = t.length / 3;
  for (let i = 0; i < triCount; i++) {
    if (orient2D(p, t[i * 3], t[i * 3 + 1], t[i * 3 + 2]) < 0) {
      const tmp = t[i * 3 + 1];
      t[i * 3 + 1] = t[i * 3 + 2];
      t[i * 3 + 2] = tmp;
    }
  }

  const isBorderEdge = (a: number, b: number) =>
    a < ringCount && b < ringCount &&
    ((a + 1) % ringCount === b || (b + 1) % ringCount === a);

  for (let pass = 0; pass < 100; pass++) {
    const edgeMap = new Map<string, number[]>();
    for (let i = 0; i < triCount; i++) {
      for (let k = 0; k < 3; k++) {
        const a = t[i * 3 + k], b = t[i * 3 + ((k + 1) % 3)];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const list = edgeMap.get(key);
        if (list) list.push(i);
        else edgeMap.set(key, [i]);
      }
    }

    let flipped = false;
    const touched = new Set<number>();
    for (const [key, list] of edgeMap) {
      if (list.length !== 2) continue;
      const [t1, t2] = list;
      if (touched.has(t1) || touched.has(t2)) continue;
      const [ea, eb] = key.split(',').map(Number);
      if (isBorderEdge(ea, eb)) continue;

      // Rotate t1 to (a, b, c) with c opposite the shared edge.
      let a = -1, b = -1, c = -1;
      for (let k = 0; k < 3; k++) {
        const v = t[t1 * 3 + k];
        if (v !== ea && v !== eb) {
          c = v;
          a = t[t1 * 3 + ((k + 1) % 3)];
          b = t[t1 * 3 + ((k + 2) % 3)];
        }
      }
      let d = -1;
      for (let k = 0; k < 3; k++) {
        const v = t[t2 * 3 + k];
        if (v !== ea && v !== eb) d = v;
      }
      if (c < 0 || d < 0 || c === d) continue;
      if (inCircle2D(p, a, b, c, d) <= 1e-12) continue;
      // Only flip if the quad (a, d, b, c) is convex.
      if (orient2D(p, a, d, c) <= 1e-12 || orient2D(p, d, b, c) <= 1e-12) continue;

      t[t1 * 3] = a; t[t1 * 3 + 1] = d; t[t1 * 3 + 2] = c;
      t[t2 * 3] = d; t[t2 * 3 + 1] = b; t[t2 * 3 + 2] = c;
      touched.add(t1);
      touched.add(t2);
      flipped = true;
    }
    if (!flipped) break;
  }
  return t;
}

/**
 * Subdivides large triangles on the sphere so vertices stay elevated without dipping.
 */
function subdivideSphericalTriangle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  maxDist: number = 0.58,
  depth: number = 0
): [THREE.Vector3, THREE.Vector3, THREE.Vector3][] {
  if (depth >= 1) return [[a, b, c]];

  const dAB = a.distanceTo(b);
  const dBC = b.distanceTo(c);
  const dCA = c.distanceTo(a);

  if (Math.max(dAB, dBC, dCA) <= maxDist) {
    return [[a, b, c]];
  }

  const mAB = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).normalize();
  const mBC = new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5).normalize();
  const mCA = new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5).normalize();

  return [
    ...subdivideSphericalTriangle(a, mAB, mCA, maxDist, depth + 1),
    ...subdivideSphericalTriangle(mAB, b, mBC, maxDist, depth + 1),
    ...subdivideSphericalTriangle(mCA, mBC, c, maxDist, depth + 1),
    ...subdivideSphericalTriangle(mAB, mBC, mCA, maxDist, depth + 1),
  ];
}

/**
 * Builds each country as a complete, solid, closed 3D polyhedron:
 * - All countries on the EXACT SAME LEVEL (radius = LAND_RADIUS).
 * - Top cap, bottom cap, and vertical side walls form a closed solid volume for every country.
 * - Shared boundaries align with 100% mathematical precision with zero gaps or holes.
 */
export function buildCountriesMesh(
  worldData: any
): {
  geometry: THREE.BufferGeometry;
  countryInfoList: CountryInfo[];
  triangleToCountryMap: Int32Array;
  /** Per country: the border rings actually rendered, as unit-sphere points. */
  countryOutlines: THREE.Vector3[][][];
} {
  const geometries = worldData.objects.countries.geometries;
  const n = geometries.length;

  // 1. Decode and simplify shared TopoJSON arcs
  const { scale, translate } = worldData.transform;
  const decodeArc = (arc: [number, number][]): [number, number][] => {
    let x = 0;
    let y = 0;
    return arc.map((pt) => {
      x += pt[0];
      y += pt[1];
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  };

  const rawDecodedArcs: [number, number][][] = worldData.arcs.map(decodeArc);
  // Simplify arcs to clean low-poly segments
  const simplifiedArcs: [number, number][][] = rawDecodedArcs.map((arc) => simplifyDP(arc, 1.1));

  // 2. Map arcs to country indices for greedy adjacency coloring
  const arcToCountries = new Map<number, number[]>();
  geometries.forEach((geom: any, cIdx: number) => {
    const collectArcs = (arr: any) => {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (Array.isArray(item)) collectArcs(item);
          else {
            const arcId = item >= 0 ? item : ~item;
            if (!arcToCountries.has(arcId)) arcToCountries.set(arcId, []);
            arcToCountries.get(arcId)!.push(cIdx);
          }
        }
      }
    };
    if (geom.arcs) collectArcs(geom.arcs);
  });

  const neighbors: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (const cArr of arcToCountries.values()) {
    for (let i = 0; i < cArr.length; i++) {
      for (let j = i + 1; j < cArr.length; j++) {
        neighbors[cArr[i]].add(cArr[j]);
        neighbors[cArr[j]].add(cArr[i]);
      }
    }
  }

  // 3. Compute color assignments (adjacent countries never share a color)
  const colorAssignments = computeGreedyMap(neighbors, COUNTRY_PALETTE.length, 1);

  const getArcPoints = (arcIdx: number): [number, number][] => {
    const arcId = arcIdx >= 0 ? arcIdx : ~arcIdx;
    if (arcIdx >= 0) return simplifiedArcs[arcId];
    return simplifiedArcs[arcId].slice().reverse();
  };

  const getRawArcPoints = (arcIdx: number): [number, number][] => {
    const arcId = arcIdx >= 0 ? arcIdx : ~arcIdx;
    if (arcIdx >= 0) return rawDecodedArcs[arcId];
    return rawDecodedArcs[arcId].slice().reverse();
  };

  /** Full-resolution (unsimplified) exterior ring, without the duplicate closing point. */
  const getRawRing = (exteriorArcs: number[]): [number, number][] => {
    const rawRing: [number, number][] = [];
    for (const aIdx of exteriorArcs) {
      const pts = getRawArcPoints(aIdx);
      for (let i = 0; i < pts.length; i++) {
        if (rawRing.length > 0 && i === 0) continue;
        rawRing.push(pts[i]);
      }
    }
    if (
      rawRing.length > 1 &&
      rawRing[0][0] === rawRing[rawRing.length - 1][0] &&
      rawRing[0][1] === rawRing[rawRing.length - 1][1]
    ) {
      rawRing.pop();
    }
    return rawRing;
  };

  const countryInfoList: CountryInfo[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const triangleToCountry: number[] = [];
  const countryOutlines: THREE.Vector3[][][] = [];

  const topCol = new THREE.Color();
  const sideCol = new THREE.Color();
  const botCol = new THREE.Color();

  for (let cIdx = 0; cIdx < n; cIdx++) {
    const geom = geometries[cIdx];
    const countryName = geom.properties?.name || `Country ${cIdx + 1}`;

    // Color
    let hexColor: string;
    if (countryName === 'Antarctica') {
      hexColor = ANTARCTICA_COLOR;
    } else if (countryName === 'Greenland') {
      hexColor = GREENLAND_COLOR;
    } else {
      hexColor = COUNTRY_PALETTE[colorAssignments[cIdx] % COUNTRY_PALETTE.length];
    }

    const outlineRings: THREE.Vector3[][] = [];
    countryOutlines.push(outlineRings);

    countryInfoList.push({
      index: cIdx,
      id: String(geom.id || cIdx),
      name: countryName,
      color: hexColor,
    });

    topCol.set(hexColor);
    sideCol.set(hexColor).multiplyScalar(0.72);
    botCol.set(hexColor).multiplyScalar(0.50);

    const processPolygon = (arcsArray: any) => {
      if (!Array.isArray(arcsArray) || arcsArray.length === 0) return;

      if (Array.isArray(arcsArray[0]) && Array.isArray(arcsArray[0][0])) {
        for (const subPoly of arcsArray) {
          processPolygon(subPoly);
        }
        return;
      }

      const exteriorArcs: number[] = arcsArray[0];
      if (!Array.isArray(exteriorArcs) || exteriorArcs.length === 0) return;

      // Assemble ring coordinates
      let ring: [number, number][] = [];
      for (const aIdx of exteriorArcs) {
        const pts = getArcPoints(aIdx);
        for (let i = 0; i < pts.length; i++) {
          if (ring.length > 0 && i === 0) continue;
          ring.push(pts[i]);
        }
      }

      // Remove duplicate closing point for earcut
      if (
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
      ) {
        ring.pop();
      }

      // Fallback for micro-polygons to ensure AT LEAST 3 distinct vertices
      if (ring.length < 3) {
        const rawRing = getRawRing(exteriorArcs);
        if (rawRing.length >= 3) {
          ring = [
            rawRing[0],
            rawRing[Math.floor(rawRing.length / 3)],
            rawRing[Math.floor((rawRing.length * 2) / 3)],
          ];
        }
      }

      if (ring.length < 3) return;

      // Omit polygons that are too small, unless they share a border with another
      // country (removing those would punch a hole into the landmass).
      const touchesOtherCountry = exteriorArcs.some((aIdx) =>
        (arcToCountries.get(aIdx >= 0 ? aIdx : ~aIdx) ?? []).some((c) => c !== cIdx)
      );
      if (!touchesOtherCountry && ringAreaKm2(getRawRing(exteriorArcs)) < MIN_ISLAND_AREA_KM2) {
        return;
      }

      // Convert ring to unit sphere 3D points
      const unitPoints: THREE.Vector3[] = [];
      const center = new THREE.Vector3();

      for (let i = 0; i < ring.length; i++) {
        const pt = ring[i];
        const v = lonLatToVector3(pt[0], pt[1], 1.0);
        unitPoints.push(v);
        center.add(v);
      }
      center.normalize();

      // Stereographic tangent projection
      const up = Math.abs(center.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const basisU = new THREE.Vector3().crossVectors(up, center).normalize();
      const basisV = new THREE.Vector3().crossVectors(center, basisU).normalize();

      const flat2D: number[] = [];
      for (const p of unitPoints) {
        const d = 1 + center.dot(p);
        const k = d > 0.0001 ? 2 / d : 1;
        flat2D.push(k * p.dot(basisU), k * p.dot(basisV));
      }

      const ringCount = ring.length;

      // Interior Steiner points: fixed lattice points that fall inside the outline
      // (and not hugging the border). Appended after the ring vertices.
      const holeIndices: number[] = [];
      for (const lp of getLatticePoints()) {
        const d = 1 + center.dot(lp);
        if (d < 1.05) continue; // stay well inside the projection's stable hemisphere
        const k = 2 / d;
        const x = k * lp.dot(basisU);
        const y = k * lp.dot(basisV);
        if (!pointInRing2D(x, y, flat2D, ringCount)) continue;
        if (minDistToRing2D(x, y, flat2D, ringCount) < LATTICE_BORDER_MARGIN * LATTICE_SPACING * k) continue;
        holeIndices.push(unitPoints.length);
        unitPoints.push(lp.clone());
        flat2D.push(x, y);
      }
      const steinerCount = holeIndices.length;

      // Triangulate: earcut treats single-point holes as Steiner points.
      let indices: number[] = [];
      if (steinerCount > 0) {
        indices = earcut(flat2D, holeIndices);
        // A valid triangulation of n border + m interior points has n + 2m - 2 triangles.
        if (indices.length / 3 !== ringCount + 2 * steinerCount - 2) {
          indices = [];
        }
      }
      if (indices.length === 0) {
        // Fall back to border-only triangulation.
        unitPoints.length = ringCount;
        flat2D.length = ringCount * 2;
        indices = ringCount === 3 ? [0, 1, 2] : earcut(flat2D);
        if (indices.length === 0) {
          for (let k = 1; k < ringCount - 1; k++) {
            indices.push(0, k, k + 1);
          }
        }
      }
      indices = delaunayFlip(flat2D, indices, ringCount);
      outlineRings.push(unitPoints.slice(0, ringCount).map((v) => v.clone()));

      // ==========================================
      // 1. TOP CAP (around LAND_RADIUS, all countries on the same level, each
      //    vertex displaced by the shared relief field)
      // ==========================================
      for (let i = 0; i < indices.length; i += 3) {
        const iA = indices[i];
        const iB = indices[i + 1];
        const iC = indices[i + 2];

        const pA = unitPoints[iA];
        const pB = unitPoints[iB];
        const pC = unitPoints[iC];

        // Ensure normal points outward from the globe center
        const normal = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(pB, pA),
          new THREE.Vector3().subVectors(pC, pA)
        );

        const triCentroid = new THREE.Vector3().add(pA).add(pB).add(pC).normalize();

        let vA = pA;
        let vB = pB;
        let vC = pC;
        if (normal.dot(triCentroid) < 0) {
          vB = pC;
          vC = pB;
        }

        const subTris = subdivideSphericalTriangle(vA, vB, vC, 0.58);
        for (const [sA, sB, sC] of subTris) {
          // Each corner gets its own height, so flat-shaded facets end up tilted
          // against each other instead of forming one smooth shell.
          const rA = landRadiusAtVertex(sA);
          const rB = landRadiusAtVertex(sB);
          const rC = landRadiusAtVertex(sC);
          positions.push(
            sA.x * rA, sA.y * rA, sA.z * rA,
            sB.x * rB, sB.y * rB, sB.z * rB,
            sC.x * rC, sC.y * rC, sC.z * rC
          );

          // Two-tone faceting: pick the base or dimmed shade per triangle.
          const shade = isDimFace(sA, sB, sC) ? FACE_SHADE_DIM : 1;
          const r = topCol.r * shade, g = topCol.g * shade, b = topCol.b * shade;
          colors.push(r, g, b, r, g, b, r, g, b);

          triangleToCountry.push(cIdx);
        }
      }

      // ==========================================
      // 2. BOTTOM CAP (at BOTTOM_RADIUS, sealing the polyhedron underside)
      // ==========================================
      for (let i = 0; i < indices.length; i += 3) {
        const iA = indices[i];
        const iB = indices[i + 1];
        const iC = indices[i + 2];

        const pA = unitPoints[iA];
        const pB = unitPoints[iB];
        const pC = unitPoints[iC];

        const normal = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(pB, pA),
          new THREE.Vector3().subVectors(pC, pA)
        );

        const triCentroid = new THREE.Vector3().add(pA).add(pB).add(pC).normalize();

        // Inward facing for bottom cap
        let vA = pA;
        let vB = pB;
        let vC = pC;
        if (normal.dot(triCentroid) > 0) {
          vB = pC;
          vC = pB;
        }

        const subTris = subdivideSphericalTriangle(vA, vB, vC, 0.58);
        for (const [sA, sB, sC] of subTris) {
          positions.push(
            sA.x * BOTTOM_RADIUS, sA.y * BOTTOM_RADIUS, sA.z * BOTTOM_RADIUS,
            sB.x * BOTTOM_RADIUS, sB.y * BOTTOM_RADIUS, sB.z * BOTTOM_RADIUS,
            sC.x * BOTTOM_RADIUS, sC.y * BOTTOM_RADIUS, sC.z * BOTTOM_RADIUS
          );

          colors.push(
            botCol.r, botCol.g, botCol.b,
            botCol.r, botCol.g, botCol.b,
            botCol.r, botCol.g, botCol.b
          );

          triangleToCountry.push(cIdx);
        }
      }

      // ==========================================
      // 3. VERTICAL SIDE WALLS (closed from the relieved cap down to BOTTOM_RADIUS)
      // ==========================================
      // Forming a closed 3D polyhedron around the entire country perimeter
      // Walls follow only the border ring, never the interior lattice points.
      for (let i = 0; i < ringCount; i++) {
        const p1 = unitPoints[i];
        const p2 = unitPoints[(i + 1) % ringCount];

        const r1 = landRadiusAt(p1);
        const r2 = landRadiusAt(p2);
        const t1 = new THREE.Vector3(p1.x * r1, p1.y * r1, p1.z * r1);
        const t2 = new THREE.Vector3(p2.x * r2, p2.y * r2, p2.z * r2);
        const b1 = new THREE.Vector3(p1.x * BOTTOM_RADIUS, p1.y * BOTTOM_RADIUS, p1.z * BOTTOM_RADIUS);
        const b2 = new THREE.Vector3(p2.x * BOTTOM_RADIUS, p2.y * BOTTOM_RADIUS, p2.z * BOTTOM_RADIUS);

        // Quad = 2 triangles
        positions.push(
          t1.x, t1.y, t1.z,
          b1.x, b1.y, b1.z,
          t2.x, t2.y, t2.z,

          t2.x, t2.y, t2.z,
          b1.x, b1.y, b1.z,
          b2.x, b2.y, b2.z
        );

        for (let k = 0; k < 6; k++) {
          colors.push(sideCol.r, sideCol.g, sideCol.b);
        }

        triangleToCountry.push(cIdx, cIdx);
      }
    };

    processPolygon(geom.arcs);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return {
    geometry,
    countryInfoList,
    triangleToCountryMap: new Int32Array(triangleToCountry),
    countryOutlines,
  };
}
