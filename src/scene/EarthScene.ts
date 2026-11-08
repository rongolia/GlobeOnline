import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { Parachute, disposeParachuteAssets } from './Parachute';
import worldData from 'world-atlas/countries-110m.json';
import type { Difficulty } from '../data/countries';
import {
  GLOBE_RADIUS,
  landRadiusAt,
  buildOceanGeometry,
  buildCountriesMesh,
  CountryInfo,
} from '../utils/geo';

// ============================================================
// Rotation feel
// ============================================================
// Fraction of the fling speed kept each frame after releasing a drag (0..1).
// Higher = longer glide; lower = stops sooner. Was 0.94.
const ROTATION_INERTIA = 0.85;
// Below this the glide is treated as finished and no longer applied, so it is also the
// point at which the globe counts as motionless.
const ROTATION_STOP_VELOCITY = 0.0001;
// Damping is exponential, so the current angle only ever approaches its target. Within
// this much of it (radians) the remaining travel is far under a pixel on screen.
const ROTATION_SETTLE_EPSILON = 0.002;
// The glide after a release is measured over this much of the most recent pointer
// movement, rather than from the single last pointer event. A mouse reporting at 1 kHz
// can deliver one jittery sample a millisecond before the button comes up, and taking
// that one sample as "the speed" throws the globe. Averaging a window also means that
// holding the pointer still before releasing leaves the window empty, so the globe stops
// where it was put instead of drifting on.
const FLING_SAMPLE_MS = 90;
// Pointer pixels per millisecond are multiplied by this to get the radians added per
// frame while the globe glides.
const FLING_SPEED = 0.06;
// Before the game, drag / glide / idle-spin speed scales with the camera's distance to the
// globe surface: fully zoomed out = 1x, zoomed in = proportionally slower (so the surface
// moves across the screen at a similar rate). Set false for a constant speed.
const SCALE_ROTATION_WITH_ZOOM = true;

// Camera zoom range (distance from the globe centre). The page starts fully zoomed out.
const MIN_CAM_DIST = 3.2;
const MAX_CAM_DIST = 7.2;
const DEFAULT_CAM_DIST = MAX_CAM_DIST;

// ============================================================
// Background tweakables
// ============================================================
// Vertical gradient behind the globe: night at the top of the screen down to daylight at
// the bottom. Stops are [position 0..1, CSS colour], top first. These land on screen as
// written: three.js skips tone mapping for a background whose texture is tagged sRGB, so
// unlike the globe itself the gradient does not go through ACES.
// The middle stops run blue -> violet -> rose rather than straight from blue to peach:
// a direct blend between those two passes through a muddy grey at the halfway point.
const SKY_STOPS: [number, string][] = [
  [0, '#151d36'], // night
  [0.42, '#2b3a66'], // deep blue
  [0.68, '#6a5a94'], // violet twilight
  [0.86, '#b87f98'], // rose
  [1, '#f2ab93'], // pink dawn
];
// How much of the ramp is on screen at once, as a fraction of one night -> dawn pass.
// Well under 1, so the screen only ever holds a slice: the full sweep, and the turn the
// loop makes at each end of it, happen off screen. At 1 the whole ramp is visible and
// the turn shows up as a stripe across the middle. Lower is a gentler, wider-looking
// gradient; too low and the slice flattens into one colour.
const SKY_VIEW = 0.2;
// Fallback flat colour if a 2D canvas is unavailable (the gradient is drawn on one).
const SKY_FALLBACK = 0x0a0e17;
// Drift speed, in screen-heights per minute. Deliberately not a loop duration: the
// length of a loop depends on SKY_VIEW, so expressing it that way means every change to
// the view silently changes the speed too. 0 holds the gradient still.
const SKY_DRIFT_PER_MIN = 1.1;

// ============================================================
// Lighting tweakables
// ============================================================
// Uniform base light.
const AMBIENT_INTENSITY = 2.6;
// Dim directional light for subtle per-face shading (0 = flat ambient-only look).
const DIRECTIONAL_INTENSITY = 0.6;
// Where the directional light comes from (scene space; camera looks down -Z from +Z).
const DIRECTIONAL_POSITION: [number, number, number] = [-3, 4, 5];

// ============================================================
// Modes
// ============================================================
// Before game : mouse hover highlights the country under the cursor; idle auto-spin on.
// Game        : startGame() opens with the briefing (GAME_BRIEF_MS), counts the player
//               in from GAME_COUNTDOWN_SECONDS, then works
//               through the easy countries in a random order. Only the opening is counted
//               in; later attempts follow straight on from the one before. Each
//               attempt names one country to find and places a beacon at a random FIXED
//               point in space above the globe; the player turns the globe to bring that
//               country under it before the parachute comes down. Landing on the named
//               country moves on to the next one AND wins a spent chance back; anything
//               else costs one of MAX_MISTAKES chances and sets the same country again.
//               The game ends - straight into the post-game scene - once every country
//               has been found, or the chances run out.
// Learn       : the post-game scene. Every easy country gets a static beacon on the
//               globe, and a ray from the SCREEN CENTRE picks the country you rotate
//               under it. It has no time limit and never ends on its own: restart()
//               takes it back to "before game".
// Wrong answers allowed before the game ends.
//
// This is tied to the clue ladder in the UI: every miss repeats the country with an
// easier clue, walking the easy set’s three facts from most obscure to best known, then
// the flag, then the name. Five is what it takes to reach the end of that ladder, so
// lowering it silently makes the last rungs unreachable.
export const MAX_MISTAKES = 5;
// Chances are spent on a miss and won back on a find, so this is a ceiling rather than a
// budget: a player who keeps getting them right can go wrong again later. It is also the
// number of dots the HUD draws, which is why a find can never push the count above it -
// the extra chance would exist but have nowhere to show.
// What finding a country is worth, by the attempt it was found on. Working it out from
// the first, most obscure clue is worth the most; each miss drops the country to an
// easier clue and a smaller prize, down to the last rung where the name itself is on
// screen. A wrong answer scores nothing at all. Indexed from attempt 1, and the last
// entry covers any attempt beyond the table, so this can be re-balanced on its own.
const POINTS_BY_ATTEMPT = [10, 6, 3, 2, 1];
// Everything found on the first clue: the best score a full game can produce.
export const MAX_SCORE_PER_COUNTRY = POINTS_BY_ATTEMPT[0];
// How long the result message stays up after a parachute lands (ms). Must match the
// .landing-pop animation in index.css. Exported so the UI and the pacing below share one
// value instead of each keeping its own copy.
export const LANDING_MESSAGE_MS = 2400;
// Pause between a parachute landing and the next beacon (ms). It waits out the result
// message, so the player sees how the attempt went before the next one starts.
const GAME_ROUND_DELAY_MS = LANDING_MESSAGE_MS;
// The briefing that opens a game: what the player is being asked to do. It has the
// screen to itself for this long, then stays up through the count-in.
const GAME_BRIEF_MS = 3600;
// The game opens by counting in from this many seconds at the centre of the screen,
// giving the player time to read the first country and settle the globe. It runs once
// per game, not between attempts.
const GAME_COUNTDOWN_SECONDS = 3;
// How long the briefing text is on screen in all: its own stage plus the count-in it
// sits above. Exported because the text's animation has to run for exactly as long as
// it is mounted - a fade-out any earlier or later than the unmount would show.
export const GAME_BRIEF_VISIBLE_MS = GAME_BRIEF_MS + GAME_COUNTDOWN_SECONDS * 1000;
// Learning-round beacons (static, attached to the globe at each learn country's centre).
const LEARN_BEACON_HEIGHT = 0.5; // above the ocean surface (globe units)
const LEARN_BEACON_COLOR = 0xffd166;
// Clicking within this many screen pixels of a learn beacon turns the globe to its country.
const LEARN_BEACON_CLICK_PX = 18;
// A press/release that moves less than this (px) counts as a click, not a drag.
const CLICK_MAX_MOVE_PX = 5;
// The idle auto-spin takes back over this long after the last interaction (ms).
const AUTO_SPIN_IDLE_MS = 1500;
// ...but when the globe turns itself to a country it holds there this long instead,
// so there is time to read the country before the spin carries it away.
const FOCUS_HOLD_MS = 1500;

export type GamePhase = 'idle' | 'learn' | 'rounds';

/** Game progress reported to the UI. */
/** How one country ended up. Absent from the results entirely = never reached. */
export type CountryResult = 'found' | 'missed';

export interface GameState {
  active: boolean; // rounds or post-game
  phase: GamePhase;
  /** The mode this game was started in. Stays put through the post-game scene. */
  difficulty: Difficulty;
  /** The country to find right now; null outside the rounds phase. */
  target: CountryInfo | null;
  /**
   * Which attempt at that country is running, counting from 1. It drives how much help
   * the UI gives: every miss repeats the country, and the clue gets easier each time.
   * 0 while no attempt is live (during the opening count-in, or outside the game).
   */
  attempt: number;
  /**
   * How each country the game reached ended up, keyed by map name: 'found' once it was
   * landed on, 'missed' while it was being hunted and the parachute came down somewhere
   * else. Countries the game never got to are simply absent. Survives the game, so the
   * post-game scene can say how each one went.
   */
  results: Record<string, CountryResult>;
  /** How many countries have been found. Kept after the game, as the final score. */
  found: number;
  /** How many there were to find in all. */
  total: number;
  /** Wrong answers so far. */
  mistakes: number;
  /** Wrong answers allowed before the game ends. */
  maxMistakes: number;
  /** Points so far. Kept after the game, as the final score. */
  score: number;
  /** Whole seconds left in the opening count-in (3, 2, 1), or null when not counting. */
  countdown: number | null;
  /**
   * True while the opening briefing is up, which is the stage before the count-in: the
   * game is live but no attempt has started and nothing has been asked of the player yet.
   */
  briefing: boolean;
}

