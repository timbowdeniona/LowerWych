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
}
