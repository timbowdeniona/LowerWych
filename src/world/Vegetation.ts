import * as THREE from 'three';
import type { LinearBarrierFeature, TreePoint } from '../types.ts';
import type { TerrainSystem } from './Terrain.ts';

export class VegetationSystem {
  public readonly group = new THREE.Group();

  constructor(
    trees: TreePoint[],
    barriers: LinearBarrierFeature[],
    terrain: TerrainSystem
  ) {
    this.group.name = 'LowerWychVegetation';

    this.buildInstancedHedgerows(barriers, terrain);
    this.buildInstancedTrees(trees, terrain);
  }

  private buildInstancedHedgerows(barriers: LinearBarrierFeature[], terrain: TerrainSystem) {
    const segments: { x: number; y: number; z: number; len: number; width: number; height: number; angle: number }[] = [];

    for (const bar of barriers) {
      if (bar.type !== 'hedge') continue;
      for (let i = 0; i < bar.points.length - 1; i++) {
        const [x1, z1] = bar.points[i];
        const [x2, z2] = bar.points[i + 1];
        if (Math.abs(x1) > 296 || Math.abs(z1) > 296) continue;
        const dist = Math.hypot(x2 - x1, z2 - z1);
        const steps = Math.max(1, Math.ceil(dist / 3.5));
        const subLen = dist / steps;
        const angle = -Math.atan2(z2 - z1, x2 - x1);

        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) / steps;
          const mx = x1 + (x2 - x1) * t;
          const mz = z1 + (z2 - z1) * t;
          const my = terrain.getHeightAt(mx, mz);
          segments.push({
            x: mx,
            y: my,
            z: mz,
            len: subLen + 0.35,
            width: bar.width,
            height: bar.height,
            angle,
          });
        }
      }
    }

    if (segments.length === 0) return;

    // Bevelled / organically rounded hedgerow box geometry
    const hedgeGeom = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const pos = hedgeGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      // Taper top of hawthorn hedge slightly
      if (vy > 0.1) {
        pos.setZ(i, vz * 0.78);
      }
      pos.setY(i, vy + 0.45);
    }
    hedgeGeom.computeVertexNormals();

    const hedgeMat = this.createFoliageMaterial('#345228', '#486b34');
    const instancedHedges = new THREE.InstancedMesh(hedgeGeom, hedgeMat, segments.length);
    instancedHedges.castShadow = true;
    instancedHedges.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let seed = 881;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    segments.forEach((seg, idx) => {
      dummy.position.set(seg.x, seg.y, seg.z);
      dummy.rotation.set(0, seg.angle, 0);
      dummy.scale.set(seg.len, seg.height * (0.9 + rand() * 0.22), seg.width * (0.92 + rand() * 0.18));
      dummy.updateMatrix();
      instancedHedges.setMatrixAt(idx, dummy.matrix);

      color.setHSL(0.27 + (rand() - 0.5) * 0.04, 0.42, 0.25 + (rand() - 0.5) * 0.06);
      instancedHedges.setColorAt(idx, color);
    });

    instancedHedges.instanceMatrix.needsUpdate = true;
    if (instancedHedges.instanceColor) instancedHedges.instanceColor.needsUpdate = true;
    this.group.add(instancedHedges);
  }

  private buildInstancedTrees(trees: TreePoint[], terrain: TerrainSystem) {
    if (trees.length === 0) return;

    const trunkGeom = new THREE.CylinderGeometry(0.18, 0.32, 3.6, 7);
    trunkGeom.translate(0, 1.8, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4b3c2e,
      roughness: 0.92,
    });

    // Organic multi-lobed broadleaf canopy geometry
    const canopyGeom = new THREE.IcosahedronGeometry(3.2, 2);
    const pos = canopyGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const lump = 1 + 0.16 * Math.sin(x * 1.7) * Math.cos(z * 1.7) + 0.1 * Math.sin(y * 2.3);
      pos.setXYZ(i, x * lump, y * 0.82 * lump + 5.2, z * lump);
    }
    canopyGeom.computeVertexNormals();

    const canopyMat = this.createFoliageMaterial('#385728', '#4f7338');

    const trunksMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, trees.length);
    const canopiesMesh = new THREE.InstancedMesh(canopyGeom, canopyMat, trees.length);
    trunksMesh.castShadow = true;
    trunksMesh.receiveShadow = true;
    canopiesMesh.castShadow = true;
    canopiesMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let seed = 337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    trees.forEach((t, idx) => {
      const y = terrain.getHeightAt(t.x, t.z);
      dummy.position.set(t.x, y - 0.15, t.z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(t.scale, t.scale * (0.9 + rand() * 0.25), t.scale);
      dummy.updateMatrix();

      trunksMesh.setMatrixAt(idx, dummy.matrix);
      canopiesMesh.setMatrixAt(idx, dummy.matrix);

      // Vary foliage tint by species (oak, ash, alder, willow, hawthorn)
      let hue = 0.27;
      let sat = 0.44;
      let light = 0.27;
      if (t.species === 'willow') {
        hue = 0.29;
        sat = 0.36;
        light = 0.33;
      } else if (t.species === 'alder') {
        hue = 0.28;
        sat = 0.46;
        light = 0.23;
      } else if (t.species === 'hawthorn') {
        hue = 0.25;
        sat = 0.42;
        light = 0.29;
      }
      color.setHSL(hue + (rand() - 0.5) * 0.03, sat, light + (rand() - 0.5) * 0.05);
      canopiesMesh.setColorAt(idx, color);
    });

    trunksMesh.instanceMatrix.needsUpdate = true;
    canopiesMesh.instanceMatrix.needsUpdate = true;
    if (canopiesMesh.instanceColor) canopiesMesh.instanceColor.needsUpdate = true;

    this.group.add(trunksMesh);
    this.group.add(canopiesMesh);
  }

  private createFoliageMaterial(darkHex: string, lightHex: string): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = darkHex;
    ctx.fillRect(0, 0, 128, 128);

    let seed = 612;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    ctx.fillStyle = lightHex;
    for (let i = 0; i < 600; i++) {
      ctx.fillRect(rand() * 128, rand() * 128, 4, 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);

    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex,
      bumpMap: tex,
      bumpScale: 0.08,
      roughness: 0.88,
      metalness: 0.0,
    });
  }
}
