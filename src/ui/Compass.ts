import { CENTRE_BNG } from '../../scripts/config.ts';

export class CompassUI {
  private readonly headingEl: HTMLElement;
  private readonly coordsEl: HTMLElement;
  private readonly tapeTrackEl: HTMLElement;

  constructor(headingEl: HTMLElement, coordsEl: HTMLElement, tapeTrackEl: HTMLElement) {
    this.headingEl = headingEl;
    this.coordsEl = coordsEl;
    this.tapeTrackEl = tapeTrackEl;
  }

  public update(yawRad: number, x: number, y: number, z: number) {
    const deg = Math.round((((yawRad * 180) / Math.PI) % 360 + 360) % 360);
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(deg / 45) % 8];

    this.headingEl.textContent = `${cardinal} ${String(deg).padStart(3, '0')}°`;

    // Shift compass tape horizontally
    const offsetPx = -((deg / 360) * 360);
    this.tapeTrackEl.style.translate = `${offsetPx}px 0px`;

    const bngE = Math.round(CENTRE_BNG.easting + x);
    const bngN = Math.round(CENTRE_BNG.northing - z);
    const elev = (y - 1.7).toFixed(1);
    this.coordsEl.textContent = `SJ ${String(bngE).slice(1)} ${String(bngN).slice(1)} • ${elev}m AOD`;
  }
}
