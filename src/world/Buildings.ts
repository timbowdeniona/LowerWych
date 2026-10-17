import * as THREE from 'three';
import type { BuildingFeature } from '../types.ts';
import type { ArchitecturalMaterials } from './Materials.ts';
import type { TerrainSystem } from './Terrain.ts';

export interface BuildingCollider {
  id: string;
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  cos: number;
  sin: number;
  radius: number;
}

export class BuildingsSystem {
  public readonly group = new THREE.Group();
  public readonly colliders: BuildingCollider[] = [];

  constructor(
    buildings: BuildingFeature[],
    terrain: TerrainSystem,
    materials: ArchitecturalMaterials
  ) {
    this.group.name = 'LowerWychBuildings';

    for (const b of buildings) {
      this.buildSingleBuilding(b, terrain, materials);
    }
  }

  private buildSingleBuilding(
    b: BuildingFeature,
    terrain: TerrainSystem,
    materials: ArchitecturalMaterials
  ) {
    const fp = b.footprint;
    if (fp.length < 4) return;

    // Compute local axes from rectangle footprint
    const p0 = fp[0];
    const p1 = fp[1];
    const p3 = fp[3];
    const dxW = p1[0] - p0[0];
    const dzW = p1[1] - p0[1];
    const width = Math.hypot(dxW, dzW);
    const depth = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
    const angle = Math.atan2(dzW, dxW);

    const [cx, cz] = b.center;

    // Sample terrain height across footprint corners and center
    const sampleElevs = [
      terrain.getHeightAt(cx, cz),
      ...fp.map(([x, z]) => terrain.getHeightAt(x, z)),
    ];
    const minElev = Math.min(...sampleElevs);
    const maxElev = Math.max(...sampleElevs);
    // Anchor base slightly above mean terrain, with a foundation skirt extending below minElev
    const groundY = (minElev + maxElev) * 0.5;
    const skirtDrop = Math.max(1.2, maxElev - minElev + 0.8);

    const bldgGroup = new THREE.Group();
    bldgGroup.position.set(cx, groundY, cz);
    bldgGroup.rotation.y = -angle;
    bldgGroup.name = b.id;

    // Register oriented bounding box collider
    this.colliders.push({
      id: b.id,
      cx,
      cz,
      halfW: width * 0.5 + 0.45,
      halfD: depth * 0.5 + 0.45,
      cos: Math.cos(-angle),
      sin: Math.sin(-angle),
      radius: Math.hypot(width * 0.5, depth * 0.5) + 0.6,
    });

    // Special case for the iconic curved-roof open-sided Bridge Farm Dutch Barn (Geograph #4421074)
    if (b.id === 'bldg-bridge-dutch-barn') {
      this.buildDutchBarn(bldgGroup, width, depth, b.eavesHeight, b.ridgeHeight, skirtDrop, materials);
      this.group.add(bldgGroup);
      return;
    }

    // Special case for Howberry Bungalow (Lower Wych Road, SY14 7JX):
    // L-shaped cream-rendered bungalow with Georgian-bar windows, 4-leaf French patio doors,
    // Velux kitchen skylights, attached double garage, tarmac courtyard, and red-brick/trellis wall
    if (b.id === 'bldg-howberry-bungalow') {
      this.buildHowberryBungalow(
        bldgGroup,
        cx,
        cz,
        groundY,
        angle,
        width,
        depth,
        b.eavesHeight,
        b.ridgeHeight,
        skirtDrop,
        terrain,
        materials
      );
      this.group.add(bldgGroup);
      return;
    }

    let wallMat = materials.wallMaterials[b.wallMaterial] || materials.wallMaterials.brick;
    if (b.WallColorHex) {
      wallMat = wallMat.clone();
      wallMat.color = new THREE.Color(b.WallColorHex);
    }
    const roofMat = materials.roofMaterials[b.roofMaterial] || materials.roofMaterials.slate;

    // Main rectangular wall body (including foundation skirt below groundY so it never floats on slopes)
    const totalWallH = b.eavesHeight + skirtDrop;
    const wallGeom = new THREE.BoxGeometry(width, totalWallH, depth);
    const wallMesh = new THREE.Mesh(wallGeom, wallMat);
    wallMesh.position.y = b.eavesHeight * 0.5 - skirtDrop * 0.5;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    bldgGroup.add(wallMesh);

    // Stone/dark plinth course near ground level
    const plinthGeom = new THREE.BoxGeometry(width + 0.08, 0.55, depth + 0.08);
    const plinthMesh = new THREE.Mesh(plinthGeom, materials.wallMaterials.stone);
    plinthMesh.position.y = 0.2;
    bldgGroup.add(plinthMesh);

    // Build Pitched Gabled Roof + Gable End Triangles
    const roofRise = Math.max(1.2, b.ridgeHeight - b.eavesHeight);
    const overhangW = 0.35;
    const overhangD = 0.38;
    const halfSpan = depth * 0.5 + overhangD;
    const slopeLen = Math.hypot(halfSpan, roofRise);
    const slopeAngle = Math.atan2(roofRise, halfSpan);

    // Two pitched roof planes
    const roofPlaneGeom = new THREE.BoxGeometry(width + overhangW * 2, 0.16, slopeLen);
    const frontRoof = new THREE.Mesh(roofPlaneGeom, roofMat);
    frontRoof.position.set(0, b.eavesHeight + roofRise * 0.5, halfSpan * 0.5);
    frontRoof.rotation.x = slopeAngle;
    frontRoof.castShadow = true;
    frontRoof.receiveShadow = true;
    bldgGroup.add(frontRoof);

    const backRoof = new THREE.Mesh(roofPlaneGeom, roofMat);
    backRoof.position.set(0, b.eavesHeight + roofRise * 0.5, -halfSpan * 0.5);
    backRoof.rotation.x = -slopeAngle;
    backRoof.castShadow = true;
    backRoof.receiveShadow = true;
    bldgGroup.add(backRoof);

    // Terracotta ridge cresting on Valley Chapel & houses
    if (b.type === 'chapel' || b.type === 'house') {
      const ridgeGeom = new THREE.BoxGeometry(width + overhangW * 2, 0.22, 0.24);
      const ridgeMat = materials.roofMaterials.clay_tile;
      const ridgeMesh = new THREE.Mesh(ridgeGeom, ridgeMat);
      ridgeMesh.position.set(0, b.eavesHeight + roofRise + 0.06, 0);
      bldgGroup.add(ridgeMesh);
    }

    // Gable end triangles at -width/2 and +width/2
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-depth * 0.5, 0);
    gableShape.lineTo(depth * 0.5, 0);
    gableShape.lineTo(0, roofRise);
    gableShape.closePath();

