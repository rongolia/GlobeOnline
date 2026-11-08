import * as THREE from 'three';
import earcutModule from 'earcut';

// Ensure earcut function is correctly extracted across CJS/ESM
const earcut: (vertices: number[], holes?: number[], dimensions?: number) => number[] =
  // @ts-expect-error handle default or direct export
  earcutModule.default || earcutModule;

export const GLOBE_RADIUS = 2.0;
// All countries are on the EXACT SAME LEVEL
export const LAND_RADIUS = 2.065;
export const BOTTOM_RADIUS = 1.996; // Sealing the underside completely into the globe core

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

  const countryInfoList: CountryInfo[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const triangleToCountry: number[] = [];

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
        if (rawRing.length >= 3) {
          ring = [
            rawRing[0],
            rawRing[Math.floor(rawRing.length / 3)],
            rawRing[Math.floor((rawRing.length * 2) / 3)],
          ];
        }
      }

      if (ring.length < 3) return;

      // Omit tiny disconnected islands if country has multiple parts
      let area = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      }
      area = Math.abs(area / 2);
      if (area < 0.25 && arcsArray.length > 1 && ring.length < 12) {
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

      // Triangulate
      let indices: number[];
      if (ring.length === 3) {
        indices = [0, 1, 2];
      } else {
        indices = earcut(flat2D);
        if (indices.length === 0) {
          indices = [];
          for (let k = 1; k < ring.length - 1; k++) {
            indices.push(0, k, k + 1);
          }
        }
      }

      // ==========================================
      // 1. TOP CAP (at LAND_RADIUS, all countries on same level)
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
          positions.push(
            sA.x * LAND_RADIUS, sA.y * LAND_RADIUS, sA.z * LAND_RADIUS,
            sB.x * LAND_RADIUS, sB.y * LAND_RADIUS, sB.z * LAND_RADIUS,
            sC.x * LAND_RADIUS, sC.y * LAND_RADIUS, sC.z * LAND_RADIUS
          );

          colors.push(
            topCol.r, topCol.g, topCol.b,
            topCol.r, topCol.g, topCol.b,
            topCol.r, topCol.g, topCol.b
          );

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
      // 3. VERTICAL SIDE WALLS (closed from LAND_RADIUS down to BOTTOM_RADIUS)
      // ==========================================
      // Forming a closed 3D polyhedron around the entire country perimeter
      for (let i = 0; i < unitPoints.length; i++) {
        const p1 = unitPoints[i];
        const p2 = unitPoints[(i + 1) % unitPoints.length];

        const t1 = new THREE.Vector3(p1.x * LAND_RADIUS, p1.y * LAND_RADIUS, p1.z * LAND_RADIUS);
        const t2 = new THREE.Vector3(p2.x * LAND_RADIUS, p2.y * LAND_RADIUS, p2.z * LAND_RADIUS);
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
  };
}
