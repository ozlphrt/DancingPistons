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

        // Configuration for 10X denser grid (~1,801 pistons)
        this.hexRadius = options.hexRadius || 0.42;
        this.hexGap = options.hexGap || 0.03;
        this.rings = options.rings || 24; // 1,801 pistons!
        this.cursorRadius = options.cursorRadius || 3.4;
        this.waveHeight = options.waveHeight || 1.8;
        this.motionMode = options.motionMode || 'interactive';

        this.stiffness = 180.0;
        this.damping = 14.0;
        this.mass = 1.0;

        // Interaction state
        this.cursorWorld = new THREE.Vector3(9999, 0, 9999);
        this.lastCursorWorld = new THREE.Vector3(9999, 0, 9999);
        this.cursorVelocity = new THREE.Vector3(0, 0, 0);
        this.isCursorOnField = false;

        this.ripples = [];
        this.raycastPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.raycaster = new THREE.Raycaster();

        this.fieldGroup = new THREE.Group();
        this.scene.add(this.fieldGroup);

        this.dummy = new THREE.Object3D();

        this._buildField();
        this._buildBasePlate();
    }

    _buildField() {
        const grid = new HexGrid(this.hexRadius, this.hexGap);
        const cells = grid.generateGrid(this.rings);
        this.count = cells.length; // Exactly 1,801

        // Preallocate compact typed arrays for spring physics simulation
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

        // 3D Hexagonal Prism geometry with beveled top cap & vertex colors
        this.geometry = createHexPrismGeometry(this.hexRadius - this.hexGap / 2, 2.6, 0.025);

        // High-performance single-draw-call InstancedMesh
        this.instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.materialManager.pistonMaterial,
            this.count
        );

        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.castShadow = true;
        this.instancedMesh.receiveShadow = true;

        // Initialize instance colors
        const restingColor = this.materialManager.sampleHeightColor(0.0);
        for (let i = 0; i < this.count; i++) {
            this.dummy.position.set(this.posX[i], 0, this.posZ[i]);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
            this.instancedMesh.setColorAt(i, restingColor);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }

        this.fieldGroup.add(this.instancedMesh);
    }

    _buildBasePlate() {
        const maxDist = this.rings * this.hexRadius * 1.76;
        const plateGeo = new THREE.CylinderGeometry(maxDist + 0.8, maxDist + 1.4, 0.4, 64);
        this.basePlateMesh = new THREE.Mesh(plateGeo, this.materialManager.baseMaterial);
        this.basePlateMesh.position.set(0, -0.22, 0);
        this.basePlateMesh.receiveShadow = true;
        this.fieldGroup.add(this.basePlateMesh);

        // Sleek outer metallic collar
        const rimGeo = new THREE.TorusGeometry(maxDist + 0.82, 0.08, 16, 64);
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
                this.lastCursorWorld.copy(this.cursorWorld);
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
            amplitude: 2.4 * power,
            speed: 14.0,       // Fast shockwave across 1,800 pistons
            wavelength: 1.8,
            decay: 2.0,
            maxTime: 2.6
        });

        if (this.sound) {
            this.sound.playRippleImpulse(power);
        }
    }

    update(time, dt) {
        const step = Math.min(dt, 0.05);
        const now = time;
        const isDancing = this.motionMode !== 'interactive';

        // Clean expired ripples
        this.ripples = this.ripples.filter(r => (now - r.startTime) < r.maxTime);

        let highestActiveElevation = 0;
        let elevatedCount = 0;
        const maxHeight = Math.max(0.1, this.waveHeight * 1.25);

        for (let i = 0; i < this.count; i++) {
            const px = this.posX[i];
            const pz = this.posZ[i];
            const pdist = this.dist[i];
            let target = 0.0;

            // 1. Mouse Proximity Wave (Smooth bell curve)
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

            // 3. Autonomous Dancing Patterns
            if (isDancing) {
                let danceY = 0;
                switch (this.motionMode) {
                    case 'sine_wave': {
                        const wave = Math.sin(px * 0.45 + pz * 0.45 - time * 3.6);
                        danceY = (wave * 0.5 + 0.5) * this.waveHeight;
                        break;
                    }
                    case 'vortex': {
                        const angle = Math.atan2(pz, px);
                        const spiral = Math.sin(angle * 3.0 - time * 3.2 + pdist * 0.5);
                        danceY = (spiral * 0.5 + 0.5) * this.waveHeight;
                        break;
                    }
                    case 'perlin_liquid': {
                        const f1 = Math.sin(px * 0.35 + time * 2.4) * Math.cos(pz * 0.35 + time * 2.0);
                        const f2 = Math.sin(px * 0.65 - pz * 0.5 + time * 3.2) * 0.5;
                        danceY = ((f1 + f2 + 1.5) / 3.0) * this.waveHeight;
                        break;
                    }
                    case 'breathing_heart': {
                        const pulse = Math.sin(pdist * 0.65 - time * 4.4);
                        danceY = Math.pow(Math.max(0, pulse), 2.2) * (this.waveHeight * 1.15);
                        break;
                    }
                }
                target += danceY;
            }

            // Physics step (damped spring oscillator)
            this.targetY[i] = Math.max(0, target);
            const displacement = this.posY[i] - this.targetY[i];
            const springForce = -this.stiffness * displacement;
            const dampingForce = -this.damping * this.velocity[i];
            const accel = (springForce + dampingForce) / this.mass;

            this.velocity[i] += accel * step;
            this.posY[i] += this.velocity[i] * step;

            if (this.posY[i] < -0.04) {
                this.posY[i] = -0.04;
                this.velocity[i] = Math.max(0, -this.velocity[i] * 0.25);
            }

            // Update InstancedMesh matrix
            this.dummy.position.set(px, this.posY[i], pz);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

            // Dynamically Color-Code Top of Pistons According to Height
            const normalizedHeight = Math.min(1.0, Math.max(0.0, this.posY[i] / maxHeight));
            const heightColor = this.materialManager.sampleHeightColor(normalizedHeight);
            this.instancedMesh.setColorAt(i, heightColor);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }

        // Tactile sound trigger on active cursor brush
        if (this.isCursorOnField && elevatedCount > 0 && this.sound) {
            const speed = this.cursorVelocity.length();
            if (speed > 0.06) {
                this.sound.playPistonSweep(Math.min(1.0, highestActiveElevation / this.waveHeight));
            }
        }
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
