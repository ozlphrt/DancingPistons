import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { MaterialManager } from './scene/Materials.js';
import { SoundEffects } from './audio/SoundEffects.js';
import { PistonField } from './simulation/PistonField.js';

class DancingPistonsApp {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.clock = new THREE.Clock();

        this.mouseNDC = new THREE.Vector2(9999, 9999);
        this.isMouseDown = false;
        this.mouseDownPos = { x: 0, y: 0 };
        this.dragThreshold = 6; // px to distinguish click vs orbit drag

        // FPS calculation
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.fpsElement = document.getElementById('stat-fps');

        this._initSystems();
        this._initEvents();
        this._initUI();

        this._animate = this._animate.bind(this);
        requestAnimationFrame(this._animate);
    }

    _initSystems() {
        this.sceneManager = new SceneManager(this.container);
        this.materialManager = new MaterialManager();
        this.sound = new SoundEffects();

        this.isMouseMoving = false;
        this.lastMouseMoveTime = 0;

        // 77 rings = 18,019 hexagonal pistons (10X denser grid)
        this.pistonField = new PistonField(
            this.sceneManager.scene,
            this.materialManager,
            this.sound,
            {
                hexRadius: 0.134,
                hexGap: 0.012,
                rings: 77,
                cursorRadius: 3.0,
                waveHeight: 1.2,
                motionMode: 'interactive'
            }
        );

        const countElem = document.getElementById('stat-piston-count');
        if (countElem) {
            countElem.textContent = this.pistonField.count.toLocaleString();
        }

        const paletteNameBadge = document.getElementById('current-palette-name');
        if (paletteNameBadge) {
            paletteNameBadge.textContent = this.materialManager.getCurrentPalette().name;
        }

        // Apply initial theme
        this.sceneManager.updatePaletteTheme(this.materialManager.getCurrentPalette());
    }

    _initEvents() {
        // Track mouse position over canvas
        const updateCoords = (clientX, clientY) => {
            const rect = this.container.getBoundingClientRect();
            this.mouseNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            this.mouseNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            this.pistonField.updateCursor(this.sceneManager.camera, this.mouseNDC);
        };

        window.addEventListener('mousemove', (e) => {
            this.isMouseMoving = true;
            this.lastMouseMoveTime = performance.now();
            updateCoords(e.clientX, e.clientY);
        });

        window.addEventListener('mousedown', (e) => {
            // Ignore clicks on UI overlay
            if (e.target.closest('.interactive')) return;
            this.isMouseDown = true;
            this.mouseDownPos = { x: e.clientX, y: e.clientY };
            updateCoords(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', (e) => {
            if (this.isMouseDown) {
                const distMoved = Math.hypot(e.clientX - this.mouseDownPos.x, e.clientY - this.mouseDownPos.y);
                // If user tapped without dragging camera, trigger tactile shockwave ripple
                if (distMoved < this.dragThreshold) {
                    this.pistonField.triggerRipple(1.0);
                }
            }
            this.isMouseDown = false;
        });

        // Touch support for mobile / touch devices
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                updateCoords(touch.clientX, touch.clientY);
            }
        }, { passive: true });

        window.addEventListener('touchstart', (e) => {
            if (e.target.closest('.interactive')) return;
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                updateCoords(touch.clientX, touch.clientY);
                this.pistonField.triggerRipple(0.85);
            }
        }, { passive: true });

        // When mouse leaves window, reset cursor off-field
        document.addEventListener('mouseleave', () => {
            this.mouseNDC.set(9999, 9999);
            this.pistonField.updateCursor(this.sceneManager.camera, this.mouseNDC);
        });
    }

    _initUI() {
        // 1. Motion Mode Selector Buttons
        const modeButtons = document.querySelectorAll('.mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const mode = target.dataset.mode;
                modeButtons.forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                this.pistonField.setMotionMode(mode);
                this.sound.playClick(2600, 0.2);
            });
        });

        // 2. Tactile ASMR Sound Toggle Button
        const audioBtn = document.getElementById('audio-toggle-btn');
        const audioIcon = document.getElementById('audio-icon');
        const audioLabel = document.getElementById('audio-label');

        const updateAudioUI = () => {
            if (audioIcon) audioIcon.textContent = this.sound.getIcon();
            if (audioLabel) audioLabel.textContent = this.sound.getLabel();
            if (audioBtn) {
                if (this.sound.enabled) audioBtn.classList.add('active');
                else audioBtn.classList.remove('active');
            }
        };
        updateAudioUI();

        if (audioBtn) {
            audioBtn.addEventListener('click', () => {
                this.sound.cycleMode();
                updateAudioUI();
            });
        }

        // 3. Reset Camera Button
        const resetBtn = document.getElementById('camera-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.sceneManager.resetCamera();
                this.sound.playClick(2200, 0.2);
            });
        }

        // 4. Palette Selector Chips
        const paletteChips = document.querySelectorAll('.palette-chip');
        const paletteNameBadge = document.getElementById('current-palette-name');

        paletteChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const palKey = target.dataset.palette;
                paletteChips.forEach(c => c.classList.remove('active'));
                target.classList.add('active');

                this.pistonField.setPalette(palKey);
                const currentPal = this.materialManager.getCurrentPalette();
                this.sceneManager.updatePaletteTheme(currentPal);

                if (paletteNameBadge) {
                    paletteNameBadge.textContent = currentPal.name;
                }
                this.sound.playClick(2400, 0.22);
            });
        });

        // 5. Sliders
        const waveSlider = document.getElementById('slider-wave-height');
        const waveVal = document.getElementById('val-wave-height');
        if (waveSlider) {
            waveSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.pistonField.waveHeight = val;
                if (waveVal) waveVal.textContent = val.toFixed(1);
            });
        }

        const cursorSlider = document.getElementById('slider-cursor-radius');
        const cursorVal = document.getElementById('val-cursor-radius');
        if (cursorSlider) {
            cursorSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.pistonField.cursorRadius = val;
                if (cursorVal) cursorVal.textContent = val.toFixed(1);
            });
        }

        const stiffSlider = document.getElementById('slider-stiffness');
        const stiffVal = document.getElementById('val-stiffness');
        if (stiffSlider) {
            stiffSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.pistonField.stiffness = val;
                if (stiffVal) stiffVal.textContent = Math.round(val);
            });
        }
    }

    _updateFps() {
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= 500) {
            const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            if (this.fpsElement) {
                this.fpsElement.textContent = fps;
            }
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    _animate() {
        requestAnimationFrame(this._animate);

        const dt = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        // Gated mouse moving check (stops sound if mouse pauses for > 60ms)
        if (performance.now() - this.lastMouseMoveTime > 60) {
            this.isMouseMoving = false;
        }
        this.pistonField.isMouseMoving = this.isMouseMoving;

        this.pistonField.update(elapsedTime, dt);
        this.sceneManager.render();
        this._updateFps();
    }
}

// Bootstrap once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    new DancingPistonsApp();
});