/** How one attempt went, reported as its parachute lands. */
export interface RoundResult {
  /** The country the player was asked to find. */
  target: CountryInfo;
  /** Where the parachute actually came down (null = ocean). */
  landedOn: CountryInfo | null;
  correct: boolean;
  /** Points this attempt earned. 0 for a wrong answer. */
  points: number;
  /**
   * True when this attempt won back a spent chance. False on a miss, and false on a find
   * made with every chance still in hand - there was nothing to give back.
   */
  chanceRegained: boolean;
}

// ============================================================
// Beacon tweakables
// ============================================================
// Height of the beacon above the ocean surface (globe units; globe radius = 2).
const BEACON_HEIGHT = 1.8;
const BEACON_COLOR = 0x9be7ff;
// Beam thickness (globe units).
const BEACON_BEAM_RADIUS = 0.012;
// Pole rays: static beams sticking out of the North and South Pole, attached to the
// globe (they rotate with it). Always visible, no animation.
const POLE_RAY_HEIGHT = 2.4; // above the ocean surface (globe units)
// Coloured like a bar magnet: north red, south blue. +Y is the north pole here
// (lonLatToVector3 puts lat +90 at y = +r), so sign > 0 in buildPoleRays() is north.
const POLE_RAY_COLOR_NORTH = 0xff4a3d;
const POLE_RAY_COLOR_SOUTH = 0x4a90ff;
const POLE_RAY_OPACITY = 0.9;
// How long the beam takes to travel from the beacon to the surface after placing it (ms).
const BEACON_DROP_MS = 600;
// The impact ring floats this far above the beam's hit point (globe units), so the
// corners of the tilted low-poly faces around the hit don't poke through it.
const BEACON_RING_LIFT = 0.03;
// Parachute dropped from the beacon on each cast.
const PARACHUTE_SCALE = 0.1; // ~0.15 globe units tall
const PARACHUTE_FALL_SPEED = 0.12; // globe units per second (beacon height 1.2 -> ~10 s)
// Clicking a falling parachute multiplies its speed for the rest of the drop.
const PARACHUTE_BOOST = 4;
// How close to the canopy a click has to land (screen px). Generous: the parachute is a
// small, moving, swaying target.
const PARACHUTE_CLICK_PX = 44;
const MAX_LANDED_PARACHUTES = 10; // oldest landed parachutes are removed beyond this
// The beacon is placed at a random angle (degrees) away from the camera's view axis,
// i.e. on the visible side, avoiding the centre (beam seen end-on) and the globe's edge.
// Directions are sampled uniformly by area, so the mean lands nearer the outer bound
// than the midpoint: this range averages about 28 degrees off the view axis.
// The minimum is the end-on guard - at 0 the beam points straight at the camera and
// collapses to a dot, so it cannot go much below this.
const BEACON_MIN_ANGLE_DEG = 12;
const BEACON_MAX_ANGLE_DEG = 38;
// The whole beacon (top and landing point) must project inside this fraction of the
// screen (1 = the screen edge), checked at full zoom-out. Spots that don't fit are re-rolled.
const BEACON_SCREEN_MARGIN = 0.85;

// How far the globe may be pitched: all the way to looking straight down on either
// pole, but no further, so it never tips past them and hangs upside down. Stopping short
// of the poles used to put high-latitude countries out of reach of a beacon.
const PITCH_LIMIT = Math.PI / 2; // 90 degrees: pole facing the camera
// A beacon spot is only used if the target country can be brought under it with this much
// pitch still to spare, so the player is never fighting the clamp to reach it.
const BEACON_REACH_PITCH_MARGIN = (8 * Math.PI) / 180;
// ...and with this much room in the yaw solution. Near zero the country only grazes the
// beacon at the very extreme of its swing, which is reachable but horrible to play.
const BEACON_REACH_YAW_MARGIN = 0.12;

// ============================================================
// Hover outline tweakables
// ============================================================
const OUTLINE_COLOR = 0xffffff;
// Line thickness in screen pixels.
const OUTLINE_WIDTH = 6;
// Draw vertical edges at each border vertex (in addition to the top and base outlines).
const OUTLINE_VERTICAL_EDGES = true;
// ============================================================

export interface EarthSceneOptions {
  container: HTMLElement;
  /** Called when a game starts, advances, or ends. */
  onGameStateChange?: (state: GameState) => void;
  /**
   * The countries each mode asks the player to find, by map name. Cumulative in practice
   * - medium includes easy, and so on - but that is the caller's business; the scene just
   * takes whichever list belongs to the mode it was started in.
   */
  targetPools?: Partial<Record<Difficulty, string[]>>;
  /**
   * The countries each mode shows in its post-game scene, by map name. Separate from the
   * target pools because the two want different things: a game draws from everything up
   * to its level, while the scene afterwards is about that level alone.
   */
  postGamePools?: Partial<Record<Difficulty, string[]>>;
  /** Learn phase: called when the country under the screen centre changes (null = none/ocean). */
  onFocusCountry?: (country: CountryInfo | null) => void;
  onCountryHover?: (country: CountryInfo | null, screenPos: { x: number; y: number } | null) => void;
  /** Beacon mode: called whenever the country under the beacon changes (null = ocean). */
  onBeaconHit?: (country: CountryInfo | null) => void;
  /** Game: called as an attempt's parachute lands, with how the attempt went. */
  onRoundResult?: (result: RoundResult) => void;
}

export class EarthScene {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Main rotating globe container
  public earthGroup!: THREE.Group;

  // Meshes
  private skyTexture?: THREE.Texture;
  private oceanMesh!: THREE.Mesh;
  private countriesMesh!: THREE.Mesh;
  private hoverOutline!: LineSegments2;
  private hoverOutlineMat!: LineMaterial;

  // Data
  private countryInfoList: CountryInfo[] = [];
  private countryOutlines: THREE.Vector3[][][] = [];
  private triangleToCountryMap!: Int32Array;
  private onCountryHover?: (country: CountryInfo | null, screenPos: { x: number; y: number } | null) => void;

  // Interaction State
  private isSoftwareGl: boolean = false;
  private isDragging: boolean = false;
  private pointerId: number | null = null;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private lastPointerTime: number = 0;
  // Recent pointer movement (newest last), kept only for the length of FLING_SAMPLE_MS
  // and used to measure the glide when the drag is released.
  private dragSamples: { t: number; dx: number; dy: number; dt: number }[] = [];
  private pointerDownX: number = 0;
  private pointerDownY: number = 0;

  // Multi-touch pinch tracking
  private activeTouches: Map<number, { x: number; y: number }> = new Map();
  private initialPinchDist: number = 0;
  private initialCameraDistance: number = DEFAULT_CAM_DIST;

  // Rotational dynamics
  private currentRotX: number = 0.28; // slight initial tilt
  private currentRotY: number = -1.2; // show Atlantic / Europe / Americas
  private targetRotX: number = 0.28;
  private targetRotY: number = -1.2;
  private velocityX: number = 0;
  private velocityY: number = 0;

  // Camera zoom dynamics
  private currentCamDist: number = DEFAULT_CAM_DIST;
  private targetCamDist: number = DEFAULT_CAM_DIST;
  private minCamDist: number = MIN_CAM_DIST;
  private maxCamDist: number = MAX_CAM_DIST;

  // Idle auto spin
  private lastInteractionTime: number = performance.now();
  // Radians added per frame (~4 deg/s at 60fps, a full turn in ~90s).
  private autoSpinSpeed: number = 0.0012;
  // Turned off permanently once a beacon is cast (beacon mode).
  private autoSpinEnabled: boolean = true;
  // Earliest time the idle spin may resume. Pushed out while the globe is turning
  // itself to a country, so it settles and holds before drifting again.
  private autoSpinHoldUntil: number = 0;

  // Raycaster for hover
  private raycaster = new THREE.Raycaster();
  private mouseVec = new THREE.Vector2(-1000, -1000);
  // Game state
  private gameActive: boolean = false;
  private nextRoundAt: number = -1; // performance.now() time to start the next attempt, -1 = none
  // The easy countries still to find, shuffled, and the one being hunted right now.
  private targetQueue: number[] = []; // country indices
  private targetIndex: number = -1; // -1 = no target
  private targetAttempt: number = 0; // attempts made at the current target, 0 = none yet
  private targetsFound: number = 0;
  private targetsTotal: number = 0;
  // How each country reached so far ended up. A country is only downgraded to 'missed'
  // if it has not already been found, so a late miss cannot undo an earlier success.
  private countryResults = new Map<number, CountryResult>();
  private score: number = 0;
  private mistakes: number = 0;
  // Set as a parachute lands: true moves on to the next country, false repeats this one.
  private advanceOnNextAttempt: boolean = false;
  // Opening count-in: when it runs out, and the whole second currently on screen.
  private briefEndsAt: number = -1; // -1 = briefing not showing
  private countdownEndsAt: number = -1; // -1 = not counting
  private countdownValue: number = 0; // 0 = nothing shown
  private onGameStateChange?: (state: GameState) => void;

