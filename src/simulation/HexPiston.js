import * as THREE from 'three';

/**
 * Creates an extruded 6-sided regular polygon with beveled chamfers
 * and planar top/bottom UV coordinates for crisp texture mapping.
 */
export function createBeveledHexGeometry(radius = 0.94, depth = 0.32, bevel = 0.05) {
    const shape = new THREE.Shape();
    const effectiveRadius = radius - bevel;

    // Pointy-topped hexagon vertices in 2D shape plane (X, Y)
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = effectiveRadius * Math.cos(angle);
        const y = effectiveRadius * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();

    const extrudeSettings = {
        steps: 1,
        depth: depth - bevel * 2,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: 0,
        bevelSegments: 4
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Reorient geometry so extrusion is along Y axis (upwards) instead of Z axis
    // ExtrudeGeometry defaults to extrusion along +Z.
    // Rotating -90 deg around X makes +Z point along +Y.
    geometry.rotateX(-Math.PI / 2);
    geometry.center();

    // Compute normalized planar UVs on top face for texture mapping
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const span = radius * 2.0;

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        uv.setXY(i, (x + radius) / span, (z + radius) / span);
    }
    uv.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
}

export class HexPiston {
    /**
     * @param {Object} params
     * @param {number} params.q - Axial Q
     * @param {number} params.r - Axial R
     * @param {number} params.x - World X
     * @param {number} params.z - World Z
     * @param {number} params.dist - Distance from center
     * @param {number} params.radius - Hex radius
     * @param {THREE.BufferGeometry} params.tileGeometry - Shared tile cap geometry
     * @param {THREE.BufferGeometry} params.shaftGeometry - Shared shaft cylinder geometry
     * @param {THREE.BufferGeometry} params.socketGeometry - Shared socket collar geometry
     * @param {Object} params.materials - MaterialManager reference
     */
    constructor({ q, r, x, z, dist, radius, tileGeometry, shaftGeometry, socketGeometry, materials }) {
        this.q = q;
        this.r = r;
        this.x = x;
        this.z = z;
        this.dist = dist;
        this.radius = radius;

        // Physical spring dynamics state
        this.y = 0.0;
        this.targetY = 0.0;
        this.velocity = 0.0;
        this.stiffness = 180.0;
        this.damping = 14.0;
        this.mass = 1.0;
        this.lastAudibleY = 0.0;

        // Container group positioned at grid (x, 0, z)
        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);

        // 1. Stationary Base Socket Collar (flush with baseplate)
        this.socketMesh = new THREE.Mesh(socketGeometry, materials.socketMaterial);
        this.socketMesh.position.set(0, -0.05, 0);
        this.socketMesh.receiveShadow = true;
        this.group.add(this.socketMesh);

        // 2. Moving Piston Assembly Group (rises and falls with y)
        this.pistonGroup = new THREE.Group();
        this.pistonGroup.position.set(0, 0, 0);

        // 2a. Shiny Plastic Tile Cap
        this.tileMesh = new THREE.Mesh(tileGeometry, materials.tileMaterial);
        this.tileMesh.position.set(0, 0.16, 0);
        this.tileMesh.castShadow = true;
        this.tileMesh.receiveShadow = true;
        this.tileMesh.userData = { piston: this };
        this.pistonGroup.add(this.tileMesh);

        // 2b. Machined Shaft (telescopes underneath the tile into socket)
        this.shaftMesh = new THREE.Mesh(shaftGeometry, materials.shaftMaterial);
        this.shaftMesh.position.set(0, -1.2, 0); // Extends downward
        this.shaftMesh.castShadow = true;
        this.shaftMesh.receiveShadow = true;
        this.pistonGroup.add(this.shaftMesh);

        this.group.add(this.pistonGroup);
    }

    /**
     * Physics simulation step using damped harmonic oscillation
     * @param {number} dt - Delta time in seconds
     * @returns {number} Current elevation
     */
    update(dt) {
        // Clamp delta time to avoid instability on frame drops
        const step = Math.min(dt, 0.05);

        // Spring force pulling toward targetY
        const displacement = this.y - this.targetY;
        const springForce = -this.stiffness * displacement;
        const dampingForce = -this.damping * this.velocity;
        const accel = (springForce + dampingForce) / this.mass;

        this.velocity += accel * step;
        this.y += this.velocity * step;

        // Soft lower bound clamp to prevent pistons sinking below ground level
        if (this.y < -0.05) {
            this.y = -0.05;
            this.velocity = Math.max(0, -this.velocity * 0.25);
        }

        this.pistonGroup.position.y = this.y;
        return this.y;
    }

    /**
     * Applies an impulse (velocity shock) to the piston
     * @param {number} force 
     */
    applyImpulse(force) {
        this.velocity += force;
    }

    /**
     * Sets target elevation directly
     * @param {number} target 
     */
    setTarget(target) {
        this.targetY = Math.max(0, target);
    }
}
