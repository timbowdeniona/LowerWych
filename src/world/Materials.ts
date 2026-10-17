import * as THREE from 'three';
import type { BuildingMaterialType, RoofMaterialType } from '../types.ts';

export class ArchitecturalMaterials {
  public readonly wallMaterials: Record<BuildingMaterialType, THREE.MeshStandardMaterial>;
  public readonly roofMaterials: Record<RoofMaterialType, THREE.MeshStandardMaterial>;
  public readonly windowMaterial: THREE.MeshStandardMaterial;
  public readonly windowFrameMaterial: THREE.MeshStandardMaterial;
  public readonly doorMaterial: THREE.MeshStandardMaterial;
  public readonly chimneyMaterial: THREE.MeshStandardMaterial;
  public readonly bridgeStoneMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.wallMaterials = {
      brick: this.createBrickMaterial(),
      render: this.createRenderMaterial(),
      stone: this.createSandstoneMaterial(),
      timber: this.createTimberMaterial(),
      farm_clad: this.createCorrugatedCladMaterial(),
    };

    this.roofMaterials = {
      slate: this.createSlateRoofMaterial(),
      clay_tile: this.createClayTileRoofMaterial(),
      metal: this.createCorrugatedRoofMaterial(),
      thatch: this.createThatchRoofMaterial(),
    };

    this.windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x263849,
      roughness: 0.15,
      metalness: 0.65,
    });

    this.windowFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2efe9,
      roughness: 0.6,
      metalness: 0.05,
    });

    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b2a22,
      roughness: 0.75,
      metalness: 0.05,
    });

    this.chimneyMaterial = this.wallMaterials.brick;
    this.bridgeStoneMaterial = this.createSandstoneMaterial(true);
  }

  private createBrickMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Lime mortar background
    ctx.fillStyle = '#c8bfb0';
    ctx.fillRect(0, 0, 256, 256);

    const rows = 16;
    const cols = 8;
    const bh = 256 / rows;
    const bw = 256 / cols;

    let seed = 101;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * bw + offset;
        const y = r * bh;
        // Cheshire red-orange brick tones calibrated from Geograph #4421074
        const cr = Math.floor(152 + (rand() - 0.5) * 34);
        const cg = Math.floor(72 + (rand() - 0.5) * 20);
        const cb = Math.floor(54 + (rand() - 0.5) * 16);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);

    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.04,
      roughness: 0.86,
      metalness: 0.02,
    });
  }

  private createRenderMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ece6d8';
    ctx.fillRect(0, 0, 256, 256);

    let seed = 202;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let i = 0; i < 1800; i++) {
      const v = Math.floor(224 + rand() * 22);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
      ctx.fillRect(rand() * 256, rand() * 256, 3, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.02,
      roughness: 0.88,
      metalness: 0.0,
    });
  }

  private createSandstoneMaterial(isBridge = false): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    // Weathered Cheshire/Welsh border buff-red sandstone ashlar (calibrated to Lower Wych Bridge 01)
    ctx.fillStyle = '#8b8374';
    ctx.fillRect(0, 0, 256, 256);

    const rows = 8;
    const cols = 4;
    const bh = 256 / rows;
    const bw = 256 / cols;

    let seed = isBridge ? 909 : 303;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * bw + offset;
        const y = r * bh;
        const cr = Math.floor(156 + (rand() - 0.5) * 28);
        const cg = Math.floor(142 + (rand() - 0.5) * 24);
        const cb = Math.floor(120 + (rand() - 0.5) * 22);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);

        // Lichen / moss weathering patches (seen on Lower Wych Bridge parapets)
        if (rand() > 0.45) {
          ctx.fillStyle = rand() > 0.5 ? 'rgba(118, 132, 92, 0.35)' : 'rgba(210, 208, 195, 0.28)';
          ctx.fillRect(x + 6 + rand() * 20, y + 4 + rand() * 12, 14, 10);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.06,
      roughness: 0.9,
      metalness: 0.02,
    });
  }

  private createTimberMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x5c4636,
      roughness: 0.85,
      metalness: 0.02,
    });
  }

  private createCorrugatedCladMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    for (let x = 0; x < 256; x += 8) {
      ctx.fillStyle = x % 16 === 0 ? '#2a322e' : '#38413d';
      ctx.fillRect(x, 0, 8, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.05,
      roughness: 0.65,
      metalness: 0.25,
    });
  }

  private createSlateRoofMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3d434c';
    ctx.fillRect(0, 0, 256, 256);

    const rows = 16;
    const cols = 8;
    const sh = 256 / rows;
    const sw = 256 / cols;

    let seed = 505;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (sw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const base = Math.floor(66 + (rand() - 0.5) * 18);
        ctx.fillStyle = `rgb(${base},${base + 4},${base + 11})`;
        ctx.fillRect(c * sw + offset + 1, r * sh + 1, sw - 2, sh - 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);

    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.04,
      roughness: 0.72,
      metalness: 0.08,
    });
  }

  private createClayTileRoofMaterial(): THREE.MeshStandardMaterial {
    const mat = this.createSlateRoofMaterial().clone();
    mat.color.setHex(0xb86b52);
    return mat;
  }

  private createCorrugatedRoofMaterial(): THREE.MeshStandardMaterial {
    const mat = this.createCorrugatedCladMaterial().clone();
    mat.color.setHex(0x4d5452);
    return mat;
  }

  private createThatchRoofMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x9c875e,
      roughness: 0.95,
      metalness: 0.0,
    });
  }
}
