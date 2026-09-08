import * as THREE from 'three';

/**
 * Creates an extruded 3D hexagonal prism with beveled top chamfer
 * and vertex colors configured so the top face receives 100% vibrant color coding
 * while the vertical column sides receive sleek depth shading.
 */
export function createHexPrismGeometry(radius = 0.40, height = 2.4, bevel = 0.025) {
    const shape = new THREE.Shape();
    const effectiveRadius = radius - bevel;

    // Pointy-topped regular hexagon vertices
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
        depth: height - bevel * 2,
        bevelEnabled: true,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: 0,
        bevelSegments: 3
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Rotate so extrusion is along Y axis (upwards)
    geometry.rotateX(-Math.PI / 2);

    // Translate so the top face rests at y = 0.0 and the prism shaft extends downwards to y = -height
    geometry.computeBoundingBox();
    const maxY = geometry.boundingBox.max.y;
    geometry.translate(0, -maxY, 0);

    // Vertex colors for height-coding contrast (top cap = 1.0, sides = 0.42)
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const topThreshold = -bevel * 1.5;

    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        let factor;
        if (y >= topThreshold) {
            factor = 1.0; // Top face cap
        } else if (y >= -bevel * 3.5) {
            factor = 0.94; // Beveled chamfer
        } else {
            factor = 0.88; // Solid colorful plastic body (eliminates metallic dark shading)
        }
        colors[i * 3] = factor;
        colors[i * 3 + 1] = factor;
        colors[i * 3 + 2] = factor;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
}
