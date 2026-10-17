import * as THREE from 'three';
import type { PlaceLabel } from '../types.ts';
import type { TerrainSystem } from '../world/Terrain.ts';

interface LabelItem {
  data: PlaceLabel;
  worldPos: THREE.Vector3;
  el: HTMLElement;
}

export class LabelsOverlayUI {
  private readonly container: HTMLElement;
  private readonly items: LabelItem[] = [];
  private readonly tempVec = new THREE.Vector3();
  public enabled = true;

  constructor(container: HTMLElement, labels: PlaceLabel[], terrain: TerrainSystem) {
    this.container = container;

    for (const lbl of labels) {
      const baseElev = terrain.getHeightAt(lbl.x, lbl.z);
      const worldPos = new THREE.Vector3(
        lbl.x,
        baseElev + (lbl.elevationOffset ?? 5.0),
        lbl.z
      );

      const el = document.createElement('div');
      el.className = `place-label place-label--${lbl.category}`;
      el.innerHTML = `
        <span class="place-label__title">${lbl.name}</span>
        ${lbl.subtitle ? `<span class="place-label__sub">${lbl.subtitle}</span>` : ''}
      `;
      this.container.appendChild(el);
      this.items.push({ data: lbl, worldPos, el });
    }
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.container.style.display = enabled ? 'block' : 'none';
  }

  public update(camera: THREE.PerspectiveCamera, viewportW: number, viewportH: number) {
    if (!this.enabled) return;

    const candidates: { item: LabelItem; dist: number; sx: number; sy: number }[] = [];

    for (const item of this.items) {
      const dist = camera.position.distanceTo(item.worldPos);
      const maxDist = item.data.category === 'hamlet' ? 280 : 175;
      if (dist > maxDist) {
        item.el.style.opacity = '0';
        continue;
      }

      this.tempVec.copy(item.worldPos).project(camera);
      if (this.tempVec.z > 1.0) {
        item.el.style.opacity = '0';
        continue;
      }

      const sx = (this.tempVec.x * 0.5 + 0.5) * viewportW;
      const sy = (-this.tempVec.y * 0.5 + 0.5) * viewportH;

      if (sx < 90 || sx > viewportW - 90 || sy < 70 || sy > viewportH - 120) {
        item.el.style.opacity = '0';
        continue;
      }

      candidates.push({ item, dist, sx, sy });
    }

    // Sort closest first and prevent 2D overlap
    candidates.sort((a, b) => a.dist - b.dist);
    const placedBoxes: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const c of candidates) {
      const halfW = 88;
      const boxH = 38;
      let sy = c.sy;

      // Try nudging up slightly if overlapping a closer label
      let overlaps = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        overlaps = placedBoxes.some(
          (b) =>
            c.sx + halfW > b.x1 &&
            c.sx - halfW < b.x2 &&
            sy > b.y1 &&
            sy - boxH < b.y2
        );
        if (!overlaps) break;
        sy -= 42;
      }

      if (overlaps) {
        c.item.el.style.opacity = '0';
        continue;
      }

      placedBoxes.push({
        x1: c.sx - halfW,
        y1: sy - boxH,
        x2: c.sx + halfW,
        y2: sy,
      });

      const fade = THREE.MathUtils.clamp(1.0 - (c.dist - 95) / 90, 0.35, 1.0);
      const scale = THREE.MathUtils.clamp(1.02 - c.dist / 420, 0.8, 1.02);

      c.item.el.style.opacity = fade.toFixed(2);
      c.item.el.style.translate = `${c.sx.toFixed(1)}px ${sy.toFixed(1)}px`;
      c.item.el.style.scale = scale.toFixed(2);
    }
  }
}
