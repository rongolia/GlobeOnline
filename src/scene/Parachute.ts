import * as THREE from 'three';

// Model proportions in model units (scaled by `scale` in the constructor).
// Origin = bottom of the payload crate; +Y points away from the globe.
const CRATE_SIZE = 0.35;
const CANOPY_RADIUS = 0.75;
const CANOPY_FLATTEN = 0.55; // vertical squash of the dome
const CANOPY_BASE_Y = 1.1; // height of the canopy rim above the crate bottom
const CANOPY_PANELS = 8;
// Panel colours, cycled around the canopy: the classic Google blue, red, yellow and
// green, each split from the next by a white panel. Eight entries for the eight panels,
// so every colour appears exactly once.
const CANOPY_WHITE = 0xf5f1e8;
const CANOPY_COLORS = [
  0x4285f4, CANOPY_WHITE,
  0xea4335, CANOPY_WHITE,
  0xfbbc05, CANOPY_WHITE,
  0x34a853, CANOPY_WHITE,
];
const CRATE_COLOR = 0xb07a45;
const LINE_COLOR = 0xe8e8e8;

// Motion
const SWAY_AMPLITUDE = 0.14; // radians
const SWAY_SPEED = 2.4; // radians per second
const SPIN_SPEED = 0.35; // radians per second (slow yaw while falling)
const DEFLATE_MS = 800; // canopy collapse after landing

// A drop that came down on the wrong country gets taken back rather than left on the
// globe. It sits still briefly so the player can see where it actually landed, then
// crumples, sinks through the surface and spins away to nothing.
const FAIL_HOLD_MS = 650; // still on the ground, being looked at
const FAIL_SINK_MS = 750; // crumpling and disappearing
const FAIL_SINK_DEPTH = 1.6; // model units it sinks through the surface
const FAIL_SPIN = 3.4; // radians of yaw over the sink

interface SharedAssets {
  canopyGeo: THREE.BufferGeometry;
  crateGeo: THREE.BufferGeometry;
  linesGeo: THREE.BufferGeometry;
  canopyMat: THREE.Material;
  crateMat: THREE.Material;
  lineMat: THREE.Material;
}

let shared: SharedAssets | null = null;

/** Geometry/materials are built once and shared by every parachute. */
function getShared(): SharedAssets {
  if (shared) return shared;

  // Low-poly dome: hemisphere with few segments, non-indexed so each face can be coloured.
  const dome = new THREE.SphereGeometry(CANOPY_RADIUS, CANOPY_PANELS, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopyGeo = dome.toNonIndexed();
  dome.dispose();
  const pos = canopyGeo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let v = 0; v < pos.count; v += 3) {
    // Panel index from the face centroid's azimuth -> alternating stripes.
    const x = (pos.getX(v) + pos.getX(v + 1) + pos.getX(v + 2)) / 3;
    const z = (pos.getZ(v) + pos.getZ(v + 1) + pos.getZ(v + 2)) / 3;
    const az = Math.atan2(z, x) + Math.PI;
    const panel = Math.floor((az / (Math.PI * 2)) * CANOPY_PANELS) % CANOPY_PANELS;
    c.set(CANOPY_COLORS[panel % CANOPY_COLORS.length]);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (v + k) * 3);
  }
  canopyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  canopyGeo.computeVertexNormals();

  const crateGeo = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
  crateGeo.translate(0, CRATE_SIZE / 2, 0);

  // Suspension lines: canopy rim points -> nearest top corner of the crate.
  const h = CRATE_SIZE / 2;
  const corners = [
    [h, -h], [h, h], [-h, h], [-h, -h],
  ];
  const linePts: number[] = [];
  for (let k = 0; k < CANOPY_PANELS; k++) {
    const a = (k / CANOPY_PANELS) * Math.PI * 2;
    const rx = Math.cos(a) * CANOPY_RADIUS;
    const rz = Math.sin(a) * CANOPY_RADIUS;
    let best = corners[0];
    for (const cc of corners) {
      if ((cc[0] - rx) ** 2 + (cc[1] - rz) ** 2 < (best[0] - rx) ** 2 + (best[1] - rz) ** 2) best = cc;
    }
    linePts.push(rx, CANOPY_BASE_Y, rz, best[0], CRATE_SIZE, best[1]);
  }
  const linesGeo = new THREE.BufferGeometry();
  linesGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));

  shared = {
    canopyGeo,
    crateGeo,
    linesGeo,
    canopyMat: new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    crateMat: new THREE.MeshStandardMaterial({ color: CRATE_COLOR, flatShading: true, roughness: 0.9 }),
    lineMat: new THREE.LineBasicMaterial({ color: LINE_COLOR }),
  };
  return shared;
}

/** Frees the shared geometry/materials (call once when the scene is torn down). */
export function disposeParachuteAssets(): void {
  if (!shared) return;
  shared.canopyGeo.dispose();
  shared.crateGeo.dispose();
  shared.linesGeo.dispose();
  shared.canopyMat.dispose();
  shared.crateMat.dispose();
  shared.lineMat.dispose();
  shared = null;
}

/**
 * A low-poly parachute that falls radially toward the globe centre along `dir`
 * (world space) and collapses when it lands.
 */
export class Parachute {
  /** Add this to the scene. Origin = bottom of the crate. */
  readonly object = new THREE.Group();
  landed = false;
  /** True once a failed drop has finished disappearing and can be taken out of the scene. */
  faded = false;