  // Beacon
  private beaconGroup!: THREE.Group;
  private poleRays: THREE.Mesh[] = [];

  // Learning round
  private learnActive: boolean = false;
  private targetPools: Partial<Record<Difficulty, string[]>> = {};
  private postGamePools: Partial<Record<Difficulty, string[]>> = {};
  // The mode in play, and the pool it drew. Both survive into the post-game scene.
  private difficulty: Difficulty = 'easy';
  private activePool: string[] = []; // what this game asks for
  private activePostGamePool: string[] = []; // what it shows afterwards
  private learnBeacons: THREE.Mesh[] = [];
  // One entry per learn beacon: country index + globe-local top/bottom of its beam (for clicks).
  private learnBeaconHits: { countryIdx: number; top: THREE.Vector3; bottom: THREE.Vector3 }[] = [];
  private focusCountryIndex: number = -2; // -1 = ocean/none, -2 = not reported yet
  private screenCenter = new THREE.Vector2(0, 0);
  private onFocusCountry?: (country: CountryInfo | null) => void;
  private beaconBeam!: THREE.Mesh;
  private beaconSource!: THREE.Mesh;
  private beaconRing!: THREE.Mesh;
  private beaconDir = new THREE.Vector3();      // world-space direction of the beacon
  private beaconStart = new THREE.Vector3();    // world-space beacon position
  private beaconStartTime: number = -1;         // -1 = no beacon placed
  private beaconCountryIndex: number = -2;      // last reported hit (-1 = ocean, -2 = none yet)
  private fallingParachute: Parachute | null = null;
  // 1 until the falling parachute is clicked, PARACHUTE_BOOST after. Reset per drop.
  private parachuteBoost: number = 1;
  private parachuteScreenPos = new THREE.Vector3();
  private landedParachutes: Parachute[] = [];
  private onBeaconHit?: (country: CountryInfo | null) => void;
  private onRoundResult?: (result: RoundResult) => void;
  private lastHoveredCountryIndex: number = -1;

  // Animation frame id
  private frameId: number = 0;
  private isDestroyed: boolean = false;

  constructor(options: EarthSceneOptions) {
    this.container = options.container;
    this.onCountryHover = options.onCountryHover;
    this.onBeaconHit = options.onBeaconHit;
    this.onRoundResult = options.onRoundResult;
    this.onGameStateChange = options.onGameStateChange;
    this.targetPools = options.targetPools ?? {};
    this.postGamePools = options.postGamePools ?? {};
    this.activePool = this.targetPools.easy ?? [];
    this.activePostGamePool = this.postGamePools.easy ?? [];
    this.onFocusCountry = options.onFocusCountry;

    this.detectSoftwareGl();
    this.initScene();
    this.buildGlobe();
    this.setupEventListeners();
    this.startLoop();
  }

