import * as THREE from 'three';

export class SkyAndLightSystem {
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly ambientLight: THREE.AmbientLight;
  public readonly skyMesh: THREE.Mesh;
  public readonly fog: THREE.FogExp2;
  public readonly sunDirection = new THREE.Vector3(0.4, 0.75, 0.45).normalize();
  public readonly sunColor = new THREE.Color(0xfff4e0);

  private readonly skyUniforms: {
    uZenithColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uSunDirection: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
  };

  constructor(scene: THREE.Scene) {
    this.fog = new THREE.FogExp2(0xcad9e4, 0.00145);
    scene.fog = this.fog;

    this.hemiLight = new THREE.HemisphereLight(0xcfe4ff, 0x52643b, 0.75);
    scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xd8e4f0, 0.32);
    scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3dc, 1.95);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 420;
    const shadowBound = 145;
    this.sunLight.shadow.camera.left = -shadowBound;
    this.sunLight.shadow.camera.right = shadowBound;
    this.sunLight.shadow.camera.top = shadowBound;
    this.sunLight.shadow.camera.bottom = -shadowBound;
    this.sunLight.shadow.bias = -0.0005;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.skyUniforms = {
      uZenithColor: { value: new THREE.Color(0x4a7dc4) },
      uHorizonColor: { value: new THREE.Color(0xd2e1ec) },
      uSunDirection: { value: this.sunDirection.clone() },
      uSunColor: { value: new THREE.Color(0xfff5dc) },
    };

    const skyGeom = new THREE.SphereGeometry(1200, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldDir;
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 sky = mix(uHorizonColor, uZenithColor, pow(h, 0.58));

          float sunAmt = max(dot(dir, normalize(uSunDirection)), 0.0);
          // Soft atmospheric Mie glow + solar disc
          sky += uSunColor * pow(sunAmt, 12.0) * 0.28;
          sky += uSunColor * smoothstep(0.9982, 0.9996, sunAmt) * 1.4;

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyMesh = new THREE.Mesh(skyGeom, skyMat);
    this.skyMesh.name = 'LowerWychSkyDome';
    scene.add(this.skyMesh);

    this.setTimeOfDay(14.5); // Default 14:30 afternoon light over Lower Wych
  }

  /**
   * Update sun position, shadow frustum center, sky colors, and soft fog based on time of day (0.0 - 24.0 hours)
   */
  public setTimeOfDay(hours: number, playerPos?: THREE.Vector3) {
    // Solar arc at latitude ~53°N (Lower Wych)
    const dayProgress = (hours - 6.0) / 14.0; // Sunrise ~06:00, Sunset ~20:00
    const elevationAngle = Math.sin(dayProgress * Math.PI) * 1.02; // max ~58 deg
    const azimuthAngle = (dayProgress - 0.5) * Math.PI * 1.15; // East (+X) through South (+Z) to West (-X)

    const sy = Math.max(-0.18, elevationAngle);
    const horiz = Math.sqrt(Math.max(0.01, 1 - sy * sy));
    const sx = -Math.sin(azimuthAngle) * horiz;
    const sz = Math.cos(azimuthAngle) * horiz;

    this.sunDirection.set(sx, sy, sz).normalize();
    this.skyUniforms.uSunDirection.value.copy(this.sunDirection);

    const daylight = THREE.MathUtils.clamp((sy + 0.08) / 0.65, 0, 1);
    const goldenHour = THREE.MathUtils.clamp(1.0 - Math.abs(sy - 0.14) / 0.22, 0, 1);

    // Interpolate sky zenith, horizon, sun, and fog colors
    const nightZenith = new THREE.Color(0x0d1626);
    const dayZenith = new THREE.Color(0x4679bf);
    const duskZenith = new THREE.Color(0x3a4e7a);

    const nightHorizon = new THREE.Color(0x1b2638);
    const dayHorizon = new THREE.Color(0xcfdce6);
    const duskHorizon = new THREE.Color(0xe6a67e);

    const zenith = nightZenith.clone().lerp(dayZenith, daylight).lerp(duskZenith, goldenHour * 0.55);
    const horizon = nightHorizon.clone().lerp(dayHorizon, daylight).lerp(duskHorizon, goldenHour * 0.7);

    this.skyUniforms.uZenithColor.value.copy(zenith);
    this.skyUniforms.uHorizonColor.value.copy(horizon);

    this.sunColor.setHex(0xfff5e4).lerp(new THREE.Color(0xff9e5e), goldenHour * 0.8);
    this.skyUniforms.uSunColor.value.copy(this.sunColor);

    this.sunLight.color.copy(this.sunColor);
    this.sunLight.intensity = 0.15 + daylight * 1.85;
    this.hemiLight.intensity = 0.22 + daylight * 0.6;
    this.hemiLight.color.copy(horizon).lerp(new THREE.Color(0xffffff), 0.35);

    this.fog.color.copy(horizon);

    this.updateShadowFollow(playerPos);
  }

  public updateShadowFollow(playerPos?: THREE.Vector3) {
    const cx = playerPos ? playerPos.x : 0;
    const cy = playerPos ? playerPos.y : 55;
    const cz = playerPos ? playerPos.z : 0;

    this.sunLight.target.position.set(cx, cy, cz);
    this.sunLight.position.set(
      cx + this.sunDirection.x * 180,
      cy + Math.max(25, this.sunDirection.y * 180),
      cz + this.sunDirection.z * 180
    );
    if (playerPos) {
      this.skyMesh.position.set(cx, 0, cz);
    }
  }
}
