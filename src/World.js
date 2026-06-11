import * as THREE from 'three';
import { CUBE, JUMPER, COLORS, GROUND_Y, PHYSICS } from './constants.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.jumper = null;
    this.cubes = [];
    this.directions = [];
    this.currentIdx = 0;

    this.remotes = new Map();

    this._cubeFaces = new Map();
    this._playerFaceTex = new Map();
    this._playerFacesList = [];

    this._jumperTex   = null;
    this._jumperColor = COLORS.jumper;
    this._jumperName  = '';
    this._myPlayerId  = null;
    this._pendingSelfTex = null;
  }

  configureJumper(tex, color) { this._jumperTex = tex || null; this._jumperColor = color; }
  setJumperName(name) { this._jumperName = name; }
  setMyPlayerId(id) {
    this._myPlayerId = id;
    // Apply pending self texture now that we know our ID
    if (this._pendingSelfTex) {
      this._playerFaceTex.set(id, this._pendingSelfTex);
      this._updateCubeFacesForPlayer(id, this._pendingSelfTex);
      this._pendingSelfTex = null;
    }
  }

  loadSharedCubes(cubeData, dirData, mode, finishIdx, faceAssignments, playerFaces) {
    while (this.cubes.length) {
      const c = this.cubes.pop();
      this._disposeMaterials(c.material);
      c.geometry.dispose();
      this.scene.remove(c);
    }
    this.directions.length = 0;
    this._cubeFaces.clear();
    this._playerFacesList = playerFaces || [];
    for (let i = 0; i < cubeData.length; i++) {
      const { x, y, z } = cubeData[i];
      const geo = new THREE.BoxGeometry(CUBE.width, CUBE.height, CUBE.depth);
      let mats;
      if (mode === 'race' && i === finishIdx) {
        mats = this._makeFinishMats();
      } else if (faceAssignments && faceAssignments[i] !== undefined) {
        const faceIndex = faceAssignments[i];
        const pf = this._playerFacesList[faceIndex];
        const pid = pf ? pf.id : null;
        mats = this._makeCubeMats(1);
        mats[2] = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
        if (pid !== null) this._cubeFaces.set(i, pid);
      } else {
        mats = this._makeCubeMats(1);
      }
      const cube = new THREE.Mesh(geo, mats);
      cube.position.set(x, y || 0, z);
      this.cubes.push(cube);
      this.scene.add(cube);
      if (i > 0) this.directions.push(dirData[i - 1]);
    }
    this.currentIdx = 0;
    // Re-apply pending textures
    for (const [pid, texDataURL] of this._playerFaceTex) {
      this._updateCubeFacesForPlayer(pid, texDataURL);
    }
  }

  init() { this._createJumper(); }
  get currentDir() { return this.directions[this.currentIdx] || 'left'; }
  ensureAhead(idx) {}
  advance(steps) { this.currentIdx += steps; }

  updateFades() {
    const visStart = Math.max(0, this.currentIdx - 2);
    const visEnd   = this.currentIdx + 3;
    for (let i = 0; i < this.cubes.length; i++) {
      const target = (i >= visStart && i <= visEnd) ? 1 : 0;
      this._setGroupOpacity(this.cubes[i].material, target);
    }
  }

  reset() {
    while (this.cubes.length) {
      const c = this.cubes.pop();
      this._disposeMaterials(c.material);
      c.geometry.dispose();
      this.scene.remove(c);
    }
    this.directions.length = 0;
    for (const [, remote] of this.remotes) {
      this._disposeMaterials(remote.mesh.material);
      remote.mesh.geometry.dispose();
      this.scene.remove(remote.mesh);
    }
    this.remotes.clear();
  }

  addOrUpdateRemote(id, colorHex, texData, name) {
    let remote = this.remotes.get(id);
    if (!remote) {
      const r = JUMPER.width / 2;
      const geo = new THREE.CylinderGeometry(r, r, JUMPER.height, 32);
      geo.translate(0, JUMPER.height / 2, 0);
      const color = new THREE.Color(colorHex);
      const side = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.6 });
      const bottom = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.6 });
      let topMat;
      if (texData) {
        const img = new Image(); img.src = texData;
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.center.set(0.5, 0.5); tex.rotation = 2 * Math.PI / 3;
        img.onload = () => { tex.needsUpdate = true; };
        topMat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.6 });
      } else {
        topMat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.6 });
      }
      const mats = [side, topMat, bottom];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.add(this._makeNameSprite(name || '', colorHex, 0.6));
      this.scene.add(mesh);
      remote = { mesh, color: colorHex, targetPos: new THREE.Vector3(), targetRot: new THREE.Vector3(), targetScaleY: 1 };
      this.remotes.set(id, remote);
      if (texData) { this._playerFaceTex.set(id, texData); this._updateCubeFacesForPlayer(id, texData); }
      return remote;
    }
    if (remote.name !== name) {
      remote.name = name;
      const oldSprite = remote.mesh.children.find(c => c.isSprite);
      if (oldSprite) remote.mesh.remove(oldSprite);
      if (name) remote.mesh.add(this._makeNameSprite(name, colorHex, 0.6));
    }
    if (remote.color !== colorHex) {
      const mats = Array.isArray(remote.mesh.material) ? remote.mesh.material : [remote.mesh.material];
      for (const m of mats) { if (!m.map) m.color.set(colorHex); }
      remote.color = colorHex;
    }
    if (texData && remote._faceTexApplied !== texData) {
      remote._faceTexApplied = texData;
      this._updateCubeFacesForPlayer(id, texData);
    }
    return remote;
  }

  _updateCubeFacesForPlayer(playerId, texDataURL) {
    const img = new Image(); img.src = texDataURL;
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.center.set(0.5, 0.5); tex.rotation = 2 * Math.PI / 3; tex.needsUpdate = true;
      for (const [cubeIdx, pid] of this._cubeFaces) {
        if (pid === playerId && cubeIdx < this.cubes.length) {
          const mats = this.cubes[cubeIdx].material;
          mats[2] = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 1 });
        }
      }
    };
  }

  setSelfFaceTex(texDataURL) {
    if (this._myPlayerId) {
      this._playerFaceTex.set(this._myPlayerId, texDataURL);
      this._updateCubeFacesForPlayer(this._myPlayerId, texDataURL);
    } else {
      this._pendingSelfTex = texDataURL;
    }
  }

  updatePlayerFaceId(oldId, newId) {
    for (const [cubeIdx, pid] of this._cubeFaces) { if (pid === oldId) this._cubeFaces.set(cubeIdx, newId); }
    for (const pf of this._playerFacesList) { if (pf && pf.id === oldId) pf.id = newId; }
  }

  updateRemoteState(id, state) {
    const remote = this.remotes.get(id);
    if (!remote) return;

    const isFalling = state.state === 'falling' || state.state === 'gameover';
    if (isFalling && !remote._falling) {
      remote._falling = true;
      remote._fallStartY = remote.targetPos.y;
      const dx = state.pos.x - remote.targetPos.x;
      const dz = state.pos.z - remote.targetPos.z;
      const absDx = Math.abs(dx), absDz = Math.abs(dz);
      remote._fallMoveAxis = absDz > absDx ? 'z' : 'x';
      remote._fallOutSign = (remote._fallMoveAxis === 'x' ? dx : dz) >= 0 ? 1 : -1;
      remote._fallTimer = 0;
    } else if (!isFalling && remote._falling) {
      // Respawned or recovered — resume normal lerp
      remote._falling = false;
    }

    remote.targetPos.set(state.pos.x, state.pos.y, state.pos.z);
    remote.targetRot.set(state.rot.x, state.rot.y, state.rot.z);
    remote.targetScaleY = state.scaleY;
    remote._remoteState = state.state;
  }

  lerpRemotes(dt) {
    if (this.remotes.size === 0) return;
    const t = 0.4;
    for (const remote of this.remotes.values()) {
      const m = remote.mesh; if (!m) continue;

      if (remote._falling) {
        // ── Local fall animation — slide outward + drop ──
        remote._fallTimer += dt;
        if (m.position.y > GROUND_Y) {
          // Slide outward
          m.position[remote._fallMoveAxis] += remote._fallOutSign * 0.06;
          // Drop
          m.position.y -= PHYSICS.fallSpeed;
        } else {
          m.position.y = GROUND_Y;
          remote._falling = false; // animation complete
        }
      } else {
        // ── Normal lerp ──
        m.position.x += (remote.targetPos.x - m.position.x) * t;
        m.position.y += (remote.targetPos.y - m.position.y) * t;
        m.position.z += (remote.targetPos.z - m.position.z) * t;
        m.scale.y += (remote.targetScaleY - m.scale.y) * t;
      }
    }
  }

  /** Call every frame — sync name sprite to jumper's world position. */
  updateNameSprite() {
    if (!this._nameSprite || !this.jumper) return;
    this._nameSprite.position.copy(this.jumper.position);
    this._nameSprite.position.y += JUMPER.height + 0.6;
  }

  removeRemote(id) {
    const remote = this.remotes.get(id);
    if (!remote) return;
    this._disposeMaterials(remote.mesh.material);
    remote.mesh.geometry.dispose();
    this.scene.remove(remote.mesh);
    this.remotes.delete(id);
  }

  _makeCubeMats(opacity) {
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.cube, transparent: true, opacity });
    return [mat.clone(), mat.clone(), mat.clone(), mat.clone(), mat.clone(), mat.clone()];
  }

  _makeFinishMats() {
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, transparent: true, opacity: 1 });
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    const check = new THREE.MeshLambertMaterial({ color: 0x000000, transparent: true, opacity: 1 });
    return [dark.clone(), check.clone(), white.clone(), dark.clone(), check.clone(), dark.clone()];
  }

  _makeJumperMats() {
    const color = new THREE.Color(this._jumperColor);
    const side = new THREE.MeshLambertMaterial({ color });
    const bottom = new THREE.MeshLambertMaterial({ color });
    const top = this._jumperTex ? new THREE.MeshLambertMaterial({ map: this._jumperTex, color: 0xffffff }) : new THREE.MeshLambertMaterial({ color });
    return [side, top, bottom];
  }

  _makeNameSprite(name, colorHex, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 6;
    ctx.strokeText(name, 128, 32);
    ctx.fillStyle = '#ffffff'; ctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 0.55, 1);
    sprite.position.set(0, JUMPER.height + 0.5, 0);
    return sprite;
  }

  _setGroupOpacity(mats, target) {
    const arr = Array.isArray(mats) ? mats : [mats];
    for (const m of arr) {
      if (!m.transparent) m.transparent = true;
      const cur = m.opacity;
      if (Math.abs(target - cur) < 0.002) m.opacity = target;
      else m.opacity += (target - cur) * 0.12;
    }
  }

  _disposeMaterials(mats) { const arr = Array.isArray(mats) ? mats : [mats]; for (const m of arr) m.dispose(); }

  _createJumper() {
    if (this.jumper) { this._disposeMaterials(this.jumper.material); this.scene.remove(this.jumper); }
    // Remove old name sprite from scene
    if (this._nameSprite) { this.scene.remove(this._nameSprite); this._nameSprite = null; }
    const r = JUMPER.width / 2;
    const geo = new THREE.CylinderGeometry(r, r, JUMPER.height, 32);
    geo.translate(0, JUMPER.height / 2, 0);
    const mats = this._makeJumperMats();
    this.jumper = new THREE.Mesh(geo, mats);
    // Name sprite as independent scene object — not a child of the mesh (avoids scale inheritance)
    if (this._jumperName) {
      this._nameSprite = this._makeNameSprite(this._jumperName, '#ffffff', 1);
      this.scene.add(this._nameSprite);
    }
    if (this.cubes.length) this.jumper.position.copy(this.cubes[0].position);
    this.jumper.position.y = JUMPER.startY;
    this.scene.add(this.jumper);
  }
}
