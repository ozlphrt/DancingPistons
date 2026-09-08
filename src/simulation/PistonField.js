import * as THREE from 'three';
import { HexGrid } from './HexGrid.js';
import { HexPiston, createBeveledHexGeometry } from './HexPiston.js';

export class PistonField {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} materialManager
     * @param {Object} soundEffects
     * @param {Object} options
     */
    constructor(scene, materialManager, soundEffects, options = {}) {
        this.scene = scene;
        this.materialManager = materialManager;
        this.sound = soundEffects;

        this.hexRadius = options.hexRadius || 0.95;
        this.hexGap = options.hexGap || 0.08;
        this.rings = options.rings || 7; // 169 pistons
        this.cursorRadius = options.cursorRadius || 3.8;
        this.waveHeight = options.waveHeight || 1.8;
        this.motionMode = options.motionMode || 'interactive'; // 'interactive', 'sine_wave', 'vortex', 'perlin_liquid', 'breathing_heart'

        this.pistons = [];
        this.interactiveMeshes = [];
        this.ripples = []; // Active ripple shocks from clicks

        // Mouse interaction state
        this.cursorWorld = new THREE.Vector3(9999, 0, 9999);
        this.lastCursorWorld = new THREE.Vector3(9999, 0, 9999);
        this.cursorVelocity = new THREE.Vector3(0, 0, 0);
        this.isCursorOnField = false;

        // Ground plane for continuous smooth raycasting
        this.raycastPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.raycaster = new THREE.Raycaster();

        this.fieldGroup = new THREE.Group();
        this.scene.add(this.fieldGroup);

        this._initGeometries();
        this._buildField();
        this._buildBasePlate();
    }

    _initGeometries() {
        // Shared beveled hexagonal tile cap
        this.tileGeometry = createBeveledHexGeometry(this.hexRadius - this.hexGap / 2, 0.36, 0.06);

        // Shared cylinder shaft (machined piston rod)
        const shaftRadius = (this.hexRadius - this.hexGap) * 0.52;
        const shaftHeight = 3.2;
        this.shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 24);

        // Shared socket ring
        const socketRadius = this.hexRadius - this.hexGap / 2 + 0.02;
        this.socketGeometry = new THREE.CylinderGeometry(socketRadius, socketRadius, 0.12, 6);
        this.socketGeometry.rotateY(Math.PI / 6); // align with pointy hex
    }

    _buildField() {
        const grid = new HexGrid(this.hexRadius, this.hexGap);
        const cells = grid.generateGrid(this.rings);

        this.pistons = cells.map(cell => {
            const piston = new HexPiston({
                q: cell.q,
                r: cell.r,
                x: cell.x,
                z: cell.z,
                dist: cell.dist,
                radius: this.hexRadius,
                tileGeometry: this.tileGeometry,
                shaftGeometry: this.shaftGeometry,
                socketGeometry: this.socketGeometry,
                materials: this.materialManager
            });

            this.fieldGroup.add(piston.group);
            this.interactiveMeshes.push(piston.tileMesh);
            return piston;
        });
    }

    _buildBasePlate() {
        // Outer beveled hexagonal or circular baseplate surrounding the field
        const maxDist = this.rings * this.hexRadius * 1.85;
        const plateGeo = new THREE.CylinderGeometry(maxDist + 1.2, maxDist + 2.0, 0.5, 64);
        this.basePlateMesh = new THREE.Mesh(plateGeo, this.materialManager.baseMaterial);
        this.basePlateMesh.position.set(0, -0.32, 0);
        this.basePlateMesh.receiveShadow = true;
        this.fieldGroup.add(this.basePlateMesh);

        // Subtle dark rim ring
        const rimGeo = new THREE.TorusGeometry(maxDist + 1.25, 0.12, 16, 64);
        rimGeo.rotateX(Math.PI / 2);
        this.rimMesh = new THREE.Mesh(rimGeo, this.materialManager.socketMaterial);
        this.rimMesh.position.set(0, -0.06, 0);
        this.fieldGroup.add(this.rimMesh);
    }

    /**
     * Updates cursor world position from mouse raycast
     * @param {THREE.Camera} camera 
     * @param {THREE.Vector2} mouseNDC 
     */
    updateCursor(camera, mouseNDC) {
        this.raycaster.setFromCamera(mouseNDC, camera);
        const intersectionPoint = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(this.raycastPlane, intersectionPoint)) {
            const maxFieldRadius = this.rings * this.hexRadius * 1.85;
            const distFromCenter = Math.hypot(intersectionPoint.x, intersectionPoint.z);

            if (distFromCenter <= maxFieldRadius + 2.0) {
                this.isCursorOnField = true;
                this.cursorVelocity.subVectors(intersectionPoint, this.cursorWorld);
                this.lastCursorWorld.copy(this.cursorWorld);
                this.cursorWorld.copy(intersectionPoint);
                return;
            }
        }
        this.isCursorOnField = false;
        this.cursorWorld.set(9999, 0, 9999);
    }

    /**
     * Triggers a circular shockwave ripple centered at cursor or clicked piston
     */
    triggerRipple(power = 1.0) {
        const origin = this.isCursorOnField ? this.cursorWorld.clone() : new THREE.Vector3(0, 0, 0);
        this.ripples.push({
            origin,
            startTime: performance.now() / 1000,
            amplitude: 2.2 * power,
            speed: 12.0,       // units per second outward
            wavelength: 2.2,   // width of wave crest
            decay: 2.2,        // damping over time
            maxTime: 2.5
        });

        if (this.sound) {
            this.sound.playRippleImpulse(power);
        }
    }

    /**
     * Physics & Animation Loop Step
     * @param {number} time - Elapsed time in seconds
     * @param {number} dt - Delta time in seconds
     */
    update(time, dt) {
        const now = time;
        let highestActiveElevation = 0;
        let activePistonCount = 0;

        // Clean up expired ripples
        this.ripples = this.ripples.filter(r => (now - r.startTime) < r.maxTime);

        // Precompute motion pattern parameters
        const isDancing = this.motionMode !== 'interactive';

        for (let i = 0; i < this.pistons.length; i++) {
            const p = this.pistons[i];
            let targetY = 0.0;

            // 1. Mouse Cursor Proximity Wave (Smooth bell curve / cosine)
            if (this.isCursorOnField) {
                const distToCursor = Math.hypot(p.x - this.cursorWorld.x, p.z - this.cursorWorld.z);
                if (distToCursor < this.cursorRadius) {
                    const normDist = distToCursor / this.cursorRadius;
                    // Cosine bell curve with smooth dropoff
                    const factor = 0.5 * (1.0 + Math.cos(Math.PI * normDist));
                    const mouseHeight = this.waveHeight * factor;
                    targetY += mouseHeight;

                    if (factor > 0.35) {
                        activePistonCount++;
                        if (mouseHeight > highestActiveElevation) {
                            highestActiveElevation = mouseHeight;
                        }
                    }
                }
            }

            // 2. Concentric Click Ripples
            for (let r = 0; r < this.ripples.length; r++) {
                const rip = this.ripples[r];
                const age = now - rip.startTime;
                const dist = Math.hypot(p.x - rip.origin.x, p.z - rip.origin.z);
                const waveFront = rip.speed * age;
                const distFromFront = dist - waveFront;

                // Wave packet localized around expanding front
                if (Math.abs(distFromFront) < rip.wavelength * 2.5) {
                    const decayFactor = Math.exp(-rip.decay * age);
                    const phase = (distFromFront / rip.wavelength) * Math.PI * 2;
                    const rippleY = rip.amplitude * decayFactor * Math.cos(phase) * Math.max(0, 1 - Math.abs(distFromFront) / (rip.wavelength * 2.5));
                    targetY += Math.max(0, rippleY);
                }
            }

            // 3. Autonomous Dancing Patterns
            if (isDancing) {
                let danceY = 0;
                const distFromCenter = p.dist;

                switch (this.motionMode) {
                    case 'sine_wave': {
                        // Rolling diagonal sine wave
                        const wave = Math.sin(p.x * 0.45 + p.z * 0.45 - time * 3.5);
                        danceY = (wave * 0.5 + 0.5) * (this.waveHeight * 0.95);
                        break;
                    }
                    case 'vortex': {
                        // Swirling spiral vortex
                        const angle = Math.atan2(p.z, p.x);
                        const spiral = Math.sin(angle * 3.0 - time * 3.0 + distFromCenter * 0.6);
                        danceY = (spiral * 0.5 + 0.5) * (this.waveHeight * 0.9);
                        break;
                    }
                    case 'perlin_liquid': {
                        // Multi-frequency undulating liquid surface
                        const f1 = Math.sin(p.x * 0.35 + time * 2.2) * Math.cos(p.z * 0.35 + time * 1.8);
                        const f2 = Math.sin(p.x * 0.65 - p.z * 0.5 + time * 3.0) * 0.5;
                        danceY = ((f1 + f2 + 1.5) / 3.0) * (this.waveHeight * 1.0);
                        break;
                    }
                    case 'breathing_heart': {
                        // Concentric expanding heartbeats
                        const pulse = Math.sin(distFromCenter * 0.75 - time * 4.2);
                        danceY = Math.pow(Math.max(0, pulse), 2.2) * (this.waveHeight * 1.1);
                        break;
                    }
                }

                targetY += danceY;
            }

            p.setTarget(targetY);
            p.update(dt);
        }

        // Tactile sound effect when cursor actively sweeps over tiles
        if (this.isCursorOnField && activePistonCount > 0 && this.sound) {
            const speed = this.cursorVelocity.length();
            if (speed > 0.08) {
                this.sound.playPistonSweep(Math.min(1.0, highestActiveElevation / this.waveHeight));
            }
        }
    }

    /**
     * Updates material palette across all meshes and baseplates
     */
    setPalette(paletteKey) {
        this.materialManager.updatePalette(paletteKey);
        const pal = this.materialManager.getCurrentPalette();

        if (this.basePlateMesh) {
            this.basePlateMesh.material.color.set(pal.basePlate);
        }
    }

    /**
     * Sets motion dance preset
     */
    setMotionMode(mode) {
        this.motionMode = mode;
    }
}