  private detectSoftwareGl(): void {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) {
        this.isSoftwareGl = true;
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      this.isSoftwareGl = true;
    }
  }

  private initScene(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.skyTexture = this.buildSkyTexture();
    this.scene.background = this.skyTexture ?? new THREE.Color(SKY_FALLBACK);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, this.currentCamDist);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting: mostly ambient, plus a very dim directional light so faces at
    //    different angles shade slightly differently within each country.
    this.scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));

    const dirLight = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_INTENSITY);
    dirLight.position.set(...DIRECTIONAL_POSITION);
    this.scene.add(dirLight);

    // Earth Root Group
    this.earthGroup = new THREE.Group();
    this.earthGroup.rotation.x = this.currentRotX;
    this.earthGroup.rotation.y = this.currentRotY;
    this.scene.add(this.earthGroup);
  }

  /**
   * The background gradient, drawn on a 2D canvas and used as scene.background. A plain
   * (UV-mapped) texture is drawn by three.js as a full-screen quad stretched to the
   * viewport, which is exactly what a vertical gradient wants - so the canvas only needs
   * to be a couple of pixels wide. Returns undefined if 2D canvas is unavailable.
   */
  private buildSkyTexture(): THREE.Texture | undefined {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    // Two ramps tall, because the texture holds the gradient mirrored (see below), and
    // tall overall because only SKY_VIEW of a ramp is stretched over the screen - too
    // few rows there and the slice bands.
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // The ramp is laid down twice, night -> dawn over the first half and dawn -> night
    // over the second, so the texture starts and ends on the same colour and therefore
    // tiles without a seam. The screen only ever shows half of it (repeat.y below), and
    // scrolling that window is what animates the loop: a single un-mirrored ramp would
    // snap from dawn straight back to night each time it wrapped.
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    for (const [at, color] of SKY_STOPS) {
      gradient.addColorStop(at * 0.5, color);
      gradient.addColorStop(1 - at * 0.5, color);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Repeat vertically so the scrolling window wraps; horizontally there is nothing to
    // wrap. Linear filtering keeps the rows smooth rather than banded when stretched.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    // The texture holds two ramps, so half of it is one full ramp - and SKY_VIEW of that
    // is the slice actually on screen. updateSky() slides which slice.
    texture.repeat.set(1, SKY_VIEW * 0.5);
    return texture;
  }

  /**
   * Scrolls the background gradient so the sky drifts between its two ends. three.js
   * copies a background texture's own UV transform into the background shader each
   * frame, so moving the offset is enough - nothing needs re-uploading.
   */
  private updateSky(now: number): void {
    if (!this.skyTexture || SKY_DRIFT_PER_MIN <= 0) return;
    // The offset is in texture units, so scaling by the height of the visible slice is
    // what keeps the drift at SKY_DRIFT_PER_MIN screen-heights a minute whatever
    // SKY_VIEW is set to.
    const viewHeight = SKY_VIEW * 0.5;
    this.skyTexture.offset.y = ((now / 60000) * SKY_DRIFT_PER_MIN * viewHeight) % 1;
  }

  private buildGlobe(): void {
    // 1. Low-Poly Ocean Sphere
    const oceanGeo = buildOceanGeometry();
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x194b72, // Vibrant toy ocean blue
      vertexColors: true, // per-face brightness variation
      roughness: 0.9, // matte: no sharp glint from the directional light
      metalness: 0,
      flatShading: true,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.earthGroup.add(this.oceanMesh);

    // 2. Low-Poly Countries (caps + extruded skirts)
    const { geometry, countryInfoList, triangleToCountryMap, countryOutlines } =
      buildCountriesMesh(worldData);
    this.countryInfoList = countryInfoList;
    this.triangleToCountryMap = triangleToCountryMap;
    this.countryOutlines = countryOutlines;

    const countriesMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
      // Push solid faces slightly back so the hover outline on their edges wins the depth test.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.countriesMesh = new THREE.Mesh(geometry, countriesMat);
    this.earthGroup.add(this.countriesMesh);

    // 3. Hover outline (fat lines; WebGL's native lines are always 1px)
    this.hoverOutlineMat = new LineMaterial({
      color: OUTLINE_COLOR,
      linewidth: OUTLINE_WIDTH,
    });
    this.hoverOutlineMat.resolution.set(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight
    );
    this.hoverOutline = new LineSegments2(new LineSegmentsGeometry(), this.hoverOutlineMat);
    this.hoverOutline.visible = false;
    this.hoverOutline.renderOrder = 1;
    this.earthGroup.add(this.hoverOutline);

    // 4. Beacon (beam + source glow + impact ring). Added to the SCENE, not the globe,
    //    so it stays fixed in world space while the globe rotates beneath it.
    const glowMat = () =>
      new THREE.MeshBasicMaterial({
        color: BEACON_COLOR,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
    // Unit-length beam hanging DOWN from its origin along local -Y; scaled to the hit distance.
    const beamGeo = new THREE.CylinderGeometry(BEACON_BEAM_RADIUS, BEACON_BEAM_RADIUS, 1, 10, 1, true);
    beamGeo.translate(0, -0.5, 0);
    this.beaconBeam = new THREE.Mesh(beamGeo, glowMat());
    this.beaconSource = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), glowMat());
    this.beaconRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 32), glowMat());
    (this.beaconRing.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;

    this.beaconGroup = new THREE.Group();
    this.beaconGroup.add(this.beaconBeam, this.beaconSource, this.beaconRing);
    this.beaconGroup.visible = false;
    this.beaconGroup.renderOrder = 2;
    this.scene.add(this.beaconGroup);

    // 5. Pole rays
    this.buildPoleRays();
  }

  /**
   * Static rays out of the North (+Y) and South (-Y) Pole, in the globe's own frame.
   * Each runs from POLE_RAY_HEIGHT above the ocean down to the actual surface at the pole.
   */
  private buildPoleRays(): void {
    this.earthGroup.updateMatrixWorld(true);
    const startRadius = GLOBE_RADIUS + POLE_RAY_HEIGHT;

    for (const sign of [1, -1]) {
      const dirLocal = new THREE.Vector3(0, sign, 0);

      // Find the surface at the pole (ocean or Antarctica) with a one-off raycast.
      const originWorld = this.earthGroup.localToWorld(dirLocal.clone().multiplyScalar(startRadius));
      const centerWorld = this.earthGroup.getWorldPosition(new THREE.Vector3());
      this.raycaster.set(originWorld, centerWorld.sub(originWorld).normalize());
      const hit = this.raycaster.intersectObjects([this.countriesMesh, this.oceanMesh], false)[0];
      const length = hit ? hit.distance : POLE_RAY_HEIGHT;

      // Unit cylinder hanging down from its origin along local -Y, scaled to the length.
      // Closed, not open-ended: a pole aimed at the camera shows the beam edge-on, where
      // the tube itself projects to nothing, and the end cap is all that is left to draw.
      // The cap only costs two triangle fans and scales with the beam, so it stays in
      // proportion instead of reading as a bead stuck on the end.
      const geo = new THREE.CylinderGeometry(BEACON_BEAM_RADIUS, BEACON_BEAM_RADIUS, 1, 10, 1, false);
      geo.translate(0, -0.5, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: sign > 0 ? POLE_RAY_COLOR_NORTH : POLE_RAY_COLOR_SOUTH,
        transparent: true,
        opacity: POLE_RAY_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const ray = new THREE.Mesh(geo, mat);
      ray.position.copy(dirLocal).multiplyScalar(startRadius);
      ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirLocal);
      ray.scale.set(1, length, 1);
      this.earthGroup.add(ray);
      this.poleRays.push(ray);
    }
  }

  /** True during the game or the post-game scene (hover off, zoom locked). */
  private isPlaying(): boolean {
    return this.gameActive || this.learnActive;
  }

  /** Starts the country hunt, which is followed by the post-game scene. */
  public startGame(difficulty: Difficulty = 'easy'): void {
    if (this.isDestroyed || this.isPlaying()) return;
    this.difficulty = difficulty;
    this.activePool = this.targetPools[difficulty] ?? [];
    this.activePostGamePool = this.postGamePools[difficulty] ?? [];

    // Leave "before game" mode: clear hover, previous game's parachutes, stop idle spin,
    // zoom fully out.
    if (this.lastHoveredCountryIndex !== -1) {
      this.lastHoveredCountryIndex = -1;
      this.onCountryHover?.(null, null);
    }
    this.hideOutline();
    this.landedParachutes.forEach((p) => p.remove());
    this.landedParachutes = [];
    this.autoSpinEnabled = false;
    this.targetCamDist = this.maxCamDist;

    this.beginRounds();
  }

  private beginRounds(): void {
    this.targetQueue = this.shuffledTargets();
    this.targetsTotal = this.targetQueue.length;
    this.targetsFound = 0;
    this.countryResults.clear();
    this.mistakes = 0;
    this.score = 0;
    this.targetIndex = -1;
    this.targetAttempt = 0;
    this.nextRoundAt = -1;
    this.gameActive = true;

    // Nothing to play (no easy country is on the map): go straight to the post-game scene.
    if (!this.takeNextTarget()) {
      this.endRounds();
      return;
    }
    // The first country is chosen before any of this, so it is ready to go the moment the
    // count-in ends. The opening runs briefing -> count-in -> first beacon, each handed on
    // by updateGame().
    this.briefEndsAt = performance.now() + GAME_BRIEF_MS;
    this.reportGameState('rounds');
  }

  /**
   * The easy countries that are actually drawn on the globe, in a random order. Anything
   * the map data does not carry is left out, so a target is always reachable.
   */
  private shuffledTargets(): number[] {
    const wanted = new Set(this.activePool.map((n) => n.toLowerCase()));
    const pool = this.countryInfoList
      .filter((c) => wanted.has(c.name.toLowerCase()) && this.countryOutlines[c.index]?.length)
      .map((c) => c.index);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  /**
   * Takes the next country off the queue, without starting its attempt.
   * False when the queue is empty, i.e. every country has been found.
   */
  private takeNextTarget(): boolean {
    const next = this.targetQueue.shift();
    if (next === undefined) {
      this.targetIndex = -1;
      return false;
    }
    this.targetIndex = next;
    this.targetAttempt = 0; // a new country starts back at the hardest clue
    return true;
  }

  /** Moves on to the next country and drops its beacon. False when the queue is empty. */
  private nextTarget(): boolean {
    if (!this.takeNextTarget()) return false;
    this.startAttempt();
    return true;
  }

  /**
   * Stops the opening sequence, so neither the briefing nor the count-in is left on
   * screen. Both stages are cleared together: they are two halves of one opening, and a
   * game that ends or restarts during either has to leave the centre empty.
   */
  private cancelCountdown(): void {
    this.briefEndsAt = -1;
    this.countdownEndsAt = -1;
    this.countdownValue = 0;
  }

  /** Drops a fresh beacon for the current target and tells the UI about it. */
  private startAttempt(): void {
    this.targetAttempt++;
    this.clearBeacon();
    this.castBeacon();
    this.reportGameState('rounds');
  }

  /** Reports the game to the UI. The counters survive the game, so can be read after it. */
  /** The per-country outcomes, keyed by map name so the UI can look one up directly. */
  private buildResults(): Record<string, CountryResult> {
    const out: Record<string, CountryResult> = {};
    for (const [index, result] of this.countryResults) {
      const info = this.countryInfoList[index];
      if (info) out[info.name] = result;
    }
    return out;
  }

  private reportGameState(phase: GamePhase): void {
    this.onGameStateChange?.({
      active: phase !== 'idle',
      phase,
      difficulty: this.difficulty,
      target: this.targetIndex >= 0 ? this.countryInfoList[this.targetIndex] : null,
      attempt: this.targetAttempt,
      results: this.buildResults(),
      found: this.targetsFound,
      total: this.targetsTotal,
      mistakes: this.mistakes,
      maxMistakes: MAX_MISTAKES,
      score: this.score,
      countdown: this.countdownValue > 0 ? this.countdownValue : null,
      briefing: this.briefEndsAt >= 0,
    });
  }

  // ---------- Learning round ----------

  private startLearn(): void {
    this.learnActive = true;
    this.focusCountryIndex = -2;
    this.buildLearnBeacons();
    this.reportGameState('learn');
  }

  private endLearn(): void {
    this.learnActive = false;
    for (const b of this.learnBeacons) {
      b.removeFromParent();
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    }
    this.learnBeacons = [];
    this.learnBeaconHits = [];
    this.renderer.domElement.style.cursor = '';
    this.hideOutline();
    this.focusCountryIndex = -2;
    this.onFocusCountry?.(null);
  }

  /** Static gold beacons (beam + orb) at the centre of each learn country, attached to the globe. */
  private buildLearnBeacons(): void {
    // Impossible plays the whole globe, so a beacon per country in the pool would be a
    // beacon on everything - 177 pulsing beams, nearly all of them on countries the game
    // never got round to asking for. The post-game scene is left bare instead: the
    // centre crosshair still picks out whatever you turn under it.
    if (this.difficulty === 'impossible') return;

    this.earthGroup.updateMatrixWorld(true);
    const startRadius = GLOBE_RADIUS + LEARN_BEACON_HEIGHT;
    const centerWorld = this.earthGroup.getWorldPosition(new THREE.Vector3());
    const wanted = new Set(this.activePostGamePool.map((n) => n.toLowerCase()));

    for (const c of this.countryInfoList) {
      if (!wanted.has(c.name.toLowerCase()) || !(this.countryOutlines[c.index]?.length)) continue;
      const dir = this.countryCenter(c.index);

      // Surface height under the beacon (one-off raycast).
      const originWorld = this.earthGroup.localToWorld(dir.clone().multiplyScalar(startRadius));
      this.raycaster.set(originWorld, centerWorld.clone().sub(originWorld).normalize());
      const hit = this.raycaster.intersectObjects([this.countriesMesh, this.oceanMesh], false)[0];
      const length = hit ? hit.distance : LEARN_BEACON_HEIGHT;

      const mat = () =>
        new THREE.MeshBasicMaterial({
          color: LEARN_BEACON_COLOR,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
      const beamGeo = new THREE.CylinderGeometry(BEACON_BEAM_RADIUS, BEACON_BEAM_RADIUS, 1, 10, 1, true);
      beamGeo.translate(0, -0.5, 0);
      const beam = new THREE.Mesh(beamGeo, mat());
      beam.position.copy(dir).multiplyScalar(startRadius);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      beam.scale.set(1, length, 1);

      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), mat());
      orb.position.copy(dir).multiplyScalar(startRadius);

      this.earthGroup.add(beam, orb);
      this.learnBeacons.push(beam, orb);
      this.learnBeaconHits.push({
        countryIdx: c.index,
        top: dir.clone().multiplyScalar(startRadius),
        bottom: dir.clone().multiplyScalar(startRadius - length),
      });
    }
  }

  /** Each frame in the learn phase: centre-of-screen pick and beacon pulse. */
  private updateLearn(now: number): void {
    if (!this.learnActive) return;

    // The beacons keep breathing whatever the globe is doing.
    const pulse = 0.7 + 0.3 * Math.sin(now * 0.005);
    for (const b of this.learnBeacons) (b.material as THREE.MeshBasicMaterial).opacity = pulse;

    // The pick below reads whatever is at the screen centre, so a moving globe sweeps a
    // stream of countries past it and the card would flicker through all of them. Report
    // nothing at all until the motion has finished, so the name and outline appear once,
    // on the country the globe actually came to rest on.
    if (!this.rotationSettled()) {
      if (this.focusCountryIndex !== -1) {
        this.focusCountryIndex = -1;
        this.hideOutline();
        this.onFocusCountry?.(null);
      }
      return;
    }

    // Ray from the screen centre (the camera looks at the globe centre).
    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    const hit = this.raycaster.intersectObjects([this.countriesMesh, this.oceanMesh], false)[0];
    let idx = -1;
    if (hit && hit.object === this.countriesMesh && hit.faceIndex != null) {
      idx = this.triangleToCountryMap[hit.faceIndex] ?? -1;
    }
    if (idx !== this.focusCountryIndex) {
      this.focusCountryIndex = idx;
      if (idx >= 0) this.showOutline(idx);
      else this.hideOutline();
      this.onFocusCountry?.(idx >= 0 ? this.countryInfoList[idx] : null);
    }
  }

  /** Clears the beacon, its beam and any parachute still in the air. */
  private clearBeacon(): void {
    this.beaconStartTime = -1;
    this.beaconGroup.visible = false;
    this.beaconCountryIndex = -2;
    this.fallingParachute?.remove();
    this.fallingParachute = null;
    this.parachuteBoost = 1;
    this.hideOutline();
  }

  /**
   * The game is over - every country found, or the lives spent. Clears the beacon and
   * hands straight over to the post-game scene, which has no timer and runs until
   * restart(). The score (found / total) is left intact for the UI to show, and landed
   * parachutes stay where they came down.
   */
  private endRounds(revealIndex: number = -1): void {
    this.gameActive = false;
    this.targetIndex = -1;
    this.targetAttempt = 0;
    this.targetQueue = [];
    this.nextRoundAt = -1;
    this.cancelCountdown();
    this.clearBeacon();
    this.startLearn();
    // After startLearn(), so the beacons are already in place as the globe arrives: the
    // post-game scene opens by turning to the answer instead of wherever the last miss
    // happened to leave the view. updateLearn() holds its readout until the globe stops,
    // so the country names itself the moment it settles, rather than flickering through
    // everything that passes the centre on the way.
    if (revealIndex >= 0) this.faceGlobeToward(this.countryCenter(revealIndex));
  }

  /**
   * Back to "before game" from the informational round: beacons, beam and parachutes
   * cleared, hover and the idle spin restored. The view is deliberately left exactly
   * where it is - no snap back to the opening rotation or zoom - so the globe simply
   * carries on from wherever the player left it.
   */
  public restart(): void {
    if (this.isDestroyed) return;
    this.gameActive = false;
    this.nextRoundAt = -1;
    this.cancelCountdown();
    this.targetQueue = [];
    this.targetIndex = -1;
    this.targetAttempt = 0;
    this.targetsFound = 0;
    this.targetsTotal = 0;
    this.countryResults.clear();
    this.score = 0;
    this.mistakes = 0;
    this.clearBeacon();
    if (this.learnActive) this.endLearn();

    this.landedParachutes.forEach((lp) => lp.remove());
    this.landedParachutes = [];

    this.autoSpinHoldUntil = 0;
    this.autoSpinEnabled = true;
    this.lastInteractionTime = performance.now();
    this.reportGameState('idle');
  }

  /**
   * Runs each frame: once the pause after a landing is over, moves on to the next
   * country, repeats the current one, or ends the game.
   */
  private updateGame(now: number): void {
    if (!this.gameActive) return;

    // Opening briefing: hands over to the count-in once it has had its time.
    if (this.briefEndsAt >= 0) {
      if (now < this.briefEndsAt) return;
      this.briefEndsAt = -1;
      this.countdownEndsAt = now + GAME_COUNTDOWN_SECONDS * 1000;
      this.countdownValue = GAME_COUNTDOWN_SECONDS;
      this.reportGameState('rounds');
      return;
    }

    // Opening count-in: the first beacon drops when it reaches zero.
    if (this.countdownEndsAt >= 0) {
      const left = Math.ceil((this.countdownEndsAt - now) / 1000);
      if (left > 0) {
        // Only report when the number on screen actually changes, not every frame.
        if (left !== this.countdownValue) {
          this.countdownValue = left;
          this.reportGameState('rounds');
        }
        return;
      }
      this.cancelCountdown();
      this.startAttempt();
      return;
    }

    if (this.nextRoundAt < 0 || now < this.nextRoundAt) return;
    this.nextRoundAt = -1;

    // Out of chances: the last miss ends it. The country that beat the player is handed
    // to the post-game scene to turn to, so the run finishes on the answer rather than on
    // a question left open.
    if (this.mistakes >= MAX_MISTAKES) {
      this.endRounds(this.targetIndex);
      return;
    }
    // Found it: on to the next, unless that was the last one.
    if (this.advanceOnNextAttempt) {
      if (!this.nextTarget()) this.endRounds();
      return;
    }
    // Missed, with lives left: same country, new beacon.
    this.startAttempt();
  }

  /**
   * One round: places the beacon at a new random fixed point in space above the
   * visible side of the globe and drops a parachute. From then on updateBeacon()
   * casts its ray every frame, so the highlighted country changes as the globe
   * rotates underneath it.
   */
  private castBeacon(): void {
    if (this.isDestroyed) return;

    // Zoom all the way out and drop any leftover drag momentum.
    this.targetCamDist = this.maxCamDist;
    this.velocityX = 0;
    this.velocityY = 0;

    this.pickBeaconDirection(this.beaconDir);

    this.beaconStart.copy(this.beaconDir).multiplyScalar(GLOBE_RADIUS + BEACON_HEIGHT);
    this.beaconSource.position.copy(this.beaconStart);
    // Beam hangs from the beacon toward the centre (beam's local +Y aligned with beaconDir).
    this.beaconBeam.position.copy(this.beaconStart);
    this.beaconBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.beaconDir);
    this.beaconBeam.scale.set(1, 0.0001, 1);
    // Ring faces outward along the beacon direction (ring geometry faces +Z).
    this.beaconRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.beaconDir);
    this.beaconRing.visible = false;

    this.beaconGroup.visible = true;
    this.beaconStartTime = performance.now();
    this.beaconCountryIndex = -2; // force a fresh report

    // New parachute at the beacon's start point (replaces one still in the air).
    this.fallingParachute?.remove();
    this.fallingParachute = new Parachute(this.beaconDir, GLOBE_RADIUS + BEACON_HEIGHT, PARACHUTE_SCALE);
    this.parachuteBoost = 1;
    this.scene.add(this.fallingParachute.object);
  }

  /** Random direction in the annulus between BEACON_MIN/MAX_ANGLE_DEG around the view axis (+Z). */
  private randomBeaconDirection(out: THREE.Vector3): THREE.Vector3 {
    const cosMin = Math.cos(THREE.MathUtils.degToRad(BEACON_MIN_ANGLE_DEG));
    const cosMax = Math.cos(THREE.MathUtils.degToRad(BEACON_MAX_ANGLE_DEG));
    const cosA = cosMax + Math.random() * (cosMin - cosMax); // uniform in area
    const sinA = Math.sqrt(1 - cosA * cosA);
    const phi = Math.random() * Math.PI * 2;
    return out.set(sinA * Math.cos(phi), sinA * Math.sin(phi), cosA);
  }

  /**
   * True if both the beacon's top and its landing point project inside the screen
   * margin for a camera on +Z at distance `camDist` looking at the origin.
   */
  private beaconFitsOnScreen(dir: THREE.Vector3, camDist: number): boolean {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aspect = this.camera.aspect;
    for (const r of [GLOBE_RADIUS + BEACON_HEIGHT, GLOBE_RADIUS]) {
      const depth = camDist - dir.z * r;
      if (depth <= this.camera.near) return false;
      const ndcX = (dir.x * r) / (depth * tanHalf * aspect);
      const ndcY = (dir.y * r) / (depth * tanHalf);
      if (Math.abs(ndcX) > BEACON_SCREEN_MARGIN || Math.abs(ndcY) > BEACON_SCREEN_MARGIN) return false;
    }
    return true;
  }

  /**
   * The pitch a player would have to hold to bring globe-local point `local` onto world
   * direction `dir`, or null if no rotation can line the two up.
   *
   * The globe turns as world = Rx(rotX) * Ry(rotY) * local. Yaw spins a point around the
   * globe's own axis, which leaves its latitude untouched, so yaw alone has to supply
   * dir.x - and it can only reach |dir.x| <= cos(latitude). Past that the point simply
   * never crosses the beacon, however the globe is turned. Inside it, the yaw is fixed up
   * to a sign, and each sign forces one pitch; the gentler of the two is returned.
   */
  private pitchToAlign(local: THREE.Vector3, dir: THREE.Vector3): number | null {
    const vz2 = 1 - local.y * local.y - dir.x * dir.x;
    if (vz2 < BEACON_REACH_YAW_MARGIN * BEACON_REACH_YAW_MARGIN) return null;
    const vz = Math.sqrt(vz2);
    let best: number | null = null;
    for (const sign of [1, -1]) {
      let a = Math.atan2(dir.z, dir.y) - Math.atan2(sign * vz, local.y);
      a = Math.atan2(Math.sin(a), Math.cos(a)); // wrap into (-pi, pi]
      if (best === null || Math.abs(a) < Math.abs(best)) best = a;
    }
    return best;
  }

  /** True if the player can comfortably turn `local` under a beacon at `dir`. */
  private canReachBeacon(local: THREE.Vector3, dir: THREE.Vector3): boolean {
    const pitch = this.pitchToAlign(local, dir);
    return pitch !== null && Math.abs(pitch) <= PITCH_LIMIT - BEACON_REACH_PITCH_MARGIN;
  }

  /**
   * Picks a beacon direction that is fully visible at the camera's target zoom (fully
   * zoomed out after a cast) AND that the round's target country can actually be turned
   * under. Without the second test a high-latitude target - the UK worst of all - can be
   * handed a spot it is geometrically unable to reach, leaving the round unwinnable.
   *
   * Reachability matters more than framing, so it is given up last: a spot that is
   * slightly outside the screen margin still beats one that cannot be played.
   */
  private pickBeaconDirection(out: THREE.Vector3): void {
    const target = this.targetIndex >= 0 ? this.countryCenter(this.targetIndex) : null;

    for (let i = 0; i < 500; i++) {
      this.randomBeaconDirection(out);
      if (!this.beaconFitsOnScreen(out, this.targetCamDist)) continue;
      if (target && !this.canReachBeacon(target, out)) continue;
      return;
    }
    if (target) {
      for (let i = 0; i < 500; i++) {
        this.randomBeaconDirection(out);
        if (this.canReachBeacon(target, out)) return;
      }
    }
    for (let i = 0; i < 500; i++) {
      this.randomBeaconDirection(out);
      if (this.beaconFitsOnScreen(out, this.targetCamDist)) return;
    }
    this.randomBeaconDirection(out);
  }

  /**
   * Every frame: casts the beacon's ray toward the globe centre, sizes the beam to
   * the hit, moves the impact ring there, and highlights the country underneath.
   */
  private updateBeacon(now: number, delta: number): void {
    if (this.beaconStartTime < 0) return;
    const t = now - this.beaconStartTime;

    // Ray from the fixed beacon toward the globe's centre (world origin).
    this.earthGroup.updateMatrixWorld(true);
    this.raycaster.set(this.beaconStart, this.beaconDir.clone().negate());
    const hit = this.raycaster.intersectObjects([this.countriesMesh, this.oceanMesh], false)[0];

    let countryIdx = -1;
    if (hit && hit.object === this.countriesMesh && hit.faceIndex != null) {
      countryIdx = this.triangleToCountryMap[hit.faceIndex] ?? -1;
    }
    const hitDistance = hit ? hit.distance : BEACON_HEIGHT;

    // Beam drops in on placement, then tracks the surface (land is taller than ocean).
    const drop = Math.min(1, t / BEACON_DROP_MS);
    const eased = 1 - (1 - drop) ** 3;
    this.beaconBeam.scale.set(1, Math.max(0.0001, eased * hitDistance), 1);

    const pulse = 0.5 + 0.5 * Math.sin(t * 0.006);
    (this.beaconBeam.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * pulse;
    (this.beaconSource.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.3 * pulse;

    if (drop >= 1) {
      // Impact ripple at the hit point (lifted slightly along the beam), repeating every 1.2 s.
      const ripple = ((t - BEACON_DROP_MS) % 1200) / 1200;
      this.beaconRing.visible = true;
      this.beaconRing.position
        .copy(this.beaconStart)
        .addScaledVector(this.beaconDir, -(hitDistance - BEACON_RING_LIFT));
      this.beaconRing.scale.setScalar(0.6 + ripple * 1.8);
      (this.beaconRing.material as THREE.MeshBasicMaterial).opacity = 1 - ripple;

      // Highlight whatever is under the beam once it has landed.
      if (countryIdx !== this.beaconCountryIndex) {
        this.beaconCountryIndex = countryIdx;
        if (countryIdx >= 0) this.showOutline(countryIdx);
        else this.hideOutline();
        this.onBeaconHit?.(countryIdx >= 0 ? this.countryInfoList[countryIdx] : null);
      }
    }

    // Parachute: falls down the beam toward whatever surface is currently under it.
    const groundRadius = GLOBE_RADIUS + BEACON_HEIGHT - hitDistance;
    const p = this.fallingParachute;
    if (p && p.update(delta, now, groundRadius, PARACHUTE_FALL_SPEED * this.parachuteBoost)) {
      // Landed: attach to the globe (keeping its world pose) so it rides with the ground.
      this.earthGroup.attach(p.object);
      this.landedParachutes.push(p);
      this.fallingParachute = null;

      // Judge the attempt against the country the player was asked to find. The beam's
      // current hit is whatever is directly under the parachute.
      if (this.gameActive && this.targetIndex >= 0) {
        const correct = this.beaconCountryIndex === this.targetIndex;
        // Only a right answer scores, and it is worth less the more clues it took.
        const points = correct
          ? POINTS_BY_ATTEMPT[Math.min(this.targetAttempt, POINTS_BY_ATTEMPT.length) - 1]
          : 0;
        // A find hands back one of the chances already spent. Capped at none spent, so
        // playing well restores the cushion without ever growing it past the HUD's dots.
        const chanceRegained = correct && this.mistakes > 0;
        if (correct) {
          this.targetsFound++;
          this.score += points;
          this.countryResults.set(this.targetIndex, 'found');
          if (chanceRegained) this.mistakes--;
        } else {
          this.mistakes++;
          if (this.countryResults.get(this.targetIndex) !== 'found') {
            this.countryResults.set(this.targetIndex, 'missed');
          }
          // A drop on the wrong country does not belong on the globe: it crumples and
          // sinks away, and the loop below takes it out once it has gone.
          p.fail(now);
        }
        this.advanceOnNextAttempt = correct;
        this.onRoundResult?.({
          target: this.countryInfoList[this.targetIndex],
          landedOn: this.beaconCountryIndex >= 0 ? this.countryInfoList[this.beaconCountryIndex] : null,
          correct,
          points,
          chanceRegained,
        });
        this.reportGameState('rounds');
        // Let the result message play out before the next beacon.
        this.nextRoundAt = now + GAME_ROUND_DELAY_MS;
      }
      while (this.landedParachutes.length > MAX_LANDED_PARACHUTES) {
        this.landedParachutes.shift()!.remove();
      }
    }
    // Landed drops keep animating in place; a failed one clears itself off the globe
    // once it has finished sinking.
    for (let i = this.landedParachutes.length - 1; i >= 0; i--) {
      const lp = this.landedParachutes[i];
      lp.update(delta, now, 0, 0);
      if (lp.faded) {
        lp.remove();
        this.landedParachutes.splice(i, 1);
      }
    }
  }

  /** Shows a 3D wireframe outline (top, base, vertical edges) around one country. */
  private showOutline(countryIdx: number): void {
    const rings = this.countryOutlines[countryIdx];
    if (!rings || rings.length === 0) {
      this.hideOutline();
      return;
    }

    // The top edge rides the same relief field as the cap, so the outline hugs the
    // coastline instead of floating over the dips and sinking into the rises.
    const base = GLOBE_RADIUS + 0.002;
    const pts: number[] = [];
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        const ta = landRadiusAt(a) + 0.002;
        const tb = landRadiusAt(b) + 0.002;
        pts.push(a.x * ta, a.y * ta, a.z * ta, b.x * tb, b.y * tb, b.z * tb);
        pts.push(a.x * base, a.y * base, a.z * base, b.x * base, b.y * base, b.z * base);
        if (OUTLINE_VERTICAL_EDGES) {
          pts.push(a.x * ta, a.y * ta, a.z * ta, a.x * base, a.y * base, a.z * base);
        }
      }
    }

    const geo = new LineSegmentsGeometry();
    geo.setPositions(pts);
    this.hoverOutline.geometry.dispose();
    this.hoverOutline.geometry = geo;
    this.hoverOutline.visible = true;
  }

  private hideOutline(): void {
    this.hoverOutline.visible = false;
  }

  private setupEventListeners(): void {
    const el = this.renderer.domElement;

    // Pointer events for drag rotation
    el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    // Mouse wheel for zoom
    el.addEventListener('wheel', this.onWheel, { passive: false });

    // Touch events for smooth 2-finger pinch zoom
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd, { passive: false });

    // Window resize
    window.addEventListener('resize', this.onResize);

    // Double tap/click to smoothly reset view
    el.addEventListener('dblclick', this.onDoubleClick);
    el.addEventListener('pointerleave', this.onPointerLeave);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.autoSpinHoldUntil = 0; // a deliberate grab cancels a focus hold
    this.pointerId = e.pointerId;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.lastPointerTime = performance.now();
    this.dragSamples.length = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.lastInteractionTime = performance.now();

    try {
      this.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (!this.isDragging) {
      // Pointer cursor over anything clickable, so the parachute reads as interactive.
      const overClickable =
        (this.parachuteBoost === 1 && this.parachuteAt(e.clientX, e.clientY)) ||
        (this.learnActive && this.learnBeaconAt(e.clientX, e.clientY) >= 0);
      this.renderer.domElement.style.cursor = overClickable ? 'pointer' : '';
    }

    if (!this.isDragging || e.pointerId !== this.pointerId) {
      return;
    }

    const now = performance.now();
    const dt = Math.max(1, now - this.lastPointerTime);
    const deltaX = e.clientX - this.lastPointerX;
    const deltaY = e.clientY - this.lastPointerY;

    const zoomScale = this.rotationZoomScale();
    const rotSensitivity = 0.0055 * zoomScale;
    this.targetRotY += deltaX * rotSensitivity;
    this.targetRotX += deltaY * rotSensitivity;

    // Clamp pitch so Earth doesn't flip completely upside down
    this.targetRotX = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.targetRotX));

    // Record the movement; the glide is worked out from this window on release, not from
    // whichever sample happens to land last.
    this.dragSamples.push({ t: now, dx: deltaX, dy: deltaY, dt });
    const oldest = now - FLING_SAMPLE_MS;
    while (this.dragSamples.length > 0 && this.dragSamples[0].t < oldest) {
      this.dragSamples.shift();
    }

    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.lastPointerTime = now;
    this.lastInteractionTime = now;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) {
      this.isDragging = false;
      this.pointerId = null;
      const now = performance.now();
      this.lastInteractionTime = now;
      this.applyFling(now);
      // A press/release without real movement is a click.
      const moved = Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY);
      if (moved < CLICK_MAX_MOVE_PX) this.onClick(e.clientX, e.clientY);
      try {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  /**
   * Turns the last FLING_SAMPLE_MS of pointer movement into the glide that follows a
   * release, and clears the window.
   *
   * Averaging a window rather than reading the final pointer event matters twice over: a
   * single jittery sample cannot fling the globe, and - the usual case - a pointer held
   * still for a moment before the button comes up leaves the window empty, so the globe
   * stops exactly where it was put. Reading the last event instead kept whatever speed
   * the pointer last happened to be moving at, however long ago that was.
   */
  private applyFling(now: number): void {
    const oldest = now - FLING_SAMPLE_MS;
    let dx = 0;
    let dy = 0;
    let span = 0;
    for (const sample of this.dragSamples) {
      if (sample.t < oldest) continue;
      dx += sample.dx;
      dy += sample.dy;
      span += sample.dt;
    }
    this.dragSamples.length = 0;

    if (span <= 0) {
      this.velocityX = 0;
      this.velocityY = 0;
      return;
    }
    const zoomScale = this.rotationZoomScale();
    this.velocityY = (dx / span) * FLING_SPEED * zoomScale;
    this.velocityX = (dy / span) * FLING_SPEED * zoomScale;
  }

  /**
   * Pointer left the canvas (off the window, or onto a UI panel). Park the pick ray
   * off-screen so updateHover() drops the highlight - otherwise a hover left sitting on
   * a country would pause the idle spin for good.
   */
  private onPointerLeave = (): void => {
    if (this.isDragging) return;
    this.mouseVec.set(-1000, -1000);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.isPlaying()) return; // zoom is locked during the learn round and game
    this.autoSpinHoldUntil = 0; // a deliberate zoom cancels a focus hold
    this.lastInteractionTime = performance.now();
    const zoomDelta = e.deltaY * 0.0035;
    this.targetCamDist = Math.max(this.minCamDist, Math.min(this.maxCamDist, this.targetCamDist + zoomDelta));
  };

  private onTouchStart = (e: TouchEvent): void => {
    this.autoSpinHoldUntil = 0; // a deliberate touch cancels a focus hold
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (this.activeTouches.size === 2) {
      const [t1, t2] = Array.from(this.activeTouches.values());
      this.initialPinchDist = Math.hypot(t1.x - t2.x, t1.y - t2.y);
      this.initialCameraDistance = this.targetCamDist;
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (this.activeTouches.has(t.identifier)) {
        this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }

    if (this.activeTouches.size === 2 && this.initialPinchDist > 0) {
      e.preventDefault();
      if (this.isPlaying()) return; // zoom is locked during the learn round and game
      this.lastInteractionTime = performance.now();
      const [t1, t2] = Array.from(this.activeTouches.values());
      const currentDist = Math.hypot(t1.x - t2.x, t1.y - t2.y);
      const ratio = this.initialPinchDist / Math.max(1, currentDist);
      this.targetCamDist = Math.max(
        this.minCamDist,
        Math.min(this.maxCamDist, this.initialCameraDistance * ratio)
      );
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      this.activeTouches.delete(e.changedTouches[i].identifier);
    }
    if (this.activeTouches.size < 2) {
      this.initialPinchDist = 0;
    }
    this.lastInteractionTime = performance.now();
  };

  /**
   * "Before game": double-clicking a country turns the globe to it and holds it centred
   * for FOCUS_HOLD_MS before the idle spin resumes. Double-clicking the ocean or empty
   * space is ignored. A double-click during a game still resets to the default view.
   */
  private onDoubleClick = (e: MouseEvent): void => {
    if (!this.isPlaying()) {
      const hit = this.pickCountryAt(this.clientToNdc(e.clientX, e.clientY));
      if (hit) this.faceGlobeToward(this.countryCenter(hit.index));
      return; // ocean / empty space: leave the globe where it is
    }

    // In game: reset to the default view (zoom is locked, so camera distance is left alone).
    this.targetRotX = 0.28;
    this.targetRotY = -1.2;
    this.velocityX = 0;
    this.velocityY = 0;
    this.lastInteractionTime = performance.now();
  };

  private onResize = (): void => {
    if (!this.container || this.isDestroyed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.hoverOutlineMat.resolution.set(width, height);
  };

  /** Screen (client) coordinates -> normalised device coordinates for the raycaster. */
  private clientToNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /**
   * Country under a point on screen: its index plus the world-space hit point, or null
   * for ocean / empty space. The ocean is tested too because it occludes the far side of
   * the globe, so a country only counts when it is the nearest thing under the point.
   */
  private pickCountryAt(ndc: THREE.Vector2): { index: number; point: THREE.Vector3 } | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const intersects = this.raycaster.intersectObjects([this.countriesMesh, this.oceanMesh], false);
    if (intersects.length === 0 || intersects[0].object !== this.countriesMesh) return null;

    const hit = intersects[0];
    const faceIndex = hit.faceIndex;
    if (faceIndex === undefined || faceIndex === null || !this.triangleToCountryMap) return null;

    const index = this.triangleToCountryMap[faceIndex];
    if (index === undefined || index < 0) return null;
    return { index, point: hit.point };
  }

  private updateHover(): void {
    // Hover only in "before game" mode.
    if (this.isPlaying() || !this.onCountryHover || this.isDragging) {
      return;
    }

    const hit = this.pickCountryAt(this.mouseVec);
    if (hit) {
      // Resting on a country counts as interacting with the globe. Without this the idle
      // timer keeps running while the spin is held, so the moment the pointer slid off a
      // country the globe would jump straight back into spinning; now moving off starts
      // the usual wait over.
      this.lastInteractionTime = performance.now();

      if (hit.index !== this.lastHoveredCountryIndex) {
        this.lastHoveredCountryIndex = hit.index;
        this.showOutline(hit.index);

        // Project 3D hit to screen coordinates for tooltip
        const screenPos = hit.point.clone().project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        const sx = ((screenPos.x + 1) / 2) * rect.width + rect.left;
        const sy = ((-screenPos.y + 1) / 2) * rect.height + rect.top;

        this.onCountryHover(this.countryInfoList[hit.index], { x: sx, y: sy });
      }
      return;
    }

    if (this.lastHoveredCountryIndex !== -1) {
      this.lastHoveredCountryIndex = -1;
      this.hideOutline();
      this.onCountryHover(null, null);
    }
  }

  /** Names of all countries that are actually drawn on the globe (sorted). */
  public getCountryNames(): string[] {
    return this.countryInfoList
      .filter((c) => (this.countryOutlines[c.index]?.length ?? 0) > 0)
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * "Before game": turns the globe so the named country is centred (no highlight) and
   * holds it there for a moment. Matching is case-insensitive: exact name first, then
   * names starting with the text (only if `allowPartial`). Returns the country or null.
   */
  public focusCountry(query: string, allowPartial = false): CountryInfo | null {
    if (this.isPlaying()) return null;
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const drawn = this.countryInfoList.filter((c) => (this.countryOutlines[c.index]?.length ?? 0) > 0);
    const country =
      drawn.find((c) => c.name.toLowerCase() === q) ??
      (allowPartial ? drawn.find((c) => c.name.toLowerCase().startsWith(q)) : undefined) ??
      (allowPartial ? drawn.find((c) => c.name.toLowerCase().includes(q)) : undefined);
    if (!country) return null;

    this.faceGlobeToward(this.countryCenter(country.index));
    return country;
  }

  /** Approximate centre (unit vector, globe-local) of a country's largest outline ring. */
  private countryCenter(countryIdx: number): THREE.Vector3 {
    let best: THREE.Vector3[] = [];
    let bestSpread = -1;
    for (const ring of this.countryOutlines[countryIdx] ?? []) {
      // Ring "size": 1 - |mean of unit points| grows with the ring's angular extent.
      const m = new THREE.Vector3();
      ring.forEach((p) => m.add(p));
      const spread = ring.length ? 1 - m.length() / ring.length : 0;
      if (spread > bestSpread) { bestSpread = spread; best = ring; }
    }
    const c = new THREE.Vector3();
    best.forEach((p) => c.add(p));
    return c.lengthSq() > 0 ? c.normalize() : new THREE.Vector3(0, 0, 1);
  }

  /** Smoothly turns the globe (shortest way) so globe-local direction `dir` faces the camera. */
  /**
   * Rotation-speed multiplier from the camera's distance to the globe surface
   * (1 at the default/furthest zoom). Only applies before the game.
   */
  private rotationZoomScale(): number {
    if (!SCALE_ROTATION_WITH_ZOOM || this.isPlaying()) return 1;
    const ref = DEFAULT_CAM_DIST - GLOBE_RADIUS;
    return Math.max(0.05, (this.currentCamDist - GLOBE_RADIUS) / ref);
  }

  /**
   * Is this screen point on the falling parachute? Measured against the canopy in screen
   * space rather than raycast against the mesh: the parachute is small and swaying, so a
   * pixel-exact test would be near impossible to hit.
   */
  private parachuteAt(clientX: number, clientY: number): boolean {
    const p = this.fallingParachute;
    if (!p || p.landed) return false;

    const ndc = p.canopyWorldPosition(this.parachuteScreenPos).project(this.camera);
    if (ndc.z > 1) return false; // behind the camera; project() mirrors those

    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = ((ndc.x + 1) / 2) * rect.width + rect.left;
    const sy = ((1 - ndc.y) / 2) * rect.height + rect.top;
    return Math.hypot(clientX - sx, clientY - sy) <= PARACHUTE_CLICK_PX;
  }

  /** Click handler (press + release without dragging). */
  private onClick(clientX: number, clientY: number): void {
    // Clicking the parachute drops it the rest of the way faster. One step, not a
    // stack: clicking again while it is already boosted does nothing.
    if (this.parachuteBoost === 1 && this.parachuteAt(clientX, clientY)) {
      this.parachuteBoost = PARACHUTE_BOOST;
      return;
    }

    if (!this.learnActive) return;
    const countryIdx = this.learnBeaconAt(clientX, clientY);
    if (countryIdx >= 0) this.faceGlobeToward(this.countryCenter(countryIdx));
  }

  /**
   * Learn phase: country index of the visible beacon within LEARN_BEACON_CLICK_PX of the
   * given screen point (nearest wins), or -1.
   *
   * A beacon stands LEARN_BEACON_HEIGHT above the surface, so its top clears the horizon
   * well before its base does: a country can be round the back while its gold beam still
   * shows past the globe's edge. Each beam is therefore clipped to the part the camera
   * can actually see, instead of dropping the whole beacon the moment its base turns
   * away - so whatever is drawn is what can be clicked, and nothing hidden is.
   */
  private learnBeaconAt(clientX: number, clientY: number): number {
    if (!this.learnActive || this.learnBeaconHits.length === 0) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const toScreen = (world: THREE.Vector3) => {
      const p = world.clone().project(this.camera);
      return { x: ((p.x + 1) / 2) * rect.width + rect.left, y: ((1 - p.y) / 2) * rect.height + rect.top };
    };
    const camPos = this.camera.position;
    const globeCentre = this.earthGroup.getWorldPosition(new THREE.Vector3());

    // True if the straight line from the camera to `point` clears the globe, i.e. the
    // point is not hidden behind it. Solves the camera->point segment against the globe
    // sphere; the camera is always outside it, so only the near root can fall inside.
    const toPoint = new THREE.Vector3();
    const camOffset = new THREE.Vector3();
    const clearsGlobe = (point: THREE.Vector3): boolean => {
      toPoint.subVectors(point, camPos);
      camOffset.subVectors(camPos, globeCentre);
      const qa = toPoint.dot(toPoint);
      const qb = 2 * camOffset.dot(toPoint);
      const qc = camOffset.dot(camOffset) - GLOBE_RADIUS * GLOBE_RADIUS;
      const disc = qb * qb - 4 * qa * qc;
      if (disc < 0) return true;
      const t = (-qb - Math.sqrt(disc)) / (2 * qa);
      return t <= 0 || t >= 1;
    };

    const topWorld = new THREE.Vector3();
    const bottomWorld = new THREE.Vector3();
    const probe = new THREE.Vector3();

    let best = -1;
    let bestDist = LEARN_BEACON_CLICK_PX;
    for (const b of this.learnBeaconHits) {
      this.earthGroup.localToWorld(topWorld.copy(b.top));
      this.earthGroup.localToWorld(bottomWorld.copy(b.bottom));

      // Top hidden means the whole beacon is behind the globe: nothing is drawn.
      if (!clearsGlobe(topWorld)) continue;

      // Otherwise clip the beam to its visible part. A point only ever becomes visible
      // as it moves further out from the centre, so there is a single crossing to find.
      let visibleFrom = 0;
      if (!clearsGlobe(bottomWorld)) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (clearsGlobe(probe.lerpVectors(bottomWorld, topWorld, mid))) hi = mid;
          else lo = mid;
        }
        visibleFrom = hi;
      }

      // Distance from the click to the visible part of the projected beam.
      const a = toScreen(topWorld);
      const c = toScreen(probe.lerpVectors(bottomWorld, topWorld, visibleFrom));
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((clientX - a.x) * dx + (clientY - a.y) * dy) / len2)) : 0;
      const d = Math.hypot(clientX - (a.x + dx * t), clientY - (a.y + dy * t));
      if (d < bestDist) {
        bestDist = d;
        best = b.countryIdx;
      }
    }
    return best;
  }

  /**
   * True when the globe is completely still: not under the pointer, no glide left, and
   * the damped angles have caught up with their targets.
   */
  private rotationSettled(): boolean {
    return (
      !this.isDragging &&
      Math.abs(this.velocityX) <= ROTATION_STOP_VELOCITY &&
      Math.abs(this.velocityY) <= ROTATION_STOP_VELOCITY &&
      Math.abs(this.targetRotX - this.currentRotX) < ROTATION_SETTLE_EPSILON &&
      Math.abs(this.targetRotY - this.currentRotY) < ROTATION_SETTLE_EPSILON
    );
  }

  private faceGlobeToward(dir: THREE.Vector3): void {
    // earthGroup uses Euler 'XYZ': world = Rx(rotX) * Ry(rotY) * local.
    // Ry brings dir into the YZ plane facing +Z; Rx then levels it to the view centre.
    const rotY = Math.atan2(-dir.x, dir.z);
    const elevation = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    const rotX = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, elevation));

    let dy = (rotY - this.targetRotY) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.targetRotY += dy;
    this.targetRotX = rotX;
    this.velocityX = 0;
    this.velocityY = 0;
    this.lastInteractionTime = performance.now();
    // Hold the country centred for a moment, then let the idle spin resume.
    this.autoSpinHoldUntil = this.lastInteractionTime + FOCUS_HOLD_MS;
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    let lastTime = performance.now();

    const tick = () => {
      if (this.isDestroyed) return;

      const now = performance.now();
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // Rotational physics & momentum
      if (!this.isDragging) {
        if (
          Math.abs(this.velocityX) > ROTATION_STOP_VELOCITY ||
          Math.abs(this.velocityY) > ROTATION_STOP_VELOCITY
        ) {
          this.targetRotX += this.velocityX;
          this.targetRotY += this.velocityY;
          this.velocityX *= ROTATION_INERTIA;
          this.velocityY *= ROTATION_INERTIA;

          this.targetRotX = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.targetRotX));
        } else if (
          this.autoSpinEnabled &&
          now - this.lastInteractionTime > AUTO_SPIN_IDLE_MS &&
          now >= this.autoSpinHoldUntil &&
          // Before the game, hovering a country holds the globe still so it can be read.
          // updateHover() also keeps lastInteractionTime fresh while the hover lasts, so
          // the wait above restarts from the moment the pointer leaves.
          this.lastHoveredCountryIndex < 0
        ) {
          // Gentle idle rotation around Y
          this.targetRotY += this.autoSpinSpeed * this.rotationZoomScale();
        }
      }

      // Smooth damping interpolation
      this.currentRotX = THREE.MathUtils.damp(this.currentRotX, this.targetRotX, 12, delta);
      this.currentRotY = THREE.MathUtils.damp(this.currentRotY, this.targetRotY, 12, delta);
      this.currentCamDist = THREE.MathUtils.damp(this.currentCamDist, this.targetCamDist, 10, delta);

      // Apply to Earth group and camera
      this.earthGroup.rotation.x = this.currentRotX;
      this.earthGroup.rotation.y = this.currentRotY;
      this.camera.position.z = this.currentCamDist;


      // Background drift, hover inspection, beacon animation
      this.updateSky(now);
      this.updateHover();
      this.updateBeacon(now, delta);
      this.updateLearn(now);
      this.updateGame(now);

      // Render scene
      this.renderer.render(this.scene, this.camera);

      // Software WebGL pacing or rAF
      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  public dispose(): void {
    this.isDestroyed = true;
    if (this.isSoftwareGl) {
      clearTimeout(this.frameId);
    } else {
      cancelAnimationFrame(this.frameId);
    }

    const el = this.renderer?.domElement;
    if (el) {
      el.removeEventListener('pointerdown', this.onPointerDown);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerUp);
      el.removeEventListener('wheel', this.onWheel);
      el.removeEventListener('touchstart', this.onTouchStart);
      el.removeEventListener('touchmove', this.onTouchMove);
      el.removeEventListener('touchend', this.onTouchEnd);
      el.removeEventListener('dblclick', this.onDoubleClick);
      el.removeEventListener('pointerleave', this.onPointerLeave);
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }

    window.removeEventListener('resize', this.onResize);

    this.hoverOutline?.geometry.dispose();
    this.hoverOutlineMat?.dispose();
    this.fallingParachute?.remove();
    this.landedParachutes.forEach((lp) => lp.remove());
    disposeParachuteAssets();
    for (const m of [this.beaconBeam, this.beaconSource, this.beaconRing, ...this.poleRays, ...this.learnBeacons]) {
      if (!m) continue;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.skyTexture?.dispose();
    this.renderer?.dispose();
  }
}