  private rig = new THREE.Group(); // sways/spins under the radial orientation
  private canopy: THREE.Mesh;
  private lines: THREE.LineSegments;
  private dir: THREE.Vector3;
  private radius: number;
  private baseQuat = new THREE.Quaternion();
  private age = 0;
  private phase = Math.random() * Math.PI * 2;
  private landTime = -1;
  private failTime = -1; // -1 = this drop is staying
  private landedRadius = 0;
  private baseScale = 1;

  constructor(dir: THREE.Vector3, startRadius: number, scale: number) {
    const s = getShared();
    this.dir = dir.clone().normalize();
    this.radius = startRadius;

    this.canopy = new THREE.Mesh(s.canopyGeo, s.canopyMat);
    this.canopy.position.y = CANOPY_BASE_Y;
    this.canopy.scale.y = CANOPY_FLATTEN;
    this.lines = new THREE.LineSegments(s.linesGeo, s.lineMat);
    const crate = new THREE.Mesh(s.crateGeo, s.crateMat);

    // Pivot the sway at the canopy (pendulum), not at the crate.
    const body = new THREE.Group();
    body.position.y = -CANOPY_BASE_Y;
    body.add(this.canopy, this.lines, crate);
    this.rig.position.y = CANOPY_BASE_Y;
    this.rig.add(body);
    this.object.add(this.rig);
    this.object.scale.setScalar(scale);
    this.baseScale = scale;

    // Model +Y points away from the globe along dir.
    this.baseQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.dir);
    this.object.quaternion.copy(this.baseQuat);
    this.object.position.copy(this.dir).multiplyScalar(this.radius);
  }

  /**
   * Advances the fall. `groundRadius` is the distance from the globe centre to the
   * surface directly below. Returns true on the frame it lands.
   */
  update(dtSec: number, nowMs: number, groundRadius: number, fallSpeed: number): boolean {
    this.age += dtSec;

    // Wrong country: crumple, sink through the surface, and go.
    if (this.failTime >= 0) {
      const since = nowMs - this.failTime;
      if (since < FAIL_HOLD_MS) return false; // a beat to be seen first

      const k = Math.min(1, (since - FAIL_HOLD_MS) / FAIL_SINK_MS);
      const e = k * k; // starts gently, drops away fast

      // Canopy crumples flat against the crate, harder and faster than a good landing.
      this.canopy.scale.y = THREE.MathUtils.lerp(CANOPY_FLATTEN, 0.05, Math.min(1, k * 2));
      this.canopy.position.y = THREE.MathUtils.lerp(CANOPY_BASE_Y, CRATE_SIZE * 0.3, Math.min(1, k * 2));
      this.canopy.position.x = 0;
      this.canopy.rotation.z = 0;

      // Sinks through the ground while shrinking and turning, so it reads as taken back
      // rather than knocked over. The globe hides whatever is left below the surface.
      this.rig.rotation.set(0, this.rig.rotation.y + FAIL_SPIN * dtSec, 0);
      this.object.scale.setScalar(this.baseScale * (1 - e));
      this.object.position
        .copy(this.dir)
        .multiplyScalar(this.landedRadius - FAIL_SINK_DEPTH * this.baseScale * e);

      if (k >= 1) this.faded = true;
      return false;
    }

    if (this.landed) {
      // Canopy collapses and tips over, lines go slack.
      const k = Math.min(1, (nowMs - this.landTime) / DEFLATE_MS);
      const e = 1 - (1 - k) ** 2;
      this.canopy.scale.y = THREE.MathUtils.lerp(CANOPY_FLATTEN, 0.12, e);
      this.canopy.position.y = THREE.MathUtils.lerp(CANOPY_BASE_Y, CRATE_SIZE * 0.6, e);
      this.canopy.position.x = THREE.MathUtils.lerp(0, CANOPY_RADIUS * 0.9, e);
      this.canopy.rotation.z = THREE.MathUtils.lerp(0, -0.5, e);
      return false;
    }

    this.radius -= fallSpeed * dtSec;
    let justLanded = false;
    if (this.radius <= groundRadius) {
      this.radius = groundRadius;
      this.landed = true;
      this.landTime = nowMs;
      this.landedRadius = groundRadius;
      this.lines.visible = false;
      this.rig.rotation.set(0, this.rig.rotation.y, 0); // settle upright
      justLanded = true;
    } else {
      // Pendulum sway + slow spin while descending.
      const t = this.age * SWAY_SPEED + this.phase;
      this.rig.rotation.set(Math.sin(t) * SWAY_AMPLITUDE, this.age * SPIN_SPEED + this.phase, Math.cos(t * 0.7) * SWAY_AMPLITUDE * 0.6);
    }

    this.object.position.copy(this.dir).multiplyScalar(this.radius);
    return justLanded;
  }

  /**
   * Marks this drop as a wrong answer. It holds where it landed for a moment, then
   * crumples, sinks through the surface and shrinks away; `faded` goes true once there
   * is nothing left to see and the caller should drop it from the scene.
   */
  fail(nowMs: number): void {
    if (this.failTime >= 0) return;
    this.failTime = nowMs;
    this.lines.visible = false;
    if (!this.landed) this.landedRadius = this.radius;
  }

  /**
   * World position of the canopy. The group's own origin is the bottom of the crate,
   * which sits well below what the eye reads as "the parachute", so this is what
   * hit-testing a click should aim at.
   */
  canopyWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.canopy.getWorldPosition(target);
  }

  /** Removes it from whatever it is attached to (shared assets are not disposed). */
  remove(): void {
    this.object.removeFromParent();
  }
}
