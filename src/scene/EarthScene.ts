import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import worldData from 'world-atlas/countries-110m.json';
import {
  GLOBE_RADIUS,
  buildCountriesMesh,
  CountryInfo,
} from '../utils/geo';

export interface EarthSceneOptions {
  container: HTMLElement;
  onCountryHover?: (country: CountryInfo | null, screenPos: { x: number; y: number } | null) => void;
}

export class EarthScene {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private pmremGenerator!: THREE.PMREMGenerator;

  // Main rotating globe container
  public earthGroup!: THREE.Group;

  // Meshes
  private oceanMesh!: THREE.Mesh;
  private countriesMesh!: THREE.Mesh;
  private hoverHighlightMesh!: THREE.Mesh;

  // Data
  private countryInfoList: CountryInfo[] = [];
  private triangleToCountryMap!: Int32Array;
  private onCountryHover?: (country: CountryInfo | null, screenPos: { x: number; y: number } | null) => void;

  // Interaction State
  private isSoftwareGl: boolean = false;
  private isDragging: boolean = false;
  private pointerId: number | null = null;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;
  private lastPointerTime: number = 0;

  // Multi-touch pinch tracking
  private activeTouches: Map<number, { x: number; y: number }> = new Map();
  private initialPinchDist: number = 0;
  private initialCameraDistance: number = 4.8;

  // Rotational dynamics
  private currentRotX: number = 0.28; // slight initial tilt
  private currentRotY: number = -1.2; // show Atlantic / Europe / Americas
  private targetRotX: number = 0.28;
  private targetRotY: number = -1.2;
  private velocityX: number = 0;
  private velocityY: number = 0;

  // Camera zoom dynamics
  private currentCamDist: number = 4.8;
  private targetCamDist: number = 4.8;
  private minCamDist: number = 3.2;
  private maxCamDist: number = 7.2;

  // Idle auto spin
  private lastInteractionTime: number = performance.now();
  private autoSpinSpeed: number = 0.0018;

  // Raycaster for hover
  private raycaster = new THREE.Raycaster();
  private mouseVec = new THREE.Vector2(-1000, -1000);
  private lastHoveredCountryIndex: number = -1;

  // Animation frame id
  private frameId: number = 0;
  private isDestroyed: boolean = false;

  constructor(options: EarthSceneOptions) {
    this.container = options.container;
    this.onCountryHover = options.onCountryHover;

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
    this.scene.background = new THREE.Color(0x0a0e17); // Deep cosmic indigo-slate

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

    // 4. Studio Environment Lighting
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // 5. Studio Lights
    // Key Light: Warm golden sunlight
    const keyLight = new THREE.DirectionalLight(0xfff6e5, 2.2);
    keyLight.position.set(6, 4, 5);
    this.scene.add(keyLight);

    // Fill Light: Cool atmospheric sky reflection
    const fillLight = new THREE.DirectionalLight(0xa5c4e8, 1.2);
    fillLight.position.set(-5, -2, -3);
    this.scene.add(fillLight);

    // Hemisphere Light: Rich gradient between space and ocean bounce
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.85);
    this.scene.add(hemiLight);

