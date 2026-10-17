import * as THREE from 'three';
import type { TerrainData } from '../types.ts';

export class TerrainSystem {
  public readonly mesh: THREE.Mesh;
  public readonly data: TerrainData;
  public readonly readyPromise: Promise<void>;
  private readonly halfWidth: number;
  private readonly halfDepth: number;

  constructor(data: TerrainData, landcoverUrl = '/data/landcover.png') {
    this.data = data;
    this.halfWidth = data.width / 2;
    this.halfDepth = data.depth / 2;

    const segX = data.gridCols - 1;
    const segZ = data.gridRows - 1;

    const geom = new THREE.PlaneGeometry(data.width, data.depth, segX, segZ);
    geom.rotateX(-Math.PI / 2);

    const pos = geom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const h = data.heights[i] ?? data.minElevation;
      pos.setY(i, h);
    }
    geom.computeVertexNormals();

    const textureLoader = new THREE.TextureLoader();
    let resolveTex!: () => void;
    this.readyPromise = new Promise<void>((r) => {
      resolveTex = r;
    });
    const landcoverTex = textureLoader.load(
      landcoverUrl,
      () => resolveTex(),
      undefined,
      () => resolveTex()
    );
    landcoverTex.colorSpace = THREE.SRGBColorSpace;
    landcoverTex.wrapS = THREE.ClampToEdgeWrapping;
    landcoverTex.wrapT = THREE.ClampToEdgeWrapping;
    landcoverTex.anisotropy = 8;

    const detailBump = this.createMicroDetailTexture();

    const mat = new THREE.MeshStandardMaterial({
      map: landcoverTex,
      bumpMap: detailBump,
      bumpScale: 0.18,
      roughness: 0.92,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'LowerWychTerrain';
  }

  /**
   * Bilinearly interpolate terrain elevation (metres AOD) at local scene coordinate (x, z)
   */
  public getHeightAt(x: number, z: number): number {
    const u = Math.max(0, Math.min(1, (x + this.halfWidth) / this.data.width));
    const v = Math.max(0, Math.min(1, (z + this.halfDepth) / this.data.depth));

    const fx = u * (this.data.gridCols - 1);
    const fz = v * (this.data.gridRows - 1);

    const c0 = Math.floor(fx);
    const r0 = Math.floor(fz);
    const c1 = Math.min(this.data.gridCols - 1, c0 + 1);
    const r1 = Math.min(this.data.gridRows - 1, r0 + 1);

    const tx = fx - c0;
    const tz = fz - r0;

    const cols = this.data.gridCols;
    const h00 = this.data.heights[r0 * cols + c0];
    const h10 = this.data.heights[r0 * cols + c1];
    const h01 = this.data.heights[r1 * cols + c0];
    const h11 = this.data.heights[r1 * cols + c1];

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  private createMicroDetailTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(size, size);
    let seed = 4219;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < imgData.data.length; i += 4) {
      const v = Math.floor(110 + rand() * 36);
      imgData.data[i] = v;
      imgData.data[i + 1] = v;
      imgData.data[i + 2] = v;
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(90, 90);
    return tex;
  }
}
