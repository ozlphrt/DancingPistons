/**
 * Hexagonal Grid Mathematics for DancingPistons.
 * Uses pointy-topped axial coordinates (q, r).
 */

export class HexGrid {
    /**
     * @param {number} radius - Outer radius of each hexagon (center to vertex)
     * @param {number} gap - Spacing gap between tiles
     */
    constructor(radius = 1.0, gap = 0.06) {
        this.radius = radius;
        this.gap = gap;
        this.effectiveRadius = radius - gap / 2;
    }

    /**
     * Converts axial hex coordinates (q, r) to 2D world plane (x, z).
     * Pointy-topped orientation:
     * x = sqrt(3) * radius * (q + r/2)
     * z = (3/2) * radius * r
     */
    axialToWorld(q, r) {
        const x = this.radius * Math.sqrt(3) * (q + r / 2);
        const z = this.radius * 1.5 * r;
        return { x, z };
    }

    /**
     * Converts 2D world plane coordinates (x, z) to fractional axial (q, r).
     */
    worldToAxial(x, z) {
        const q = (Math.sqrt(3) / 3 * x - 1 / 3 * z) / this.radius;
        const r = (2 / 3 * z) / this.radius;
        return this.axialRound(q, r);
    }

    /**
     * Rounds fractional axial coordinates to the nearest hex tile using cube rounding.
     */
    axialRound(q, r) {
        const s = -q - r;
        let rx = Math.round(q);
        let ry = Math.round(r);
        let rz = Math.round(s);

        const xDiff = Math.abs(rx - q);
        const yDiff = Math.abs(ry - r);
        const zDiff = Math.abs(rz - s);

        if (xDiff > yDiff && xDiff > zDiff) {
            rx = -ry - rz;
        } else if (yDiff > zDiff) {
            ry = -rx - rz;
        }

        return { q: rx, r: ry };
    }

    /**
     * Generates a concentric hexagonal spiral/ring grid of radius `rings`.
     * Ring 0 is 1 tile; Ring N has 6*N tiles; Total tiles for radius N = 3*N*(N+1) + 1.
     * @param {number} rings - e.g. 7 rings = 169 tiles, 8 rings = 217 tiles, 9 rings = 271 tiles.
     * @returns {Array<{ q: number, r: number, ring: number, x: number, z: number, dist: number }>}
     */
    generateGrid(rings = 8) {
        const cells = [];
        // Center cell
        const centerWorld = this.axialToWorld(0, 0);
        cells.push({
            q: 0,
            r: 0,
            ring: 0,
            x: centerWorld.x,
            z: centerWorld.z,
            dist: 0
        });

        // Direction vectors in axial coordinates for pointy-topped hexes
        // (+1, 0), (+1, -1), (0, -1), (-1, 0), (-1, +1), (0, +1)
        const directions = [
            { q: 1, r: 0 },
            { q: 1, r: -1 },
            { q: 0, r: -1 },
            { q: -1, r: 0 },
            { q: -1, r: 1 },
            { q: 0, r: 1 }
        ];

        for (let ring = 1; ring <= rings; ring++) {
            // Start at direction 4 * ring
            let q = directions[4].q * ring;
            let r = directions[4].r * ring;

            for (let side = 0; side < 6; side++) {
                for (let step = 0; step < ring; step++) {
                    const world = this.axialToWorld(q, r);
                    const dist = Math.hypot(world.x, world.z);
                    cells.push({
                        q,
                        r,
                        ring,
                        x: world.x,
                        z: world.z,
                        dist
                    });
                    q += directions[side].q;
                    r += directions[side].r;
                }
            }
        }

        return cells;
    }
}
