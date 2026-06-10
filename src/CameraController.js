import * as THREE from 'three';
import { CAMERA } from './constants.js';

/**
 * Follows the midpoint of the current cube and the next cube.
 * Camera position moves WITH the target → viewing angle never changes.
 */
export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.current = new THREE.Vector3(0, 0, 0);
    this.target  = new THREE.Vector3(0, 0, 0);
    this.offset  = new THREE.Vector3(CAMERA.offset.x, CAMERA.offset.y, CAMERA.offset.z);
  }

  /**
   * Call EVERY frame.
   * @param {THREE.Mesh[]} cubes
   * @param {number} idx  look at midpoint of cubes[idx] and cubes[idx+1]
   */
  updateTarget(cubes, idx) {
    idx = Math.max(0, Math.min(idx, cubes.length - 2));
    const a = cubes[idx].position;
    const b = cubes[idx + 1].position;
    this.target.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
  }

  /** Lerp current → target AND move camera to keep fixed offset. */
  update() {
    this.current.lerp(this.target, CAMERA.smoothSpeed);
    this.camera.position.set(
      this.current.x + this.offset.x,
      this.offset.y,
      this.current.z + this.offset.z,
    );
    this.camera.lookAt(this.current.x, 0, this.current.z);
  }

  reset() {
    this.current.set(0, 0, 0);
    this.target.set(0, 0, 0);
  }
}
