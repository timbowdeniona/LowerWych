import * as THREE from 'three';
import type { WaterFeature } from '../types.ts';
import type { TerrainSystem } from './Terrain.ts';

export class WaterSystem {
  public readonly group = new THREE.Group();
  private readonly shaderMaterial: THREE.ShaderMaterial;

  constructor(waterFeatures: WaterFeature[], terrain: TerrainSystem) {
    this.group.name = 'LowerWychWater';

    this.shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(0xfff4dd) },
        uDeepColor: { value: new THREE.Color(0x1f3d3a) },
        uShallowColor: { value: new THREE.Color(0x3a6458) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;

        void main() {
          vUv = uv;
          vec3 pos = position;
          float wave = sin(pos.x * 1.4 + uTime * 2.2) * 0.025 + cos(pos.z * 1.7 - uTime * 1.8) * 0.02;
          pos.y += wave;
          vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPosition.xyz;
          vNormal = normalize(vec3(
            -cos(pos.x * 1.4 + uTime * 2.2) * 0.06,
            1.0,
            sin(pos.z * 1.7 - uTime * 1.8) * 0.06
          ));
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;

        void main() {
          float edgeDist = min(vUv.x, 1.0 - vUv.x) * 2.0;
          float ripple = sin(vWorldPos.x * 3.1 - uTime * 3.0 + sin(vWorldPos.z * 2.4)) * 0.5 + 0.5;
          vec3 baseCol = mix(uShallowColor, uDeepColor, clamp(edgeDist, 0.0, 1.0));

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfVec = normalize(uSunDirection + viewDir);
          float spec = pow(max(dot(vNormal, halfVec), 0.0), 48.0);
          float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);

          vec3 col = baseCol + ripple * 0.05 + uSunColor * spec * 0.55 + vec3(0.55, 0.68, 0.78) * fresnel * 0.35;
          float alpha = smoothstep(0.0, 0.12, edgeDist) * 0.88 + 0.08;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (const wf of waterFeatures) {
      if (wf.isPolygon) {
        const pondMesh = this.createPondMesh(wf, terrain);
        if (pondMesh) this.group.add(pondMesh);
      } else {
        const streamMesh = this.createStreamRibbon(wf, terrain);
        if (streamMesh) this.group.add(streamMesh);
      }
    }
  }

  public update(elapsedSeconds: number, sunDirection: THREE.Vector3, sunColor: THREE.Color) {
    this.shaderMaterial.uniforms.uTime.value = elapsedSeconds;
    this.shaderMaterial.uniforms.uSunDirection.value.copy(sunDirection);
    this.shaderMaterial.uniforms.uSunColor.value.copy(sunColor);
  }

  private createStreamRibbon(wf: WaterFeature, terrain: TerrainSystem): THREE.Mesh | null {
    const clipped = wf.points.filter(([x, z]) => Math.abs(x) <= 305 && Math.abs(z) <= 305);
    if (clipped.length < 2) return null;

    // Subdivide stream polyline every 2.0m
    const pts: [number, number][] = [];
    for (let i = 0; i < clipped.length - 1; i++) {
      const [x1, z1] = clipped[i];
      const [x2, z2] = clipped[i + 1];
      const d = Math.hypot(x2 - x1, z2 - z1);
      const steps = Math.max(1, Math.ceil(d / 2.0));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        pts.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]);
      }
    }
    pts.push(clipped[clipped.length - 1]);

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const halfW = wf.width * 0.5;
    let dist = 0;

    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (i > 0) dist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);

      let tx = 0,
        tz = 0;
      if (i < pts.length - 1) {
        tx += pts[i + 1][0] - x;
        tz += pts[i + 1][1] - z;
      }
      if (i > 0) {
        tx += x - pts[i - 1][0];
        tz += z - pts[i - 1][1];
      }
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;

      const lx = x + nx * halfW;
      const lz = z + nz * halfW;
      const rx = x - nx * halfW;
      const rz = z - nz * halfW;

      const waterY = terrain.getHeightAt(x, z) + 0.32;
      positions.push(lx, waterY, lz, rx, waterY, rz);
      uvs.push(0, dist / wf.width, 1, dist / wf.width);

      if (i < pts.length - 1) {
        const b = i * 2;
        indices.push(b, b + 2, b + 1);
        indices.push(b + 1, b + 2, b + 3);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return new THREE.Mesh(geom, this.shaderMaterial);
  }

  private createPondMesh(wf: WaterFeature, terrain: TerrainSystem): THREE.Mesh | null {
    if (wf.points.length < 3) return null;
    const cx = wf.points.reduce((s, p) => s + p[0], 0) / wf.points.length;
    const cz = wf.points.reduce((s, p) => s + p[1], 0) / wf.points.length;
    const waterY = terrain.getHeightAt(cx, cz) + 0.14;

    const shape = new THREE.Shape();
    wf.points.forEach(([x, z], idx) => {
      if (idx === 0) shape.moveTo(x - cx, z - cz);
      else shape.lineTo(x - cx, z - cz);
    });
    shape.closePath();

    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geom, this.shaderMaterial);
    mesh.position.set(cx, waterY, cz);
    return mesh;
  }
}
