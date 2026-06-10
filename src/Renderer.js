import * as THREE from 'three';
import { COLORS, CAMERA, LIGHTING } from './constants.js';

/**
 * Wraps the Three.js WebGL renderer + scene + camera setup.
 */
export class Renderer {
  constructor() {
    // Camera — orthographic for the isometric "jump-jump" look
    const fs = CAMERA.frustumSize;
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -fs * aspect, fs * aspect,
      fs, -fs,
      0, 5000,
    );
    this.camera.position.set(CAMERA.offset.x, CAMERA.offset.y, CAMERA.offset.z);

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(COLORS.background);
    document.body.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Lights
    const dirLight = new THREE.DirectionalLight(COLORS.directionalLight, LIGHTING.directionalIntensity);
    dirLight.position.set(2, 10, 5);
    this.scene.add(dirLight);

    const ambient = new THREE.AmbientLight(COLORS.ambientLight, LIGHTING.ambientIntensity);
    this.scene.add(ambient);

    // Resize
    window.addEventListener('resize', () => this._onResize());
  }

  get domElement() {
    return this.renderer.domElement;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fs = CAMERA.frustumSize;
    const aspect = w / h;
    this.camera.left = -fs * aspect;
    this.camera.right = fs * aspect;
    this.camera.top = fs;
    this.camera.bottom = -fs;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
