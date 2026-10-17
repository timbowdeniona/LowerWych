import type { BuildingCollider } from '../world/Buildings.ts';

export class CollisionResolver {
  private readonly colliders: BuildingCollider[];
  private readonly worldHalfBound: number;

  constructor(colliders: BuildingCollider[], worldHalfBound = 292) {
    this.colliders = colliders;
    this.worldHalfBound = worldHalfBound;
  }

  /**
   * Resolves 2D player circle collision against oriented building footprints with smooth wall sliding
   */
  public resolve(x: number, z: number, playerRadius = 0.55): [number, number] {
    let px = Math.max(-this.worldHalfBound, Math.min(this.worldHalfBound, x));
    let pz = Math.max(-this.worldHalfBound, Math.min(this.worldHalfBound, z));

    for (const c of this.colliders) {
      const dx = px - c.cx;
      const dz = pz - c.cz;
      if (dx * dx + dz * dz > (c.radius + playerRadius) ** 2) continue;

      // Transform player position into building's local oriented frame
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;

      const clampedX = Math.max(-c.halfW, Math.min(c.halfW, lx));
      const clampedZ = Math.max(-c.halfD, Math.min(c.halfD, lz));

      const diffX = lx - clampedX;
      const diffZ = lz - clampedZ;
      const distSq = diffX * diffX + diffZ * diffZ;

      if (distSq < playerRadius * playerRadius) {
        let pushLocalX = 0;
        let pushLocalZ = 0;

        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const overlap = playerRadius - dist;
          pushLocalX = (diffX / dist) * overlap;
          pushLocalZ = (diffZ / dist) * overlap;
        } else {
          // Center is inside OBB; push out along nearest face
          const penX = c.halfW - Math.abs(lx) + playerRadius;
          const penZ = c.halfD - Math.abs(lz) + playerRadius;
          if (penX < penZ) {
            pushLocalX = lx >= 0 ? penX : -penX;
          } else {
            pushLocalZ = lz >= 0 ? penZ : -penZ;
          }
        }

        // Rotate push vector back to world space
        px += pushLocalX * c.cos + pushLocalZ * c.sin;
        pz += -pushLocalX * c.sin + pushLocalZ * c.cos;
      }
    }

    return [px, pz];
  }
}
