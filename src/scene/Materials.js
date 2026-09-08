import * as THREE from 'three';

/**
 * Gradient color stops for height-coded coloring of hexagonal pistons.
 * Directly maps elevation from resting (0.0) to peak (1.0).
 */
export const GRADIENT_PALETTES = {
    turbo: {
        name: 'Turbo Spectrum',
        bg: 0x050811,
        rimColor: 0x38bdf8,
        basePlate: 0x070d18,
        stops: [
            { pos: 0.00, hex: 0x172554 }, // Deep navy blue (resting)
            { pos: 0.20, hex: 0x0284c7 }, // Sky blue
            { pos: 0.40, hex: 0x10b981 }, // Emerald green
            { pos: 0.65, hex: 0xfacc15 }, // Bright gold
            { pos: 0.85, hex: 0xf97316 }, // Flame orange
            { pos: 1.00, hex: 0xffffff }  // Crest white
        ]
    },
    plasma: {
        name: 'Cyber Plasma',
        bg: 0x070412,
        rimColor: 0xf472b6,
        basePlate: 0x0a0518,
        stops: [
            { pos: 0.00, hex: 0x1e1b4b }, // Deep violet
            { pos: 0.25, hex: 0x6366f1 }, // Indigo
            { pos: 0.50, hex: 0xd946ef }, // Electric magenta
            { pos: 0.75, hex: 0xf43f5e }, // Rose coral
            { pos: 1.00, hex: 0xfef08a }  // Sunbeam yellow
        ]
    },
    emerald: {
        name: 'Emerald Jade',
        bg: 0x020c08,
        rimColor: 0x6ee7b7,
        basePlate: 0x03140e,
        stops: [
            { pos: 0.00, hex: 0x022c22 }, // Deep forest
            { pos: 0.25, hex: 0x065f46 }, // Jade green
            { pos: 0.50, hex: 0x10b981 }, // Vivid emerald
            { pos: 0.75, hex: 0x6ee7b7 }, // Mint glow
            { pos: 1.00, hex: 0xfef3c7 }  // Pale ivory
        ]
    },
    sapphire: {
        name: 'Royal Sapphire',
        bg: 0x040914,
        rimColor: 0x38bdf8,
        basePlate: 0x070e1c,
        stops: [
            { pos: 0.00, hex: 0x08152c }, // Midnight abyss
            { pos: 0.25, hex: 0x1e3a8a }, // Royal blue
            { pos: 0.50, hex: 0x2563eb }, // Azure blue
            { pos: 0.75, hex: 0x38bdf8 }, // Electric cyan
            { pos: 1.00, hex: 0xf0f9ff }  // Pure ice
        ]
    },
    magma: {
        name: 'Solar Magma',
        bg: 0x0c0604,
        rimColor: 0xfde047,
        basePlate: 0x140a06,
        stops: [
            { pos: 0.00, hex: 0x1c0a06 }, // Obsidian crust
            { pos: 0.25, hex: 0x7c2d12 }, // Molten amber
            { pos: 0.50, hex: 0xea580c }, // Fiery orange
            { pos: 0.75, hex: 0xfacc15 }, // Radiant gold
            { pos: 1.00, hex: 0xffffff }  // White incandescent heat
        ]
    },
    domino: {
        name: 'Domino Pearl White',
        bg: 0x080b12,
        rimColor: 0x94a3b8,
        basePlate: 0x0e131f,
        stops: [
            { pos: 0.00, hex: 0x1e293b }, // Slate dark
            { pos: 0.30, hex: 0x475569 }, // Cool graphite
            { pos: 0.60, hex: 0x94a3b8 }, // Soft silver
            { pos: 0.85, hex: 0xe2e8f0 }, // Polished ivory
            { pos: 1.00, hex: 0xffffff }  // Pure porcelain white
        ]
    }
};

/**
 * Precomputes 256-entry lookup table for seamless 0-alloc color sampling.
 */
function buildGradientLut(stops) {
    const lut = new Array(256);
    const parsedStops = stops.map(s => ({
        pos: s.pos,
        color: new THREE.Color(s.hex)
    }));

    for (let i = 0; i < 256; i++) {
        const t = i / 255.0;
        let color = parsedStops[parsedStops.length - 1].color;

        for (let s = 0; s < parsedStops.length - 1; s++) {
            const s1 = parsedStops[s];
            const s2 = parsedStops[s + 1];
            if (t >= s1.pos && t <= s2.pos) {
                const localT = (t - s1.pos) / (s2.pos - s1.pos);
                color = s1.color.clone().lerp(s2.color, localT);
                break;
            }
        }
        lut[i] = color;
    }
    return lut;
}

export class MaterialManager {
    constructor() {
        this.currentPaletteKey = 'turbo';
        this.luts = new Map();

        // Precompute LUTs for all palettes
        for (const [key, palette] of Object.entries(GRADIENT_PALETTES)) {
            this.luts.set(key, buildGradientLut(palette.stops));
        }

        this._initMaterials();
    }

    _initMaterials() {
        // Shiny plastic physical material (smooth glossy resin / ABS plastic)
        this.pistonMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            vertexColors: true,
            roughness: 0.22,          // Smooth glossy plastic surface (not mirror metal)
            metalness: 0.0,           // Strictly 0.0 non-metallic dielectric
            clearcoat: 0.48,          // Soft glossy protective plastic clearcoat
            clearcoatRoughness: 0.18, // Diffused specular spread
            ior: 1.48,                // Standard refractive index of molded plastic / acrylic
            reflectivity: 0.50,       // Natural plastic reflectivity
            sheen: 0.20,              // Subtle soft polymer sheen
            sheenRoughness: 0.35,
            sheenColor: new THREE.Color(0xffffff)
        });

        // Base ground plate material
        const pal = this.getCurrentPalette();
        this.baseMaterial = new THREE.MeshStandardMaterial({
            color: pal.basePlate,
            roughness: 0.55,
            metalness: 0.25
        });
    }

    /**
     * Retrieves the 256-entry active gradient LUT array for zero-overhead loop access.
     */
    getActiveLut() {
        return this.luts.get(this.currentPaletteKey) || this.luts.get('turbo');
    }

    /**
     * Samples color from the active height gradient LUT.
     * @param {number} normalizedHeight - Value from 0.0 to 1.0
     * @returns {THREE.Color}
     */
    sampleHeightColor(normalizedHeight) {
        const lut = this.getActiveLut();
        const idx = Math.max(0, Math.min(255, Math.floor(normalizedHeight * 255)));
        return lut[idx];
    }

    updatePalette(paletteKey) {
        if (GRADIENT_PALETTES[paletteKey]) {
            this.currentPaletteKey = paletteKey;
            const pal = this.getCurrentPalette();
            if (this.baseMaterial) {
                this.baseMaterial.color.set(pal.basePlate);
            }
        }
    }

    getCurrentPalette() {
        return GRADIENT_PALETTES[this.currentPaletteKey] || GRADIENT_PALETTES.turbo;
    }
}