    const gableGeom = new THREE.ExtrudeGeometry(gableShape, {
      depth: width,
      bevelEnabled: false,
    });
    // Normalize ExtrudeGeometry UVs to match BoxGeometry [0..1] scale
    const uvAttr = gableGeom.attributes.uv;
    if (uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) / Math.max(1, depth), uvAttr.getY(i) / Math.max(1, b.eavesHeight));
      }
      uvAttr.needsUpdate = true;
    }
    // Rotate so extrusion runs along X from -width/2 to +width/2
    gableGeom.rotateY(Math.PI / 2);
    gableGeom.translate(-width * 0.5, b.eavesHeight, 0);
    const gableMesh = new THREE.Mesh(gableGeom, wallMat);
    gableMesh.castShadow = true;
    gableMesh.receiveShadow = true;
    bldgGroup.add(gableMesh);

    // Chimney stacks on houses & chapel
    if (b.type === 'house' || b.type === 'chapel') {
      const chimneyGeom = new THREE.BoxGeometry(0.85, roofRise + 1.15, 0.85);
      const leftChimney = new THREE.Mesh(chimneyGeom, materials.chimneyMaterial);
      leftChimney.position.set(-width * 0.36, b.eavesHeight + (roofRise + 1.15) * 0.5, 0);
      leftChimney.castShadow = true;
      bldgGroup.add(leftChimney);

      if (width > 11.5 && b.type === 'house') {
        const rightChimney = leftChimney.clone();
        rightChimney.position.x = width * 0.36;
        bldgGroup.add(rightChimney);
      }
    }

    // Windows and doors on front & back facades for houses and chapel
    if (b.type === 'house' || b.type === 'chapel') {
      const bays = b.type === 'chapel' ? 3 : Math.max(2, Math.min(4, Math.floor(width / 3.4)));
      const spacing = width / (bays + 1);
      const stories = b.levels >= 2 && b.type !== 'chapel' ? 2 : 1;

      for (const side of [-1, 1]) {
        const zFace = side * (depth * 0.5 + 0.03);
        for (let s = 0; s < stories; s++) {
          const wy = b.type === 'chapel' ? 2.15 : s === 0 ? 1.55 : 3.95;
          for (let bay = 1; bay <= bays; bay++) {
            const wx = -width * 0.5 + bay * spacing;

            // Center bay on ground floor is a timber front door (for houses)
            if (b.type === 'house' && s === 0 && bay === Math.ceil(bays / 2) && side === 1) {
              const doorGeom = new THREE.BoxGeometry(1.05, 2.05, 0.08);
              const doorMesh = new THREE.Mesh(doorGeom, materials.doorMaterial);
              doorMesh.position.set(wx, 1.05, zFace);
              bldgGroup.add(doorMesh);
              continue;
            }

            const winH = b.type === 'chapel' ? 2.1 : 1.22;
            const winW = b.type === 'chapel' ? 1.08 : 1.15;

            const frameGeom = new THREE.BoxGeometry(winW + 0.16, winH + 0.14, 0.06);
            const frameMesh = new THREE.Mesh(frameGeom, materials.windowFrameMaterial);
            frameMesh.position.set(wx, wy, zFace);
            bldgGroup.add(frameMesh);

            const paneGeom = new THREE.BoxGeometry(winW, winH, 0.08);
            const paneMesh = new THREE.Mesh(paneGeom, materials.windowMaterial);
            paneMesh.position.set(wx, wy, zFace);
            bldgGroup.add(paneMesh);

            // Pointed Gothic arch head for Valley Chapel windows (Geograph #4421157)
            if (b.type === 'chapel') {
              const archShape = new THREE.Shape();
              const hw = (winW + 0.16) * 0.5;
              archShape.moveTo(-hw, 0);
              archShape.quadraticCurveTo(-hw * 0.85, 0.58, 0, 0.82);
              archShape.quadraticCurveTo(hw * 0.85, 0.58, hw, 0);
              archShape.closePath();

              const archFrameGeom = new THREE.ExtrudeGeometry(archShape, {
                depth: 0.07,
                bevelEnabled: false,
              });
              archFrameGeom.translate(0, 0, -0.035);
              const archFrameMesh = new THREE.Mesh(archFrameGeom, materials.windowFrameMaterial);
              archFrameMesh.position.set(wx, wy + winH * 0.5, zFace);
              bldgGroup.add(archFrameMesh);

              const innerShape = new THREE.Shape();
              const ihw = winW * 0.5;
              innerShape.moveTo(-ihw, 0);
              innerShape.quadraticCurveTo(-ihw * 0.85, 0.48, 0, 0.70);
              innerShape.quadraticCurveTo(ihw * 0.85, 0.48, ihw, 0);
              innerShape.closePath();

              const archPaneGeom = new THREE.ExtrudeGeometry(innerShape, {
                depth: 0.09,
                bevelEnabled: false,
              });
              archPaneGeom.translate(0, 0, -0.045);
              const archPaneMesh = new THREE.Mesh(archPaneGeom, materials.windowMaterial);
              archPaneMesh.position.set(wx, wy + winH * 0.5, zFace);
              bldgGroup.add(archPaneMesh);
            }
          }
        }
      }

      // Additional authentic details for Valley Chapel (SY14 7JX):
      // Twin Velux skylights on the road-facing (+Z) slate roof slope (visible in Geograph #4421157)
      if (b.type === 'chapel') {
        const skylightFrameGeom = new THREE.BoxGeometry(1.05, 0.1, 1.45);
        const skylightPaneGeom = new THREE.BoxGeometry(0.9, 0.12, 1.3);
        const ny = Math.cos(slopeAngle) * 0.11;
        const nz = Math.sin(slopeAngle) * 0.11;
        for (const sx of [-1.6, 0.1]) {
          const skyGroup = new THREE.Group();
          skyGroup.position.set(
            sx,
            b.eavesHeight + roofRise * 0.48 + ny,
            halfSpan * 0.52 + nz
          );
          skyGroup.rotation.x = slopeAngle;
          skyGroup.add(new THREE.Mesh(skylightFrameGeom, materials.windowFrameMaterial));
          skyGroup.add(new THREE.Mesh(skylightPaneGeom, materials.windowMaterial));
          bldgGroup.add(skyGroup);
        }
      }
    } else if (b.type === 'barn' || b.type === 'farm_auxiliary') {
      // Large timber/metal barn doors on agricultural buildings
      const doorW = Math.min(3.4, width * 0.35);
      const doorH = Math.min(3.2, b.eavesHeight * 0.78);
      const barnDoorGeom = new THREE.BoxGeometry(doorW, doorH, 0.08);
      const barnDoorMesh = new THREE.Mesh(barnDoorGeom, materials.doorMaterial);
      barnDoorMesh.position.set(0, doorH * 0.5, depth * 0.5 + 0.03);
      bldgGroup.add(barnDoorMesh);
    }

    this.group.add(bldgGroup);
  }

  /**
   * Builds the distinctive barrel-vaulted dark corrugated Dutch hay barn at Bridge Farm
   * seen on the right when entering Lower Wych over the bridge (Geograph #4421074)
   */
  private buildDutchBarn(
    group: THREE.Group,
    width: number,
    depth: number,
    eavesH: number,
    ridgeH: number,
    skirtDrop: number,
    materials: ArchitecturalMaterials
  ) {
    const cladMat = materials.wallMaterials.farm_clad;
    const roofMat = materials.roofMaterials.metal;
    const concreteMat = materials.wallMaterials.render;

    // Lower concrete livestock/yard wall panels around base
    const baseWallH = 1.65;
    const baseGeom = new THREE.BoxGeometry(width - 0.4, baseWallH + skirtDrop, depth - 0.4);
    const baseMesh = new THREE.Mesh(baseGeom, concreteMat);
    baseMesh.position.y = (baseWallH - skirtDrop) * 0.5;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Steel stanchion posts along both sides (4 bays)
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a261e, roughness: 0.7, metalness: 0.4 });
    const postGeom = new THREE.BoxGeometry(0.22, eavesH + skirtDrop, 0.22);
    const bays = 4;
    for (let i = 0; i <= bays; i++) {
      const px = -width * 0.5 + (i / bays) * width;
      for (const pz of [-depth * 0.48, depth * 0.48]) {
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.set(px, (eavesH - skirtDrop) * 0.5, pz);
        post.castShadow = true;
        group.add(post);
      }
    }

    // Upper corrugated side skirts & curved barrel-vault roof
    const archRise = ridgeH - eavesH;
    const shape = new THREE.Shape();
    const halfD = depth * 0.52;
    shape.moveTo(-halfD, eavesH - 1.1);
    shape.lineTo(-halfD, eavesH);
    shape.absarc(0, eavesH, halfD, Math.PI, 0, true);
    shape.lineTo(halfD, eavesH - 1.1);
    shape.lineTo(halfD - 0.18, eavesH - 1.1);
    shape.absarc(0, eavesH, halfD - 0.18, 0, Math.PI, false);
    shape.closePath();

    const archGeom = new THREE.ExtrudeGeometry(shape, { depth: width + 0.4, bevelEnabled: false });
    archGeom.scale(1, archRise / halfD, 1);
    // Restore Y position after scaling Y
    archGeom.rotateY(Math.PI / 2);
    archGeom.translate(-width * 0.5 - 0.2, eavesH * (1 - archRise / halfD), 0);

    const archMesh = new THREE.Mesh(archGeom, roofMat);
    archMesh.castShadow = true;
    archMesh.receiveShadow = true;
    group.add(archMesh);

    // Gable tympanum cladding under the barrel arch at both ends
    const endShape = new THREE.Shape();
    endShape.moveTo(-halfD, eavesH - 0.9);
    endShape.absarc(0, eavesH, halfD, Math.PI, 0, true);
    endShape.lineTo(halfD, eavesH - 0.9);
    endShape.closePath();

    const endGeom = new THREE.ShapeGeometry(endShape);
    endGeom.scale(1, archRise / halfD, 1);
    endGeom.translate(0, eavesH * (1 - archRise / halfD), 0);
    endGeom.rotateY(Math.PI / 2);

    const westEnd = new THREE.Mesh(endGeom, cladMat);
    westEnd.position.x = -width * 0.5;
    group.add(westEnd);

    const eastEnd = new THREE.Mesh(endGeom.clone().rotateY(Math.PI), cladMat);
    eastEnd.position.x = width * 0.5;
    group.add(eastEnd);
  }

  /**
   * Builds Howberry Bungalow (Lower Wych Road, Lower Wych, Malpas SY14 7JX)
   * Verified against Rightmove #17127317 photos & floorplan, OS AddressBase (SJ 48520 44325),
   * and 1m EA LIDAR DSM:
   * - Main Residential Wing (15.4m x 6.2m): warm cream/buff smooth render, dark slate-black plinth,
   *   grey Welsh slate roof, 3 white Georgian-bar casement windows, white 10-pane glazed front door,
   *   and exterior coach lamp.
   * - Perpendicular Kitchen/Diner Link (5.6m x 5.6m): lower-ridged slate roof with 2 Velux skylights
   *   and 4-leaf white glazed French patio doors opening onto the courtyard.
   * - Attached Double Garage Wing (6.6m x 6.3m): stepping slightly forward into the courtyard with
   *   two white horizontal-ribbed up-and-over garage doors.
   * - Tarmac Parking Courtyard with circular turning mark, curved corner patio, and Cheshire red-brick
   *   garden wall topped with golden-oak diamond/square lattice timber trellis and terracotta planters.
   */
  private buildHowberryBungalow(
    group: THREE.Group,
    cx: number,
    cz: number,
    groundY: number,
    angle: number,
    width: number,
    depth: number,
    eavesH: number,
    ridgeH: number,
    skirtDrop: number,
    terrain: TerrainSystem,
    materials: ArchitecturalMaterials
  ) {
    const creamWallMat = materials.wallMaterials.render.clone();
    creamWallMat.color = new THREE.Color(0xe6d7ba); // Warm cream/buff smooth render
    const roofMat = materials.roofMaterials.slate;
    const darkPlinthMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.85 });
    const whiteTrimMat = new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 0.35 });
    const garageDoorMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.42 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.4, metalness: 0.5 });
    const tarmacMat = new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.92 });
    const tarmacRingMat = new THREE.MeshStandardMaterial({ color: 0x454950, roughness: 0.88 });
    const patioBrickMat = new THREE.MeshStandardMaterial({ color: 0x9e5648, roughness: 0.85 });
    const trellisWoodMat = new THREE.MeshStandardMaterial({ color: 0xc28b48, roughness: 0.75 });
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb85236, roughness: 0.8 });
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x2f5a28, roughness: 0.85 });

    // Helper to build a pitched-roof wing in local coordinates
    // If ridgeAlongZ is false, ridge runs along X (width along X, span along Z).
    // If ridgeAlongZ is true, ridge runs along Z (length along Z, span along X).
    const addGabledWing = (
      ox: number,
      oz: number,
      len: number,
      span: number,
      wEaves: number,
      wRidge: number,
      ridgeAlongZ: boolean
    ) => {
      const wingGroup = new THREE.Group();
      wingGroup.position.set(ox, 0, oz);
      if (ridgeAlongZ) {
        wingGroup.rotation.y = -Math.PI / 2;
      }

      const totalH = wEaves + skirtDrop;
      const wallBox = new THREE.Mesh(
        new THREE.BoxGeometry(len, totalH, span),
        creamWallMat
      );
      wallBox.position.y = wEaves * 0.5 - skirtDrop * 0.5;
      wallBox.castShadow = true;
      wallBox.receiveShadow = true;
      wingGroup.add(wallBox);

      // Dark painted masonry plinth along base
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(len + 0.06, 0.36, span + 0.06),
        darkPlinthMat
      );
      plinth.position.y = 0.18;
      wingGroup.add(plinth);

      // Pitched slate roof planes
      const rise = Math.max(0.9, wRidge - wEaves);
      const overW = 0.28;
      const overD = 0.32;
      const halfSpan = span * 0.5 + overD;
      const slopeLen = Math.hypot(halfSpan, rise);
      const slopeAng = Math.atan2(rise, halfSpan);

      const roofPlaneGeom = new THREE.BoxGeometry(len + overW * 2, 0.14, slopeLen);
      const frontRoof = new THREE.Mesh(roofPlaneGeom, roofMat);
      frontRoof.position.set(0, wEaves + rise * 0.5, halfSpan * 0.5);
      frontRoof.rotation.x = slopeAng;
      frontRoof.castShadow = true;
      frontRoof.receiveShadow = true;
      wingGroup.add(frontRoof);

      const backRoof = new THREE.Mesh(roofPlaneGeom, roofMat);
      backRoof.position.set(0, wEaves + rise * 0.5, -halfSpan * 0.5);
      backRoof.rotation.x = -slopeAng;
      backRoof.castShadow = true;
      backRoof.receiveShadow = true;
      wingGroup.add(backRoof);

      // Dark slate ridge capping
      const ridgeCap = new THREE.Mesh(
        new THREE.BoxGeometry(len + overW * 2, 0.18, 0.22),
        darkPlinthMat
      );
      ridgeCap.position.set(0, wEaves + rise + 0.05, 0);
      wingGroup.add(ridgeCap);

      // Black eaves fascia / guttering
      for (const s of [-1, 1]) {
        const gutter = new THREE.Mesh(
          new THREE.BoxGeometry(len + overW * 2, 0.12, 0.1),
          darkMetalMat
        );
        gutter.position.set(0, wEaves - 0.04, s * (span * 0.5 + 0.18));
        wingGroup.add(gutter);
      }

      // Gable end triangles
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-span * 0.5, 0);
      gableShape.lineTo(span * 0.5, 0);
      gableShape.lineTo(0, rise);
      gableShape.closePath();

      const gableGeom = new THREE.ExtrudeGeometry(gableShape, {
        depth: len,
        bevelEnabled: false,
      });
      const uvAttr = gableGeom.attributes.uv;
      if (uvAttr) {
        for (let i = 0; i < uvAttr.count; i++) {
          uvAttr.setXY(i, uvAttr.getX(i) / Math.max(1, span), uvAttr.getY(i) / Math.max(1, wEaves));
        }
        uvAttr.needsUpdate = true;
      }
      gableGeom.rotateY(Math.PI / 2);
      gableGeom.translate(-len * 0.5, wEaves, 0);
      const gableMesh = new THREE.Mesh(gableGeom, creamWallMat);
      gableMesh.castShadow = true;
      gableMesh.receiveShadow = true;
      wingGroup.add(gableMesh);

      group.add(wingGroup);
      return { wingGroup, rise, halfSpan, slopeAng };
    };

    // 1. Main Residential Wing (15.4m x 6.2m, ridge along local X)
    addGabledWing(0, 0, width, depth, eavesH, ridgeH, false);

    // Black rainwater downpipe on right corner of main wing (+X, +Z) seen in howberry_photo1.jpg
    const downpipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, eavesH + 0.2, 8),
      darkMetalMat
    );
    downpipe.position.set(width * 0.5 - 0.18, eavesH * 0.5, depth * 0.5 + 0.05);
    group.add(downpipe);

    // Helper for multi-pane Georgian-bar casement windows on main wing
    const addGeorgianWindow = (
      wx: number,
      wy: number,
      wz: number,
      winW: number,
      winH: number,
      cols: number,
      rows: number,
      rotY = 0
    ) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, wy, wz);
      wGroup.rotation.y = rotY;

      // Outer white frame
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(winW + 0.14, winH + 0.12, 0.06),
        whiteTrimMat
      );
      wGroup.add(frame);

      // Projecting white window sill
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(winW + 0.24, 0.07, 0.12),
        whiteTrimMat
      );
      sill.position.set(0, -winH * 0.5 - 0.05, 0.03);
      wGroup.add(sill);

      // Dark reflective glass pane
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(winW, winH, 0.07),
        materials.windowMaterial
      );
      wGroup.add(pane);

      // Crisp white Georgian glazing bars
      for (let c = 1; c < cols; c++) {
        const bx = -winW * 0.5 + (c / cols) * winW;
        const barV = new THREE.Mesh(
          new THREE.BoxGeometry(0.032, winH, 0.085),
          whiteTrimMat
        );
        barV.position.x = bx;
        wGroup.add(barV);
      }
      for (let r = 1; r < rows; r++) {
        const by = -winH * 0.5 + (r / rows) * winH;
        const barH = new THREE.Mesh(
          new THREE.BoxGeometry(winW, 0.032, 0.085),
          whiteTrimMat
        );
        barH.position.y = by;
        wGroup.add(barH);
      }

      group.add(wGroup);
    };

    const zFront = depth * 0.5 + 0.03;
    // Three 4x3 Georgian-bar casement windows across the courtyard facade (matching howberry_photo1.jpg)
    addGeorgianWindow(-0.65, 1.68, zFront, 1.25, 1.05, 4, 3);
    addGeorgianWindow(2.55, 1.68, zFront, 1.35, 1.05, 4, 3);
    addGeorgianWindow(5.65, 1.68, zFront, 1.45, 1.05, 4, 3);

    // Rear (-Z) garden windows (Lounge patio door + bathroom + bedroom windows from floorplan)
    const zBack = -depth * 0.5 - 0.03;
    addGeorgianWindow(-4.2, 1.68, zBack, 1.8, 1.2, 4, 3);
    addGeorgianWindow(0.2, 1.72, zBack, 0.9, 0.85, 2, 2);
    addGeorgianWindow(2.8, 1.68, zBack, 1.35, 1.05, 4, 3);
    addGeorgianWindow(5.8, 1.72, zBack, 0.9, 0.85, 2, 2);

    // East gable (+X) en-suite window visible from Lower Wych Road (brook_farm_cottage.jpg & howberry_photo1.jpg)
    addGeorgianWindow(width * 0.5 + 0.03, 1.68, -0.35, 0.85, 0.85, 2, 2, Math.PI / 2);

    // White 10-pane Georgian glazed Front Entrance Door at x = +0.90m (howberry_photo1.jpg)
    const doorX = 0.9;
    const doorW = 0.96;
    const doorH = 2.08;
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + 0.14, doorH + 0.1, 0.07),
      whiteTrimMat
    );
    doorFrame.position.set(doorX, doorH * 0.5 + 0.04, zFront);
    group.add(doorFrame);

    const doorGlass = new THREE.Mesh(
      new THREE.BoxGeometry(doorW - 0.12, doorH - 0.24, 0.08),
      materials.windowMaterial
    );
    doorGlass.position.set(doorX, doorH * 0.5 + 0.08, zFront);
    group.add(doorGlass);

    // Georgian bars on front door (2 cols x 5 rows)
    const doorMidV = new THREE.Mesh(new THREE.BoxGeometry(0.04, doorH - 0.2, 0.095), whiteTrimMat);
    doorMidV.position.set(doorX, doorH * 0.5 + 0.08, zFront);
    group.add(doorMidV);
    for (let r = 1; r < 5; r++) {
      const barH = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.1, 0.035, 0.095), whiteTrimMat);
      barH.position.set(doorX, 0.2 + r * 0.36, zFront);
      group.add(barH);
    }

    // Exterior black coach lantern between left window and front door (howberry_photo1.jpg)
    const lamp1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.16), darkMetalMat);
    lamp1.position.set(0.18, 2.02, zFront + 0.06);
    group.add(lamp1);

    // 2. Perpendicular Kitchen/Diner Link Wing (centered at lx = -4.9, lz = +5.85, len = 5.6m along Z, span = 5.6m along X)
    const kWing = addGabledWing(-4.9, 5.85, 5.6, 5.6, 2.55, 3.85, true);

    // White 4-leaf French patio doors on Kitchen/Diner wing facing +X into the courtyard (howberry_photo1.jpg & howberry_photo2.jpg)
    const patioX = -4.9 + 5.6 * 0.5 + 0.03; // -2.07
    const patioZ = 5.85;
    const patioW = 3.55;
    const patioH = 2.08;
    const patioFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, patioH + 0.12, patioW + 0.16),
      whiteTrimMat
    );
    patioFrame.position.set(patioX, patioH * 0.5 + 0.04, patioZ);
    group.add(patioFrame);

    const patioGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, patioH - 0.16, patioW - 0.12),
      materials.windowMaterial
    );
    patioGlass.position.set(patioX, patioH * 0.5 + 0.04, patioZ);
    group.add(patioGlass);

    // 4 door leaf mullions + horizontal Georgian bars on the French doors
    for (let leaf = 1; leaf < 4; leaf++) {
      const lz = patioZ - patioW * 0.5 + (leaf / 4) * patioW;
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.095, patioH, leaf === 2 ? 0.08 : 0.055),
        whiteTrimMat
      );
      mullion.position.set(patioX, patioH * 0.5 + 0.04, lz);
      group.add(mullion);
    }
    for (let r = 1; r <= 3; r++) {
      const by = 0.25 + r * 0.45;
      const transom = new THREE.Mesh(
        new THREE.BoxGeometry(0.092, 0.03, patioW - 0.1),
        whiteTrimMat
      );
      transom.position.set(patioX, by, patioZ);
      group.add(transom);
    }

    // Twin Velux roof skylights on the Kitchen/Diner slate roof (howberry_photo3.jpg & howberry_floorplan.jpg)
    const skyFrameGeom = new THREE.BoxGeometry(0.95, 0.1, 1.25);
    const skyPaneGeom = new THREE.BoxGeometry(0.8, 0.12, 1.1);
    const kNy = Math.cos(kWing.slopeAng) * 0.09;
    const kNz = Math.sin(kWing.slopeAng) * 0.09;
    for (const sx of [-1.25, 1.25]) {
      for (const side of [-1, 1]) {
        const skyGroup = new THREE.Group();
        skyGroup.position.set(
          sx,
          2.55 + kWing.rise * 0.48 + kNy,
          side * (kWing.halfSpan * 0.48 + kNz)
        );
        skyGroup.rotation.x = side * kWing.slopeAng;
        skyGroup.add(new THREE.Mesh(skyFrameGeom, whiteTrimMat));
        skyGroup.add(new THREE.Mesh(skyPaneGeom, materials.windowMaterial));
        kWing.wingGroup.add(skyGroup);
      }
    }

    // 3. Attached Double Garage Wing (centered at lx = -4.55, lz = +11.95, len = 6.6m along Z, span = 6.3m along X)
    // Steps ~0.7m forward into the courtyard relative to the kitchen link, matching howberry_photo1.jpg & howberry_floorplan.jpg
    addGabledWing(-4.55, 11.95, 6.6, 6.3, 2.75, 4.25, true);

    // Two white horizontal-ribbed up-and-over garage doors facing +X into the courtyard (howberry_photo1.jpg)
    const garX = -4.55 + 6.3 * 0.5 + 0.03; // -1.37
    for (const gz of [10.35, 13.55]) {
      const gDoorW = 2.42;
      const gDoorH = 2.12;

      const gFrame = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, gDoorH + 0.12, gDoorW + 0.16),
        whiteTrimMat
      );
      gFrame.position.set(garX, gDoorH * 0.5 + 0.02, gz);
      group.add(gFrame);

      const gPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, gDoorH, gDoorW),
        garageDoorMat
      );
      gPanel.position.set(garX, gDoorH * 0.5 + 0.02, gz);
      group.add(gPanel);

      // Horizontal garage door ribs + black centre handle
      for (let r = 1; r <= 7; r++) {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.095, 0.022, gDoorW - 0.08),
          darkPlinthMat
        );
        rib.position.set(garX, r * 0.265, gz);
        group.add(rib);
      }
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.06, 0.16),
        darkMetalMat
      );
      handle.position.set(garX, 0.95, gz);
      group.add(handle);
    }

    // Coach lamps above the double garage piers (howberry_photo1.jpg)
    for (const lz of [8.9, 11.95]) {
      const gLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.16), darkMetalMat);
      gLamp.position.set(garX + 0.05, 2.32, lz);
      group.add(gLamp);
    }

    // Register collider for the perpendicular Kitchen + Double Garage wing
    const cosA = Math.cos(-angle);
    const sinA = Math.sin(-angle);
    const localWingX = -4.7;
    const localWingZ = 9.1;
    const worldWingX = cx + localWingX * cosA + localWingZ * sinA;
    const worldWingZ = cz - localWingX * sinA + localWingZ * cosA;
    const perpAngle = -angle - Math.PI / 2;
    this.colliders.push({
      id: 'bldg-howberry-bungalow-wing',
      cx: worldWingX,
      cz: worldWingZ,
      halfW: 6.1 + 0.4,
      halfD: 3.15 + 0.4,
      cos: Math.cos(perpAngle),
      sin: Math.sin(perpAngle),
      radius: Math.hypot(6.1, 3.15) + 0.5,
    });

    // Helper to sample local Y offset of terrain at local (lx, lz)
    const localTerrainY = (lx: number, lz: number) => {
      const wx = cx + lx * cosA + lz * sinA;
      const wz = cz - lx * sinA + lz * cosA;
      return terrain.getHeightAt(wx, wz) - groundY;
    };

    // 4. Tarmac Parking Courtyard, Circular Turning Mark, Curved Corner Patio, Red-Brick Wall & Timber Trellis
    // (Verified from howberry_photo1.jpg & howberry_photo4.jpg)
    const courtW = 13.0; // lx from -2.1 to +10.9
    const courtD = 12.4; // lz from +3.1 to +15.5
    const courtCX = 4.4;
    const courtCZ = 9.3;
    const courtGeom = new THREE.PlaneGeometry(courtW, courtD, 16, 16);
    courtGeom.rotateX(-Math.PI / 2);
    const cPos = courtGeom.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const lx = courtCX + cPos.getX(i);
      const lz = courtCZ + cPos.getZ(i);
      cPos.setY(i, Math.max(0.02, localTerrainY(lx, lz) + 0.04));
    }
    cPos.needsUpdate = true;
    courtGeom.computeVertexNormals();
    const courtPad = new THREE.Mesh(courtGeom, tarmacMat);
    courtPad.position.set(courtCX, 0, courtCZ);
    courtPad.receiveShadow = true;
    group.add(courtPad);

    // Subtle circular turning ring on the tarmac courtyard (howberry_photo4.jpg)
    const ringGeom = new THREE.RingGeometry(2.5, 2.72, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const rPos = ringGeom.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const lx = 3.8 + rPos.getX(i);
      const lz = 9.0 + rPos.getZ(i);
      rPos.setY(i, Math.max(0.03, localTerrainY(lx, lz) + 0.055));
    }
    rPos.needsUpdate = true;
    const ringMesh = new THREE.Mesh(ringGeom, tarmacRingMat);
    ringMesh.position.set(3.8, 0, 9.0);
    ringMesh.receiveShadow = true;
    group.add(ringMesh);

    // Curved red-brick/paved corner patio in the courtyard (howberry_photo4.jpg)
    const patioArcGeom = new THREE.CircleGeometry(3.2, 24, 0, Math.PI * 0.5);
    patioArcGeom.rotateX(-Math.PI / 2);
    const pPos = patioArcGeom.attributes.position;
    for (let i = 0; i < pPos.count; i++) {
      const lx = -1.3 + pPos.getX(i);
      const lz = 3.15 + pPos.getZ(i);
      pPos.setY(i, Math.max(0.04, localTerrainY(lx, lz) + 0.065));
    }
    pPos.needsUpdate = true;
    const patioArcMesh = new THREE.Mesh(patioArcGeom, patioBrickMat);
    patioArcMesh.position.set(-1.3, 0, 3.15);
    patioArcMesh.receiveShadow = true;
    group.add(patioArcMesh);

    // Helper to build a Cheshire red-brick boundary wall segment topped with golden-oak lattice trellis
    // and terracotta plant pots (howberry_photo4.jpg)
    const addBrickTrellisWall = (x1: number, z1: number, x2: number, z2: number, withPots: boolean) => {
      const segLen = Math.hypot(x2 - x1, z2 - z1);
      const segAng = Math.atan2(z2 - z1, x2 - x1);
      const midX = (x1 + x2) * 0.5;
      const midZ = (z1 + z2) * 0.5;
      const baseTerrY = Math.max(0, localTerrainY(midX, midZ));
      const wGroup = new THREE.Group();
      wGroup.position.set(midX, baseTerrY, midZ);
      wGroup.rotation.y = -segAng;

      const brickH = 1.05;
      const brickWall = new THREE.Mesh(
        new THREE.BoxGeometry(segLen, brickH + skirtDrop, 0.34),
        materials.wallMaterials.brick
      );
      brickWall.position.y = (brickH - skirtDrop) * 0.5;
      brickWall.castShadow = true;
      brickWall.receiveShadow = true;
      wGroup.add(brickWall);

      // Brick coping course
      const coping = new THREE.Mesh(
        new THREE.BoxGeometry(segLen + 0.06, 0.08, 0.4),
        darkPlinthMat
      );
      coping.position.y = brickH + 0.04;
      wGroup.add(coping);

      // Golden-oak timber lattice trellis on top of the brick wall (howberry_photo4.jpg)
      const trellisH = 0.85;
      const trellisBaseY = brickH + 0.08;
      // Horizontal trellis rails (5 rails)
      for (let r = 0; r <= 4; r++) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(segLen, 0.035, 0.04),
          trellisWoodMat
        );
        rail.position.y = trellisBaseY + (r / 4) * trellisH;
        wGroup.add(rail);
      }
      // Vertical trellis battens every 0.22m
      const battenCount = Math.floor(segLen / 0.22);
      for (let i = 0; i <= battenCount; i++) {
        const bx = -segLen * 0.5 + (i / Math.max(1, battenCount)) * segLen;
        const isPost = i % 8 === 0;
        const batten = new THREE.Mesh(
          new THREE.BoxGeometry(isPost ? 0.075 : 0.028, trellisH + 0.06, isPost ? 0.075 : 0.035),
          trellisWoodMat
        );
        batten.position.set(bx, trellisBaseY + trellisH * 0.5, 0);
        wGroup.add(batten);
      }

      // Terracotta flower pots with climbing/potted shrubs along the inside of the wall (howberry_photo4.jpg)
      if (withPots) {
        const potCount = Math.max(2, Math.floor(segLen / 1.9));
        for (let p = 1; p <= potCount; p++) {
          const px = -segLen * 0.5 + (p / (potCount + 1)) * segLen;
          const pot = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.17, 0.38, 10),
            potMat
          );
          pot.position.set(px, 0.24, 0.36);
          pot.castShadow = true;
          wGroup.add(pot);

          const shrub = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.32, 1),
            shrubMat
          );
          shrub.position.set(px, 0.65, 0.34);
          shrub.scale.set(0.9, 1.35, 0.85);
          shrub.castShadow = true;
          wGroup.add(shrub);
        }
      }

      group.add(wGroup);
    };

    // North-East courtyard return wall (from main wing east corner lx=+7.7, lz=+3.1 out to lx=+9.9, lz=+3.1)
    addBrickTrellisWall(7.65, 3.1, 9.9, 3.1, true);
    // East roadside courtyard wall with trellis & pots (from lx=+9.9, lz=+3.1 to lx=+9.9, lz=+10.6, leaving wide driveway opening at lz=+10.6..+15.3)
    addBrickTrellisWall(9.9, 3.1, 9.9, 10.6, true);
  }
}

