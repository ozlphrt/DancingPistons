import * as THREE from 'three';

/**
 * Creates an ultra-optimized 3D hexagonal prism geometry for 18,000+ instanced pistons.
 * - Pointy-topped hex orientation (rotated Pi/6)
 * - Top face flush at y = 0.0 with body extending downward to y = -height
 * - Vertex colors configured for solid, vibrant molded plastic with top cap color coding
 */
export function createHexPrismGeometry(radius = 0.134, height = 1.6) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 6, 1, false);

    // Rotate by 30 deg so flat edges align with pointy-topped axial hex grid
    geometry.rotateY(Math.PI / 6);

    // Translate so top cap rests at y = 0.0 and prism column extends downward
    geometry.translate(0, -height / 2, 0);

    // Vertex colors: top face receives 100% vibrant height color, sides receive solid plastic color
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const topLimit = -0.015;

    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const factor = (y >= topLimit) ? 1.0 : 0.88;
        colors[i * 3] = factor;
        colors[i * 3 + 1] = factor;
        colors[i * 3 + 2] = factor;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
}
