import * as THREE from 'three';
import { HexGrid } from './HexGrid.js';
import { createHexPrismGeometry } from './HexPiston.js';

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

        // 77 rings = 18,019 pistons (10X denser than 1,801)
        this.hexRadius = options.hexRadius || 0.134;
        this.hexGap = options.hexGap || 0.012;
        this.rings = options.rings || 77; // 18,019 pistons!
        this.cursorRadius = options.cursorRadius || 3.0;
        this.waveHeight = options.waveHeight || 1.2;
        this.motionMode = options.motionMode || 'interactive';

        this.stiffness = 200.0;
        this.damping = 15.0;
        this.mass = 1.0;

        // Mouse tracking state
        this.cursorWorld = new THREE.Vector3(9999, 0, 9999);
        this.cursorVelocity = new THREE.Vector3(0, 0, 0);
        this.isCursorOnField = false;
        this.isMouseMoving = false;

        this.ripples = [];
        this.raycastPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.raycaster = new THREE.Raycaster();

        this.fieldGroup = new THREE.Group();
        this.scene.add(this.fieldGroup);

        this._buildField();
        this._buildBasePlate();
    }

    _buildField() {
        const grid = new HexGrid(this.hexRadius, this.hexGap);
        const cells = grid.generateGrid(this.rings);
        this.count = cells.length; // Exactly 18,019

        // Compact typed arrays for 18,019 elements
        this.posX = new Float32Array(this.count);
        this.posZ = new Float32Array(this.count);
        this.dist = new Float32Array(this.count);
        this.posY = new Float32Array(this.count);
        this.targetY = new Float32Array(this.count);
        this.velocity = new Float32Array(this.count);

        for (let i = 0; i < this.count; i++) {
            this.posX[i] = cells[i].x;
            this.posZ[i] = cells[i].z;
            this.dist[i] = cells[i].dist;
            this.posY[i] = 0.0;
            this.targetY[i] = 0.0;
            this.velocity[i] = 0.0;
        }

        // Optimized 3D hexagonal prism geometry
        this.geometry = createHexPrismGeometry(this.hexRadius - this.hexGap / 2, 1.8);

        // Single-draw-call InstancedMesh for 18,019 instances
        this.instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.materialManager.pistonMaterial,
            this.count
        );

        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.castShadow = true;
        this.instancedMesh.receiveShadow = true;

        // Pre-initialize instance matrices and colors directly in flat memory
        const matrixArray = this.instancedMesh.instanceMatrix.array;
        const colorArray = this.instancedMesh.instanceColor.array;
        const initialLut = this.materialManager.getActiveLut();
        const restingCol = initialLut[0];

        for (let i = 0; i < this.count; i++) {
            const mIdx = i * 16;
            matrixArray[mIdx + 0] = 1;  matrixArray[mIdx + 1] = 0;  matrixArray[mIdx + 2] = 0;  matrixArray[mIdx + 3] = 0;
            matrixArray[mIdx + 4] = 0;  matrixArray[mIdx + 5] = 1;  matrixArray[mIdx + 6] = 0;  matrixArray[mIdx + 7] = 0;
            matrixArray[mIdx + 8] = 0;  matrixArray[mIdx + 9] = 0;  matrixArray[mIdx + 10] = 1; matrixArray[mIdx + 11] = 0;
            matrixArray[mIdx + 12] = this.posX[i];
            matrixArray[mIdx + 13] = 0.0; // Y elevation
            matrixArray[mIdx + 14] = this.posZ[i];
            matrixArray[mIdx + 15] = 1;

            const cIdx = i * 3;
            colorArray[cIdx] = restingCol.r;
            colorArray[cIdx + 1] = restingCol.g;
            colorArray[cIdx + 2] = restingCol.b;
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.instanceColor.needsUpdate = true;

        this.fieldGroup.add(this.instancedMesh);
    }

    _buildBasePlate() {
        const maxDist = this.rings * this.hexRadius * 1.76;
        const plateGeo = new THREE.CylinderGeometry(maxDist + 0.6, maxDist + 1.2, 0.4, 64);
        this.basePlateMesh = new THREE.Mesh(plateGeo, this.materialManager.baseMaterial);
        this.basePlateMesh.position.set(0, -0.22, 0);
        this.basePlateMesh.receiveShadow = true;
        this.fieldGroup.add(this.basePlateMesh);

        // Sleek rim ring
        const rimGeo = new THREE.TorusGeometry(maxDist + 0.62, 0.08, 16, 64);
        rimGeo.rotateX(Math.PI / 2);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });
        this.rimMesh = new THREE.Mesh(rimGeo, rimMat);
        this.rimMesh.position.set(0, -0.04, 0);
        this.fieldGroup.add(this.rimMesh);
    }

    updateCursor(camera, mouseNDC) {
        this.raycaster.setFromCamera(mouseNDC, camera);
        const intersectionPoint = new THREE.Vector3();

        if (this.raycaster.ray.intersectPlane(this.raycastPlane, intersectionPoint)) {
            const maxFieldRadius = this.rings * this.hexRadius * 1.8;
            const distFromCenter = Math.hypot(intersectionPoint.x, intersectionPoint.z);

            if (distFromCenter <= maxFieldRadius + 2.0) {
                this.isCursorOnField = true;
                this.cursorVelocity.subVectors(intersectionPoint, this.cursorWorld);
                this.cursorWorld.copy(intersectionPoint);
                return;
            }
        }
        this.isCursorOnField = false;
        this.cursorWorld.set(9999, 0, 9999);
    }

    triggerRipple(power = 1.0) {
        const origin = this.isCursorOnField ? this.cursorWorld.clone() : new THREE.Vector3(0, 0, 0);
        this.ripples.push({
            origin,
            startTime: performance.now() / 1000,
            amplitude: 1.6 * power,
            speed: 16.0,
            wavelength: 1.4,
            decay: 1.8,
            maxTime: 2.8
        });

        if (this.sound) {
            this.sound.playRippleImpulse(power);
        }
    }

    update(time, dt) {
        const step = Math.min(dt, 0.04);
        const now = time;
        const isDancing = this.motionMode !== 'interactive';

        // Clean expired ripples
        this.ripples = this.ripples.filter(r => (now - r.startTime) < r.maxTime);

        let highestActiveElevation = 0;
        let elevatedCount = 0;
        const maxHeight = Math.max(0.1, this.waveHeight * 1.25);

        // Access typed arrays directly for blazing fast memory updates
        const matrixArray = this.instancedMesh.instanceMatrix.array;
        const colorArray = this.instancedMesh.instanceColor.array;
        const lut = this.materialManager.getActiveLut();

        // Preset height scale: subtle, gentle undulations (not towering)
        const presetAmp = this.waveHeight * 0.35;

        for (let i = 0; i < this.count; i++) {
            const px = this.posX[i];
            const pz = this.posZ[i];
            const pdist = this.dist[i];
            let target = 0.0;

            // 1. Mouse Cursor Proximity Wave
            if (this.isCursorOnField) {
                const distToMouse = Math.hypot(px - this.cursorWorld.x, pz - this.cursorWorld.z);
                if (distToMouse < this.cursorRadius) {
                    const norm = distToMouse / this.cursorRadius;
                    const factor = 0.5 * (1.0 + Math.cos(Math.PI * norm));
                    const lift = this.waveHeight * factor;
                    target += lift;

                    if (factor > 0.3) {
                        elevatedCount++;
                        if (lift > highestActiveElevation) highestActiveElevation = lift;
                    }
                }
            }

            // 2. Concentric Click Ripples
            for (let r = 0; r < this.ripples.length; r++) {
                const rip = this.ripples[r];
                const age = now - rip.startTime;
                const d = Math.hypot(px - rip.origin.x, pz - rip.origin.z);
                const front = rip.speed * age;
                const diff = d - front;

                if (Math.abs(diff) < rip.wavelength * 2.5) {
                    const decay = Math.exp(-rip.decay * age);
                    const phase = (diff / rip.wavelength) * Math.PI * 2;
                    const val = rip.amplitude * decay * Math.cos(phase) * Math.max(0, 1 - Math.abs(diff) / (rip.wavelength * 2.5));
                    target += Math.max(0, val);
                }
            }

            // 3. Autonomous Dancing Patterns (subtle, less tall)
            if (isDancing) {
                let danceY = 0;
                switch (this.motionMode) {
                    case 'sine_wave': {
                        const wave = Math.sin(px * 0.45 + pz * 0.45 - time * 3.0);
                        danceY = (wave * 0.5 + 0.5) * presetAmp;
                        break;
                    }
                    case 'vortex': {
                        const angle = Math.atan2(pz, px);
                        const spiral = Math.sin(angle * 3.0 - time * 2.8 + pdist * 0.45);
                        danceY = (spiral * 0.5 + 0.5) * presetAmp;
                        break;
                    }
                    case 'perlin_liquid': {
                        const f1 = Math.sin(px * 0.30 + time * 2.0) * Math.cos(pz * 0.30 + time * 1.6);
                        const f2 = Math.sin(px * 0.55 - pz * 0.4 + time * 2.6) * 0.5;
                        danceY = ((f1 + f2 + 1.5) / 3.0) * presetAmp;
                        break;
                    }
                    case 'breathing_heart': {
                        const pulse = Math.sin(pdist * 0.55 - time * 3.8);
                        danceY = Math.pow(Math.max(0, pulse), 2.2) * (presetAmp * 1.1);
                        break;
                    }
                }
                target += danceY;
            }

            // Damped spring oscillator physics
            this.targetY[i] = Math.max(0, target);
            const displacement = this.posY[i] - this.targetY[i];
            const springForce = -this.stiffness * displacement;
            const dampingForce = -this.damping * this.velocity[i];
            const accel = (springForce + dampingForce) / this.mass;

            this.velocity[i] += accel * step;
            this.posY[i] += this.velocity[i] * step;

            if (this.posY[i] < -0.02) {
                this.posY[i] = -0.02;
                this.velocity[i] = Math.max(0, -this.velocity[i] * 0.25);
            }

            // Direct flat memory writes (zero object allocation)
            matrixArray[i * 16 + 13] = this.posY[i];

            // Sample height color
            const normH = Math.min(1.0, Math.max(0.0, this.posY[i] / maxHeight));
            const lutIdx = Math.max(0, Math.min(255, (normH * 255) | 0));
            const col = lut[lutIdx];
            const cIdx = i * 3;
            colorArray[cIdx] = col.r;
            colorArray[cIdx + 1] = col.g;
            colorArray[cIdx + 2] = col.b;
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.instanceColor.needsUpdate = true;

        // Tactile sound: ONLY when mouse is actively moving across field
        if (this.isCursorOnField && this.isMouseMoving && elevatedCount > 0 && this.sound) {
            const speed = this.cursorVelocity.length();
            if (speed > 0.04) {
                this.sound.playPistonSweep(Math.min(1.0, highestActiveElevation / this.waveHeight));
            }
        }

        // Reset velocity so it never lingers when mouse stops moving
        this.cursorVelocity.set(0, 0, 0);
    }

    setPalette(paletteKey) {
        this.materialManager.updatePalette(paletteKey);
        const pal = this.materialManager.getCurrentPalette();
        if (this.basePlateMesh) {
            this.basePlateMesh.material.color.set(pal.basePlate);
        }
    }

    setMotionMode(mode) {
        this.motionMode = mode;
    }
}
