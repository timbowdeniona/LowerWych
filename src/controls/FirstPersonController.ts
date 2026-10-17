import * as THREE from 'three';
import type { RoadFeature, ViewpointPreset } from '../types.ts';
import type { TerrainSystem } from '../world/Terrain.ts';
import type { CollisionResolver } from './Collision.ts';

export class FirstPersonController {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly position = new THREE.Vector3(16, 60, 10);
  public yawRad = 0;   // 0 = North (-Z), PI/2 = East (+X), PI = South (+Z), 3PI/2 = West (-X)
  public pitchRad = 0; // Radians, positive = up
  public readonly eyeHeight = 1.7;

  private readonly keys = new Set<string>();
  private readonly terrain: TerrainSystem;
  private readonly collision: CollisionResolver;
  private readonly bridges: { cx: number; cz: number; radius: number; deckY: number }[] = [];

  private isPointerLocked = false;
  private isMouseDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Mobile virtual thumbstick state
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchSprinting = false;
  private lookTouchId: number | null = null;
  private lastLookTouchX = 0;
  private lastLookTouchY = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    terrain: TerrainSystem,
    collision: CollisionResolver,
    roads: RoadFeature[]
  ) {
    this.camera = camera;
    this.terrain = terrain;
    this.collision = collision;

    // Precompute bridge deck heights so walking over Lower Wych Bridge stays level with the bridge deck
    for (const r of roads) {
      if (r.bridge && r.points.length >= 2) {
        const p0 = r.points[0];
        const p1 = r.points[r.points.length - 1];
        const cx = (p0[0] + p1[0]) * 0.5;
        const cz = (p0[1] + p1[1]) * 0.5;
        const radius = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 0.55 + 2.0;
        const deckY = Math.max(terrain.getHeightAt(p0[0], p0[1]), terrain.getHeightAt(p1[0], p1[1])) + 0.12;
        this.bridges.push({ cx, cz, radius, deckY });
      }
    }

    this.bindEvents(domElement);
    this.syncCameraTransform();
  }

  public teleportToViewpoint(vp: ViewpointPreset) {
    const [rx, rz] = this.collision.resolve(vp.x, vp.z);
    this.position.x = rx;
    this.position.z = rz;
    this.position.y = this.getSurfaceHeight(rx, rz) + this.eyeHeight;
    this.yawRad = THREE.MathUtils.degToRad(vp.yawDeg);
    this.pitchRad = THREE.MathUtils.degToRad(vp.pitchDeg);
    this.syncCameraTransform();
  }

  public setPose(x: number, z: number, yawDeg: number, pitchDeg = 0) {
    const [rx, rz] = this.collision.resolve(x, z);
    this.position.x = rx;
    this.position.z = rz;
    this.position.y = this.getSurfaceHeight(rx, rz) + this.eyeHeight;
    this.yawRad = THREE.MathUtils.degToRad(yawDeg);
    this.pitchRad = THREE.MathUtils.degToRad(pitchDeg);
    this.syncCameraTransform();
  }

  public update(dt: number) {
    const clampedDt = Math.min(dt, 0.1);

    // Keyboard turn support (Q / E)
    if (this.keys.has('KeyQ')) this.yawRad -= 1.6 * clampedDt;
    if (this.keys.has('KeyE')) this.yawRad += 1.6 * clampedDt;

    let forwardInput = 0;
    let strafeInput = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forwardInput += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forwardInput -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafeInput += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafeInput -= 1;

    forwardInput += this.touchMoveY;
    strafeInput += this.touchMoveX;

    const inputLen = Math.hypot(forwardInput, strafeInput);
    if (inputLen > 1) {
      forwardInput /= inputLen;
      strafeInput /= inputLen;
    }

    const isSprinting =
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.touchSprinting;
    const speed = isSprinting ? 10.5 : 4.6;

    // Forward vector in world XZ: yaw=0 -> North (0, -1), yaw=90deg -> East (+1, 0)
    const fwdX = Math.sin(this.yawRad);
    const fwdZ = -Math.cos(this.yawRad);
    const rightX = Math.cos(this.yawRad);
    const rightZ = Math.sin(this.yawRad);

    const moveX = (fwdX * forwardInput + rightX * strafeInput) * speed * clampedDt;
    const moveZ = (fwdZ * forwardInput + rightZ * strafeInput) * speed * clampedDt;

    if (Math.abs(moveX) > 1e-5 || Math.abs(moveZ) > 1e-5) {
      const [nextX, nextZ] = this.collision.resolve(
        this.position.x + moveX,
        this.position.z + moveZ
      );
      this.position.x = nextX;
      this.position.z = nextZ;
    }

    const targetEyeY = this.getSurfaceHeight(this.position.x, this.position.z) + this.eyeHeight;
    this.position.y += (targetEyeY - this.position.y) * Math.min(1, clampedDt * 18);

    this.syncCameraTransform();
  }

  private getSurfaceHeight(x: number, z: number): number {
    let h = this.terrain.getHeightAt(x, z);
    for (const b of this.bridges) {
      if (Math.hypot(x - b.cx, z - b.cz) <= b.radius) {
        h = Math.max(h, b.deckY);
      }
    }
    return h;
  }

  private syncCameraTransform() {
    this.pitchRad = THREE.MathUtils.clamp(this.pitchRad, -Math.PI * 0.46, Math.PI * 0.46);
    this.yawRad = ((this.yawRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    this.camera.position.copy(this.position);

    const cosPitch = Math.cos(this.pitchRad);
    const lookX = this.position.x + Math.sin(this.yawRad) * cosPitch;
    const lookY = this.position.y + Math.sin(this.pitchRad);
    const lookZ = this.position.z - Math.cos(this.yawRad) * cosPitch;
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  private bindEvents(domElement: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });

    domElement.addEventListener('click', () => {
      if (window.matchMedia('(pointer: coarse)').matches) return;
      if (document.pointerLockElement !== domElement && domElement.requestPointerLock) {
        try {
          domElement.requestPointerLock();
        } catch {
          // Fallback to drag look if pointer lock is unavailable
        }
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === domElement;
      const badge = document.getElementById('pointer-lock-status');
      if (badge) {
        badge.textContent = this.isPointerLocked
          ? 'Mouse Look Active (ESC to release)'
          : 'Click scene or drag to look around';
      }
    });

    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this.isPointerLocked) {
        this.isMouseDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      const sensitivity = 0.0022;
      if (this.isPointerLocked) {
        this.yawRad += e.movementX * sensitivity;
        this.pitchRad -= e.movementY * sensitivity;
        this.syncCameraTransform();
      } else if (this.isMouseDragging) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.yawRad += dx * sensitivity * 1.2;
        this.pitchRad -= dy * sensitivity * 1.2;
        this.syncCameraTransform();
      }
    });

    // Bind mobile touch controls (virtual joystick & look pad)
    this.setupMobileTouchControls(domElement);
  }

  private setupMobileTouchControls(domElement: HTMLElement) {
    const joystickZone = document.getElementById('touch-joystick-zone');
    const joystickKnob = document.getElementById('touch-joystick-knob');

    if (joystickZone && joystickKnob) {
      let activeStickId: number | null = null;
      const maxRadius = 44;

      const updateStick = (clientX: number, clientY: number) => {
        const rect = joystickZone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        this.touchSprinting = dist > maxRadius * 0.85;
        if (dist > maxRadius) {
          dx = (dx / dist) * maxRadius;
          dy = (dy / dist) * maxRadius;
        }
        joystickKnob.style.translate = `${dx}px ${dy}px`;
        this.touchMoveX = dx / maxRadius;
        this.touchMoveY = -dy / maxRadius;
      };

      joystickZone.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          const t = e.changedTouches[0];
          activeStickId = t.identifier;
          updateStick(t.clientX, t.clientY);
        },
        { passive: false }
      );

      joystickZone.addEventListener(
        'touchmove',
        (e) => {
          e.preventDefault();
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === activeStickId) {
              updateStick(t.clientX, t.clientY);
            }
          }
        },
        { passive: false }
      );

      const resetStick = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeStickId) {
            activeStickId = null;
            this.touchMoveX = 0;
            this.touchMoveY = 0;
            this.touchSprinting = false;
            joystickKnob.style.translate = '0px 0px';
          }
        }
      };

      joystickZone.addEventListener('touchend', resetStick);
      joystickZone.addEventListener('touchcancel', resetStick);
    }

    // Touch look on canvas
    domElement.addEventListener(
      'touchstart',
      (e) => {
        if (this.lookTouchId !== null) return;
        const t = e.changedTouches[0];
        this.lookTouchId = t.identifier;
        this.lastLookTouchX = t.clientX;
        this.lastLookTouchY = t.clientY;
      },
      { passive: true }
    );

    domElement.addEventListener(
      'touchmove',
      (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.lookTouchId) {
            const dx = t.clientX - this.lastLookTouchX;
            const dy = t.clientY - this.lastLookTouchY;
            this.lastLookTouchX = t.clientX;
            this.lastLookTouchY = t.clientY;
            this.yawRad += dx * 0.0045;
            this.pitchRad -= dy * 0.0045;
            this.syncCameraTransform();
          }
        }
      },
      { passive: true }
    );

    const endLookTouch = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };
    domElement.addEventListener('touchend', endLookTouch);
    domElement.addEventListener('touchcancel', endLookTouch);
  }
}
