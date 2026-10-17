import * as THREE from 'three';
import { CollisionResolver } from './controls/Collision.ts';
import { FirstPersonController } from './controls/FirstPersonController.ts';
import type { TerrainData, ViewpointPreset, WorldFeaturesData } from './types.ts';
import { CompassUI } from './ui/Compass.ts';
import { HudControlsUI } from './ui/HudControls.ts';
import { LabelsOverlayUI } from './ui/LabelsOverlay.ts';
import { MinimapUI } from './ui/Minimap.ts';
import { BuildingsSystem } from './world/Buildings.ts';
import { ArchitecturalMaterials } from './world/Materials.ts';
import { RoadsAndPathsSystem } from './world/RoadsAndPaths.ts';
import { SkyAndLightSystem } from './world/SkyAndLight.ts';
import { TerrainSystem } from './world/Terrain.ts';
import { VegetationSystem } from './world/Vegetation.ts';
import { WaterSystem } from './world/Water.ts';

declare global {
  interface Window {
    lowerWychApp?: {
      teleportToViewpointIndex: (index: number) => ViewpointPreset | null;
      setPose: (x: number, z: number, yawDeg: number, pitchDeg?: number) => void;
      setTimeOfDay: (hours: number) => void;
      getState: () => {
        x: number;
        y: number;
        z: number;
        yawDeg: number;
        pitchDeg: number;
        buildingCount: number;
        roadCount: number;
        treeCount: number;
      };
    };
  }
}

