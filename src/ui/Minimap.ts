import type { WorldFeaturesData } from '../types.ts';

export class MinimapUI {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly staticLayer: HTMLCanvasElement;
  private readonly data: WorldFeaturesData;
  private readonly size = 196;

  constructor(
    canvas: HTMLCanvasElement,
    data: WorldFeaturesData,
    onTeleport?: (x: number, z: number) => void
  ) {
    this.canvas = canvas;
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = canvas.getContext('2d')!;
    this.data = data;

    this.staticLayer = document.createElement('canvas');
    this.staticLayer.width = this.size;
    this.staticLayer.height = this.size;
    this.bakeStaticMap();

    if (onTeleport) {
      this.canvas.addEventListener('click', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const u = (e.clientX - rect.left) / rect.width;
        const v = (e.clientY - rect.top) / rect.height;
        const worldX = (u - 0.5) * 600;
        const worldZ = (v - 0.5) * 600;
        onTeleport(worldX, worldZ);
      });
    }
  }

  private worldToMap(x: number, z: number): [number, number] {
    const mx = ((x + 300) / 600) * this.size;
    const mz = ((z + 300) / 600) * this.size;
    return [mx, mz];
  }

  private bakeStaticMap() {
    const ctx = this.staticLayer.getContext('2d')!;
    ctx.fillStyle = '#243322';
    ctx.fillRect(0, 0, this.size, this.size);

    // Subtle 100m OS grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let m = -200; m <= 200; m += 100) {
      const [gx, gz] = this.worldToMap(m, m);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, this.size);
      ctx.moveTo(0, gz);
      ctx.lineTo(this.size, gz);
      ctx.stroke();
    }

    // Woodland polygons
    ctx.fillStyle = '#192818';
    for (const lu of this.data.landuse) {
      if (lu.polygon.length < 3) continue;
      ctx.beginPath();
      lu.polygon.forEach(([x, z], idx) => {
        const [mx, mz] = this.worldToMap(x, z);
        if (idx === 0) ctx.moveTo(mx, mz);
        else ctx.lineTo(mx, mz);
      });
      ctx.closePath();
      ctx.fill();
    }

    // Streams & Ponds (Wych Brook, Shothill Brook)
    for (const w of this.data.water) {
      if (w.isPolygon) {
        ctx.fillStyle = '#3b82a6';
        ctx.beginPath();
        w.points.forEach(([x, z], idx) => {
          const [mx, mz] = this.worldToMap(x, z);
          if (idx === 0) ctx.moveTo(mx, mz);
          else ctx.lineTo(mx, mz);
        });
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = w.name === 'Wych Brook' ? '#4aa3cf' : '#357ca0';
        ctx.lineWidth = w.name === 'Wych Brook' ? 2.4 : 1.4;
        ctx.beginPath();
        w.points.forEach(([x, z], idx) => {
          const [mx, mz] = this.worldToMap(x, z);
          if (idx === 0) ctx.moveTo(mx, mz);
          else ctx.lineTo(mx, mz);
        });
        ctx.stroke();
      }
    }

    // Roads, lanes, and footpaths
    for (const r of this.data.roads) {
      ctx.beginPath();
      if (r.category === 'footpath' || r.category === 'bridleway') {
        ctx.strokeStyle = '#c89d66';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
      } else if (r.category === 'driveway' || r.category === 'track') {
        ctx.strokeStyle = '#9e9789';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = r.bridge ? '#f5d28b' : '#d6d3cb';
        ctx.lineWidth = r.category === 'primary_lane' ? 2.6 : 2.1;
        ctx.setLineDash([]);
      }
      r.points.forEach(([x, z], idx) => {
        const [mx, mz] = this.worldToMap(x, z);
        if (idx === 0) ctx.moveTo(mx, mz);
        else ctx.lineTo(mx, mz);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Buildings
    ctx.fillStyle = '#e07a5f';
    ctx.strokeStyle = '#201815';
    ctx.lineWidth = 0.8;
    for (const b of this.data.buildings) {
      ctx.beginPath();
      b.footprint.forEach(([x, z], idx) => {
        const [mx, mz] = this.worldToMap(x, z);
        if (idx === 0) ctx.moveTo(mx, mz);
        else ctx.lineTo(mx, mz);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // SY14 7JX Postcode Centre crosshair at (0, 0)
    const [cx, cz] = this.worldToMap(0, 0);
    ctx.strokeStyle = 'rgba(255, 225, 130, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cz, 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  public update(playerX: number, playerZ: number, yawRad: number) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.drawImage(this.staticLayer, 0, 0);

    const [px, pz] = this.worldToMap(playerX, playerZ);

    // Draw FOV cone (yawRad: 0 = North (-Y on canvas), PI/2 = East (+X on canvas))
    const canvasAngle = yawRad - Math.PI / 2;
    const fovHalf = 0.52;
    const coneLen = 28;

    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(canvasAngle);

    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, coneLen);
    grad.addColorStop(0, 'rgba(255, 214, 102, 0.52)');
    grad.addColorStop(1, 'rgba(255, 214, 102, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, coneLen, -fovHalf, fovHalf);
    ctx.closePath();
    ctx.fill();

    // Player arrow/dot
    ctx.fillStyle = '#ffd166';
    ctx.strokeStyle = '#111820';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
