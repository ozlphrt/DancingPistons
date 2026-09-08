import * as THREE from 'three';

/**
 * Curated luxury palettes for the shiny plastic hexagonal tiles.
 * Directly referenced and expanded from SUM10's Domino and Gemstone palettes.
 */
export const PALETTES = {
    domino: {
        name: 'Domino Pearl White',
        tileBase: 0xfafafa,
        tileEdge: 0xe4e4e7,
        accent: 0x38bdf8,
        shaft: 0xd1d5db,
        basePlate: 0x111827,
        bg: 0x0a0f1d,
        rimColor: 0x93c5fd
    },
    sapphire: {
        name: 'Royal Sapphire',
        tileBase: 0x1e3a8a,
        tileEdge: 0x3b82f6,
        accent: 0x60a5fa,
        shaft: 0x1e293b,
        basePlate: 0x090d16,
        bg: 0x050a14,
        rimColor: 0x38bdf8
    },
    emerald: {
        name: 'Emerald Jade',
        tileBase: 0x064e3b,
        tileEdge: 0x059669,
        accent: 0x34d399,
        shaft: 0x1e293b,
        basePlate: 0x05130e,
        bg: 0x030d09,
        rimColor: 0x6ee7b7
    },
    obsidian: {
        name: 'Obsidian Ceramic',
        tileBase: 0x18181b,
        tileEdge: 0x27272a,
        accent: 0xa1a1aa,
        shaft: 0x0f172a,
        basePlate: 0x09090b,
        bg: 0x050507,
        rimColor: 0xe2e8f0
    },
    amber: {
        name: 'Solar Amber',
        tileBase: 0x78350f,
        tileEdge: 0xd97706,
        accent: 0xfbbf24,
        shaft: 0x292524,
        basePlate: 0x1c1008,
        bg: 0x120a05,
        rimColor: 0xfef08a
    },
    cyberpunk: {
        name: 'Cyber Prismatic',
        tileBase: 0x4c1d95,
        tileEdge: 0xec4899,
        accent: 0x06b6d4,
        shaft: 0x1e1b4b,
        basePlate: 0x0f0923,
        bg: 0x080415,
        rimColor: 0xf472b6
    }
};

/**
 * Creates high-resolution procedural textures for the hex tile top faces,
 * including delicate edge bevel shading and subtle radial sheen.
 */
function createHexFaceTexture(paletteKey = 'domino') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    const pal = PALETTES[paletteKey] || PALETTES.domino;
    const baseColor = new THREE.Color(pal.tileBase).getStyle();
    const edgeColor = new THREE.Color(pal.tileEdge).getStyle();

    // Background fill
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);

    // Subtle radial sheen from studio light
    const sheenGrad = ctx.createRadialGradient(cx * 0.85, cy * 0.85, 20, cx, cy, w * 0.6);
    sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    sheenGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.0)');
    sheenGrad.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(0, 0, w, h);

    // Outer hexagon border & ambient occlusion contour
    const hexRadius = w * 0.46;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = cx + hexRadius * Math.cos(angle);
        const y = cy + hexRadius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 14;
    ctx.stroke();

    // Inner subtle chamfer ring
    const innerRadius = hexRadius * 0.88;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = cx + innerRadius * Math.cos(angle);
        const y = cy + innerRadius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 4;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    return texture;
}

export class MaterialManager {
    constructor() {
        this.currentPaletteKey = 'domino';
        this.textures = new Map();
        this.materials = new Map();
        this._initMaterials();
    }

    _initMaterials() {
        // Build tile physical material for current palette
        this.updatePalette(this.currentPaletteKey);
    }

    /**
     * Creates or retrieves the shiny plastic tile material.
     * Directly matches SUM10's melamine resin & high clearcoat parameters.
     */
    updatePalette(paletteKey) {
        this.currentPaletteKey = paletteKey;
        const pal = PALETTES[paletteKey] || PALETTES.domino;

        if (!this.textures.has(paletteKey)) {
            this.textures.set(paletteKey, createHexFaceTexture(paletteKey));
        }
        const tex = this.textures.get(paletteKey);

        // Shiny plastic tile material (SUM10 specification)
        if (!this.tileMaterial) {
            this.tileMaterial = new THREE.MeshPhysicalMaterial({
                map: tex,
                color: pal.tileBase,
                roughness: 0.12,          // Highly polished domino plastic
                metalness: 0.0,           // Non-metallic melamine resin
                clearcoat: 0.98,          // Glossy protective clearcoat layer
                clearcoatRoughness: 0.05, // Mirror specular sheen
                ior: 1.54,                // High refractive index of resin/plastic
                reflectivity: 0.72
            });
        } else {
            this.tileMaterial.map = tex;
            this.tileMaterial.color.set(pal.tileBase);
            this.tileMaterial.needsUpdate = true;
        }

        // Sleek machined piston shaft material
        if (!this.shaftMaterial) {
            this.shaftMaterial = new THREE.MeshStandardMaterial({
                color: pal.shaft,
                roughness: 0.28,
                metalness: 0.85
            });
        } else {
            this.shaftMaterial.color.set(pal.shaft);
        }

        // Base plate & socket ring material
        if (!this.baseMaterial) {
            this.baseMaterial = new THREE.MeshStandardMaterial({
                color: pal.basePlate,
                roughness: 0.45,
                metalness: 0.3
            });
        } else {
            this.baseMaterial.color.set(pal.basePlate);
        }

        // Socket collar ring material (dark metallic socket inside baseplate)
        if (!this.socketMaterial) {
            this.socketMaterial = new THREE.MeshStandardMaterial({
                color: 0x0f172a,
                roughness: 0.6,
                metalness: 0.5
            });
        }
    }

    getCurrentPalette() {
        return PALETTES[this.currentPaletteKey];
    }
}