    // Earth Root Group
    this.earthGroup = new THREE.Group();
    this.earthGroup.rotation.x = this.currentRotX;
    this.earthGroup.rotation.y = this.currentRotY;
    this.scene.add(this.earthGroup);
  }

  private buildGlobe(): void {
    // 1. Low-Poly Ocean Sphere
    const oceanGeo = new THREE.IcosahedronGeometry(GLOBE_RADIUS, 2);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x194b72, // Vibrant toy ocean blue
      roughness: 0.32,
      metalness: 0.15,
      flatShading: true,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.earthGroup.add(this.oceanMesh);

    // 2. Low-Poly Countries (caps + extruded skirts)
    const { geometry, countryInfoList, triangleToCountryMap } = buildCountriesMesh(worldData);
    this.countryInfoList = countryInfoList;
    this.triangleToCountryMap = triangleToCountryMap;

    const countriesMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.48,
      metalness: 0.08,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.countriesMesh = new THREE.Mesh(geometry, countriesMat);
    this.earthGroup.add(this.countriesMesh);

    // 3. Hover Highlight Mesh
    const highlightGeo = new THREE.BufferGeometry();
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      depthTest: true,
      wireframe: false,
    });
    this.hoverHighlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
    this.hoverHighlightMesh.visible = false;
    this.earthGroup.add(this.hoverHighlightMesh);
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
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.lastPointerTime = performance.now();
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

    if (!this.isDragging || e.pointerId !== this.pointerId) {
      return;
    }

    const now = performance.now();
    const dt = Math.max(1, now - this.lastPointerTime);
    const deltaX = e.clientX - this.lastPointerX;
    const deltaY = e.clientY - this.lastPointerY;

    const rotSensitivity = 0.0055;
    this.targetRotY += deltaX * rotSensitivity;
    this.targetRotX += deltaY * rotSensitivity;

    // Clamp pitch so Earth doesn't flip completely upside down
    const pitchLimit = Math.PI * 0.44; // ~79 degrees
    this.targetRotX = Math.max(-pitchLimit, Math.min(pitchLimit, this.targetRotX));

    // Calculate instantaneous velocity for momentum
    this.velocityY = (deltaX / dt) * 0.06;
    this.velocityX = (deltaY / dt) * 0.06;

    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.lastPointerTime = now;
    this.lastInteractionTime = now;
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) {
      this.isDragging = false;
      this.pointerId = null;
      this.lastInteractionTime = performance.now();
      try {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.lastInteractionTime = performance.now();
    const zoomDelta = e.deltaY * 0.0035;
    this.targetCamDist = Math.max(this.minCamDist, Math.min(this.maxCamDist, this.targetCamDist + zoomDelta));
  };

  private onTouchStart = (e: TouchEvent): void => {
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

  private onDoubleClick = (): void => {
    this.targetRotX = 0.28;
    this.targetRotY = -1.2;
    this.targetCamDist = 4.8;
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
  };

  private updateHover(): void {
    if (!this.onCountryHover || this.isDragging) {
      return;
    }

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const intersects = this.raycaster.intersectObject(this.countriesMesh, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const faceIndex = hit.faceIndex;
      if (faceIndex !== undefined && faceIndex !== null && this.triangleToCountryMap) {
        const countryIdx = this.triangleToCountryMap[faceIndex];
        if (countryIdx !== undefined && countryIdx >= 0) {
          if (countryIdx !== this.lastHoveredCountryIndex) {
            this.lastHoveredCountryIndex = countryIdx;
            const countryInfo = this.countryInfoList[countryIdx];

            // Project 3D hit to screen coordinates for tooltip
            const screenPos = hit.point.clone().project(this.camera);
            const rect = this.renderer.domElement.getBoundingClientRect();
            const sx = ((screenPos.x + 1) / 2) * rect.width + rect.left;
            const sy = ((-screenPos.y + 1) / 2) * rect.height + rect.top;

            this.onCountryHover(countryInfo, { x: sx, y: sy });
          }
          return;
        }
      }
    }

    if (this.lastHoveredCountryIndex !== -1) {
      this.lastHoveredCountryIndex = -1;
      this.onCountryHover(null, null);
    }
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
        if (Math.abs(this.velocityX) > 0.0001 || Math.abs(this.velocityY) > 0.0001) {
          this.targetRotX += this.velocityX;
          this.targetRotY += this.velocityY;
          this.velocityX *= 0.94;
          this.velocityY *= 0.94;

          const pitchLimit = Math.PI * 0.44;
          this.targetRotX = Math.max(-pitchLimit, Math.min(pitchLimit, this.targetRotX));
        } else if (now - this.lastInteractionTime > 1200) {
          // Gentle idle rotation around Y
          this.targetRotY += this.autoSpinSpeed;
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


      // Hover inspection
      this.updateHover();

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
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }

    window.removeEventListener('resize', this.onResize);

    this.pmremGenerator?.dispose();
    this.renderer?.dispose();
  }
}
