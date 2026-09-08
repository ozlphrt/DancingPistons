import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
    /**
     * @param {HTMLElement} container 
     * @param {Object} options
     */
    constructor(container, options = {}) {
        this.container = container;
        this.width = container.clientWidth || window.innerWidth;
        this.height = container.clientHeight || window.innerHeight;

        this._initScene();
        this._initCamera();
        this._initRenderer();
        this._initLighting();
        this._initStudioDome();
        this._initControls();
        this._initResizeListener();
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x080c14);
    }

    _initCamera() {
        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        // Cinematic elevated 3/4 perspective overlooking the hex field
        this.camera.position.set(13, 15, 19);
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // High fidelity PCF soft shadows
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // ACES Filmic Tone Mapping for rich specular highlights
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;

        this.container.appendChild(this.renderer.domElement);
    }

    /**
     * Studio lighting rig adapted directly from SUM10:
     * - Hemisphere natural studio bounce
     * - Warm ambient baseline
     * - Warm Key light with PCF soft shadows
     * - Cool Rim light catching beveled chamfers
     */
    _initLighting() {
        // 1. Natural Studio Hemisphere Fill Light
        this.hemiLight = new THREE.HemisphereLight(0xf8fafc, 0xe2e8f0, 0.65);
        this.scene.add(this.hemiLight);

        // 2. Subtle Warm Ambient Fill
        this.ambientLight = new THREE.AmbientLight(0xfffbf5, 0.35);
        this.scene.add(this.ambientLight);

        // 3. Warm Directional Key Light with Soft PCF Shadows
        this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
        this.dirLight.position.set(18, 28, 18);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 70;
        this.dirLight.shadow.camera.left = -18;
        this.dirLight.shadow.camera.right = 18;
        this.dirLight.shadow.camera.top = 18;
        this.dirLight.shadow.camera.bottom = -18;
        this.dirLight.shadow.bias = -0.0002;
        this.dirLight.shadow.radius = 2.4;
        this.scene.add(this.dirLight);

        // 4. Secondary Cool Rim Light for Bevel Chamfer Specular Definition
        this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.60);
        this.rimLight.position.set(-18, 16, -18);
        this.scene.add(this.rimLight);
    }

    /**
     * Surrounding Studio Dome Sphere with gradient & ambient atmosphere
     * (SUM10 celestial globe dome technique).
     */
    _initStudioDome() {
        const radius = 250;
        const globeGeo = new THREE.SphereGeometry(radius, 48, 32);

        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#04070e');
        grad.addColorStop(0.5, '#0b1322');
        grad.addColorStop(1, '#020408');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle soft celestial / studio dust specks
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const r = Math.random() * 1.5;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        const globeMat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
            depthWrite: false
        });

        this.studioDome = new THREE.Mesh(globeGeo, globeMat);
        this.scene.add(this.studioDome);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);
        this.controls.minDistance = 6;
        this.controls.maxDistance = 55;
        // Limit pitch so camera doesn't flip underneath the ground
        this.controls.maxPolarAngle = Math.PI / 2.05;
    }

    _initResizeListener() {
        window.addEventListener('resize', () => {
            this.width = this.container.clientWidth || window.innerWidth;
            this.height = this.container.clientHeight || window.innerHeight;

            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(this.width, this.height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        });
    }

    /**
     * Updates lighting colors to harmonize with selected palette
     */
    updatePaletteTheme(palette) {
        if (palette.bg) {
            this.scene.background.set(palette.bg);
        }
        if (palette.rimColor && this.rimLight) {
            this.rimLight.color.set(palette.rimColor);
        }
    }

    resetCamera() {
        this.camera.position.set(13, 15, 19);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
