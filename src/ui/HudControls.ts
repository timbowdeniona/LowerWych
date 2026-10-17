import type { ViewpointPreset } from '../types.ts';

export class HudControlsUI {
  private readonly timeSlider: HTMLInputElement;
  private readonly timeReadout: HTMLElement;
  private readonly labelsToggle: HTMLInputElement;
  private readonly fpsReadout: HTMLElement;
  private readonly viewpointBar: HTMLElement;
  private readonly activeViewpointBanner: HTMLElement;

  private frameCount = 0;
  private lastFpsTime = performance.now();

  constructor(
    viewpoints: ViewpointPreset[],
    onTimeChange: (hours: number) => void,
    onLabelsToggle: (enabled: boolean) => void,
    onSelectViewpoint: (vp: ViewpointPreset) => void
  ) {
    this.timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    this.timeReadout = document.getElementById('time-readout') as HTMLElement;
    this.labelsToggle = document.getElementById('labels-toggle') as HTMLInputElement;
    this.fpsReadout = document.getElementById('fps-readout') as HTMLElement;
    this.viewpointBar = document.getElementById('viewpoint-buttons') as HTMLElement;
    this.activeViewpointBanner = document.getElementById('active-viewpoint-info') as HTMLElement;

    // Initialize slider custom properties per modern-web-guidance `slider` guide
    const syncSlider = () => {
      const hours = parseFloat(this.timeSlider.value);
      this.timeSlider.style.setProperty('--attr-min', this.timeSlider.min || '5');
      this.timeSlider.style.setProperty('--attr-max', this.timeSlider.max || '21');
      this.timeSlider.style.setProperty('--control-value', this.timeSlider.value);
      const formatted = this.formatHours(hours);
      this.timeReadout.textContent = formatted;
      this.timeSlider.setAttribute('aria-valuetext', `${formatted} BST`);
      onTimeChange(hours);
    };

    this.timeSlider.addEventListener('input', syncSlider);
    syncSlider();

    // Place labels toggle checkbox
    this.labelsToggle.addEventListener('change', () => {
      onLabelsToggle(this.labelsToggle.checked);
    });

    // Keyboard shortcut 'L' for labels toggle and '1'-'5' for viewpoint teleport
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyL') {
        this.labelsToggle.checked = !this.labelsToggle.checked;
        onLabelsToggle(this.labelsToggle.checked);
      } else if (e.code.startsWith('Digit')) {
        const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
        if (idx >= 0 && idx < viewpoints.length) {
          this.selectViewpoint(viewpoints[idx], onSelectViewpoint);
        }
      }
    });

    // Build viewpoint teleport buttons
    viewpoints.forEach((vp, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vp-btn';
      btn.dataset.vpId = vp.id;
      btn.textContent = vp.name;
      btn.title = `${vp.description} (Shortcut: Key ${idx + 1})`;
      btn.addEventListener('click', () => {
        this.selectViewpoint(vp, onSelectViewpoint);
      });
      this.viewpointBar.appendChild(btn);
    });
  }

  public selectViewpoint(vp: ViewpointPreset, callback: (vp: ViewpointPreset) => void) {
    callback(vp);
    const buttons = this.viewpointBar.querySelectorAll('.vp-btn');
    buttons.forEach((b) => {
      b.classList.toggle('vp-btn--active', (b as HTMLElement).dataset.vpId === vp.id);
    });
    if (this.activeViewpointBanner) {
      this.activeViewpointBanner.innerHTML = `
        <strong>${vp.name}</strong> — ${vp.description}
        ${vp.referenceSource ? `<span class="vp-ref">Ref: ${vp.referenceSource}</span>` : ''}
      `;
    }
  }

  public recordFrame(now: number) {
    this.frameCount++;
    const elapsed = now - this.lastFpsTime;
    if (elapsed >= 500) {
      const fps = Math.round((this.frameCount * 1000) / elapsed);
      this.fpsReadout.textContent = `${fps} FPS`;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
  }

  private formatHours(h: number): string {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
}