async function bootstrap() {
  const canvas = document.getElementById('scene-canvas') as HTMLCanvasElement;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.2,
    1600
  );

  // Load preprocessed terrain and feature datasets from /public/data/
  const [terrainRes, featuresRes] = await Promise.all([
    fetch('/data/terrain.json'),
    fetch('/data/features.json'),
  ]);

  if (!terrainRes.ok || !featuresRes.ok) {
    throw new Error('Failed to load /data/terrain.json or /data/features.json');
  }

  const terrainData = (await terrainRes.json()) as TerrainData;
  const featuresData = (await featuresRes.json()) as WorldFeaturesData;

  // 1. Sky, Sun, and Fog
  const skyAndLight = new SkyAndLightSystem(scene);

  // 2. Terrain Mesh (1m EA LIDAR DTM + Land-cover drape)
  const terrain = new TerrainSystem(terrainData, '/data/landcover.png');
  scene.add(terrain.mesh);
  await terrain.readyPromise;

  // 3. Shared Architectural PBR Materials
  const archMaterials = new ArchitecturalMaterials();

  // 4. Extruded Buildings, Roofs, Facades & Colliders
  const buildings = new BuildingsSystem(featuresData.buildings, terrain, archMaterials);
  scene.add(buildings.group);

  // 5. Draped Country Lanes, Bridges, Tracks, Footpaths & Telegraph Poles
  const roadsAndPaths = new RoadsAndPathsSystem(
    featuresData.roads,
    featuresData.barriers,
    terrain,
    archMaterials
  );
  scene.add(roadsAndPaths.group);

  // 6. Wych Brook, Shothill Brook & Pond Water Shaders
  const water = new WaterSystem(featuresData.water, terrain);
  scene.add(water.group);

  // 7. Instanced Hedgerows & Multi-species Woodland / Riparian Trees
  const vegetation = new VegetationSystem(
    featuresData.trees,
    featuresData.barriers,
    terrain
  );
  scene.add(vegetation.group);

  // 8. Collision & First-Person Controller
  const collision = new CollisionResolver(buildings.colliders, 292);
  const controller = new FirstPersonController(
    camera,
    canvas,
    terrain,
    collision,
    featuresData.roads
  );

  // 9. HUD Systems (Minimap, Compass, Place Labels, Controls)
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  const minimap = new MinimapUI(minimapCanvas, featuresData, (tx, tz) => {
    controller.setPose(tx, tz, THREE.MathUtils.radToDeg(controller.yawRad), 0);
  });

  const compass = new CompassUI(
    document.getElementById('compass-heading') as HTMLElement,
    document.getElementById('compass-coords') as HTMLElement,
    document.getElementById('compass-tape-track') as HTMLElement
  );

  const labelsOverlay = new LabelsOverlayUI(
    document.getElementById('labels-layer') as HTMLElement,
    featuresData.labels,
    terrain
  );

  const hudControls = new HudControlsUI(
    featuresData.viewpoints,
    (hours) => {
      skyAndLight.setTimeOfDay(hours, controller.position);
    },
    (enabled) => {
      labelsOverlay.setEnabled(enabled);
    },
    (vp) => {
      controller.teleportToViewpoint(vp);
      skyAndLight.updateShadowFollow(controller.position);
    }
  );

  // Start at Viewpoint 1 ("Entering Lower Wych" over the bridge towards the Dutch barn & Brookside House)
  // or allow URL query params ?vp=1..5, ?tod=5..21, ?labels=0|1, ?x=&z=&yaw=&pitch=
  const params = new URLSearchParams(window.location.search);
  const vpParam = parseInt(params.get('vp') || '1', 10);
  const initialVp =
    featuresData.viewpoints[Math.max(0, Math.min(featuresData.viewpoints.length - 1, vpParam - 1))];
  if (initialVp) {
    hudControls.selectViewpoint(initialVp, (vp) => {
      controller.teleportToViewpoint(vp);
      skyAndLight.updateShadowFollow(controller.position);
    });
  }
  if (params.has('x') && params.has('z')) {
    const cx = parseFloat(params.get('x')!);
    const cz = parseFloat(params.get('z')!);
    const cyaw = parseFloat(params.get('yaw') || '0');
    const cpitch = parseFloat(params.get('pitch') || '0');
    controller.setPose(cx, cz, cyaw, cpitch);
    skyAndLight.updateShadowFollow(controller.position);
  }
  if (params.has('tod')) {
    const tod = parseFloat(params.get('tod')!);
    const slider = document.getElementById('time-slider') as HTMLInputElement;
    if (slider && !Number.isNaN(tod)) {
      slider.value = String(tod);
      slider.dispatchEvent(new Event('input'));
    }
  }
  if (params.get('labels') === '0') {
    const toggle = document.getElementById('labels-toggle') as HTMLInputElement;
    if (toggle) {
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
    }
  }

  // Expose helper API on window for inspection and automated verification
  window.lowerWychApp = {
    teleportToViewpointIndex: (index: number) => {
      const vp = featuresData.viewpoints[index];
      if (!vp) return null;
      hudControls.selectViewpoint(vp, (target) => {
        controller.teleportToViewpoint(target);
        skyAndLight.updateShadowFollow(controller.position);
      });
      return vp;
    },
    setPose: (x: number, z: number, yawDeg: number, pitchDeg = 0) => {
      controller.setPose(x, z, yawDeg, pitchDeg);
      skyAndLight.updateShadowFollow(controller.position);
    },
    setTimeOfDay: (hours: number) => {
      const slider = document.getElementById('time-slider') as HTMLInputElement;
      if (slider) {
        slider.value = String(hours);
        slider.dispatchEvent(new Event('input'));
      }
    },
    getState: () => ({
      x: Number(controller.position.x.toFixed(2)),
      y: Number(controller.position.y.toFixed(2)),
      z: Number(controller.position.z.toFixed(2)),
      yawDeg: Math.round(THREE.MathUtils.radToDeg(controller.yawRad)),
      pitchDeg: Math.round(THREE.MathUtils.radToDeg(controller.pitchRad)),
      buildingCount: featuresData.buildings.length,
      roadCount: featuresData.roads.length,
      treeCount: featuresData.trees.length,
    }),
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Main 60fps animation loop (stops after 3 rendered frames if ?static=1 is passed for instant screenshot capture)
  const isStaticCapture = params.get('static') === '1';
  let renderedFrames = 0;
  let lastTime = performance.now();

  function animate(now: number) {
    if (!isStaticCapture || renderedFrames < 3) {
      requestAnimationFrame(animate);
    }

    const dt = (now - lastTime) * 0.001;
    lastTime = now;

    controller.update(dt);
    skyAndLight.updateShadowFollow(controller.position);
    water.update(now * 0.001, skyAndLight.sunDirection, skyAndLight.sunColor);

    renderer.render(scene, camera);

    minimap.update(controller.position.x, controller.position.z, controller.yawRad);
    compass.update(
      controller.yawRad,
      controller.position.x,
      controller.position.y,
      controller.position.z
    );
    labelsOverlay.update(camera, window.innerWidth, window.innerHeight);
    hudControls.recordFrame(now);
    renderedFrames++;
  }

  requestAnimationFrame(animate);
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap Lower Wych 3D app:', err);
});
