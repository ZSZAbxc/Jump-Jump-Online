import * as THREE from 'three';
import { CUBE, JUMPER, COLORS, GROUND_Y, PHYSICS } from './constants.js';
import { Physics } from './Physics.js';

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
    for (const [pid, texDataURL] of this._playerFaceTex) {
      this._updateCubeFacesForPlayer(pid, texDataURL);
    }
  }

  init() { this._createJumper(); }
  get currentDir() { return this.directions[this.currentIdx] || 'left'; }
  ensureAhead(idx) {}
  advance(steps) { this.currentIdx += steps; }

  updateFades() {
    const vs = Math.max(0, this.currentIdx - 2);
    const ve = this.currentIdx + 3;
    for (let i = 0; i < this.cubes.length; i++) {
      const tgt = (i >= vs && i <= ve) ? 1 : 0;
      this._setGroupOpacity(this.cubes[i].material, tgt);
    }
  }

  reset() {
    while (this.cubes.length) { const c = this.cubes.pop(); this._disposeMaterials(c.material); c.geometry.dispose(); this.scene.remove(c); }
    this.directions.length = 0;
    for (const [, remote] of this.remotes) { this._disposeMaterials(remote.mesh.material); remote.mesh.geometry.dispose(); this.scene.remove(remote.mesh); }
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
      } else { topMat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.6 }); }
      const mats = [side, topMat, bottom];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.add(this._makeNameSprite(name || '', colorHex, 0.6));
      this.scene.add(mesh);
      remote = { mesh, color: colorHex, name, targetPos: new THREE.Vector3(), targetRot: new THREE.Vector3(), targetScaleY: 1, sim: null, serverPos: null, _simIdx: 0 };
      this.remotes.set(id, remote);
      if (texData) { this._playerFaceTex.set(id, texData); this._updateCubeFacesForPlayer(id, texData); }
      return remote;
    }
    if (remote.name !== name) {
      remote.name = name;
      const oldS = remote.mesh.children.find(c => c.isSprite);
      if (oldS) remote.mesh.remove(oldS);
      if (name) remote.mesh.add(this._makeNameSprite(name, colorHex, 0.6));
    }
    if (remote.color !== colorHex) {
      const mats = Array.isArray(remote.mesh.material) ? remote.mesh.material : [remote.mesh.material];
      for (const m of mats) { if (!m.map) m.color.set(colorHex); }
      remote.color = colorHex;
    }
    if (texData && remote._faceTexApplied !== texData) { remote._faceTexApplied = texData; this._updateCubeFacesForPlayer(id, texData); }
    return remote;
  }

  _updateCubeFacesForPlayer(pId, texURL) {
    const img = new Image(); img.src = texURL;
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace; tex.center.set(0.5, 0.5); tex.rotation = 2 * Math.PI / 3; tex.needsUpdate = true;
      for (const [ci, pid] of this._cubeFaces) {
        if (pid === pId && ci < this.cubes.length) {
          const mats = this.cubes[ci].material;
          mats[2] = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 1 });
        }
      }
    };
  }

  setSelfFaceTex(texURL) {
    if (this._myPlayerId) { this._playerFaceTex.set(this._myPlayerId, texURL); this._updateCubeFacesForPlayer(this._myPlayerId, texURL); }
    else this._pendingSelfTex = texURL;
  }

  updatePlayerFaceId(oid, nid) {
    for (const [ci, pid] of this._cubeFaces) { if (pid === oid) this._cubeFaces.set(ci, nid); }
    for (const pf of this._playerFacesList) { if (pf && pf.id === oid) pf.id = nid; }
  }

  /* ================================================================
   *  REMOTE STATE + EVENT-BASED JUMP/FALL
   * ================================================================ */

  updateRemoteState(id, state) {
    if (!state || !state.pos) return;
    const remote = this.remotes.get(id);
    if (!remote) return;

    // Detect falling — start local sim (once only, guarded by _fallDone)
    const isFall = state.state === 'falling' || state.state === 'gameover';
    const isIdle  = state.state === 'idle' || state.state === 'charging';
    if (isFall && !remote.sim && !remote._fallDone) {
      this._startRemoteSim(remote, state);
    }
    // Reset fall guard when player respawns
    if (isIdle) {
      remote._fallDone = false;
      // Respawn: hard-snap to server position then resume lerp
      if (remote._awaitingRespawn && state.pos) {
        remote._awaitingRespawn = false;
        remote.mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
        remote.mesh.scale.set(1, 1, 1);
      }
    }
    // After local jump sim finishes, wait for server landing packet then align
    if (remote._pendingServerSnap && state.pos && !isFall && state.state !== 'jumping') {
      remote._pendingServerSnap = false;
      remote.mesh.position.set(state.pos.x, state.pos.y, state.pos.z);
      remote._simIdx = state.idx ?? remote._simIdx;
    }
    // Track server cube index for landing correction
    if (state.idx != null) remote._serverIdx = state.idx;
    if (state.idx != null && !remote.sim) remote._simIdx = state.idx;
    // Don't kill jump sim mid-flight — it self-destructs on landing
    if (!isFall && remote.sim && remote.sim.type !== 'jump') {
      remote.sim = null;
    }

    // Store server position for correction — guard against empty state
    if (state.pos) {
      remote.serverPos = { x: state.pos.x, y: state.pos.y, z: state.pos.z, scaleY: state.scaleY };
      remote.targetPos.set(state.pos.x, state.pos.y, state.pos.z);
    }
    if (state.rot) {
      remote.targetRot.set(state.rot.x, state.rot.y, state.rot.z);
    }
    if (state.scaleY != null) remote.targetScaleY = state.scaleY;
  }

  /** Remote player started a jump — begin local simulation with their charge power. */
  remoteJumpStart(id, data) {
    const remote = this.remotes.get(id);
    if (!remote) return;
    if (!data || !data.pos) return;
    remote.sim = null;
    // Calculate exact velocities from charge power
    const velX = data.chargePower * 1.3125;
    const velY = PHYSICS.jumpSpeedY + data.chargePower * 2.6;
    const dir   = data.dir || 'left';
    const axis  = dir === 'left' ? 'x' : 'z';

    remote.sim = {
      type: 'jump',
      pos: { x: data.pos.x, y: data.pos.y, z: data.pos.z },
      velX, velY, axis, dir,
      squash: data.scaleY || 1,
      startIdx: remote._simIdx,
    };
    remote.mesh.position.set(data.pos.x, data.pos.y, data.pos.z);
    remote.mesh.scale.set(2 - data.scaleY, data.scaleY, 2 - data.scaleY);
  }

  /** Internal — detect falling and start local sim. */
  _startRemoteSim(remote, state) {
    if (!state || !state.pos) return;
    const dx = state.pos.x - remote.mesh.position.x;
    const dz = state.pos.z - remote.mesh.position.z;
    const absDx = Math.abs(dx), absDz = Math.abs(dz);
    const outAxis = absDz > absDx ? 'z' : 'x';
    const outSign = (outAxis === 'x' ? dx : dz) >= 0 ? 1 : -1;

    remote.sim = {
      type: 'fall',
      pos: { x: remote.mesh.position.x, y: remote.mesh.position.y, z: remote.mesh.position.z },
      axis: outAxis, sign: outSign,
    };
  }

  /* ================================================================
   *  CALLED EVERY PHYSICS TICK
   * ================================================================ */

  tickRemotes() {
    if (this.remotes.size === 0) return;
    for (const remote of this.remotes.values()) {
      const m = remote.mesh; if (!m) continue;
      const sim = remote.sim;

      if (sim && sim.type === 'jump') {
        // ── JUMP: parabolic arc (local sim, no server drift) ──
        m.position[sim.axis] -= sim.velX;
        sim.pos.y += sim.velY;
        sim.velY -= PHYSICS.gravity;
        m.position.y = sim.pos.y;

        // Restore squash
        if (m.scale.y < 1) {
          m.scale.y = Math.min(1, m.scale.y + PHYSICS.releaseSpeed);
          m.scale.x = m.scale.z = 1 + (1 - m.scale.y);
        }
        // Landing: local checkLanding determines outcome (all clients share same cubes)
        if (sim.pos.y <= JUMPER.startY) {
          m.position.y = JUMPER.startY;
          m.scale.set(1, 1, 1);
          const result = Physics.checkLanding(
            m.position.x, m.position.z,
            this.cubes, this.directions, sim.startIdx,
          );
          if (result.location >= 1) {
            // Landed on a forward cube — advance index locally
            remote._simIdx = sim.startIdx + result.location;
            remote.sim = null;
            remote._pendingServerSnap = true; // hold until server confirms
          } else if (result.location === -1) {
            // Fell back on same cube — keep natural x/z
            remote.sim = null;
            remote._pendingServerSnap = true; // hold until server confirms
          } else {
            // Missed everything — start local fall sim
            const dx = m.position.x - (this.cubes[sim.startIdx]?.position.x || 0);
            const dz = m.position.z - (this.cubes[sim.startIdx]?.position.z || 0);
            const outAxis = Math.abs(dz) > Math.abs(dx) ? 'z' : 'x';
            const outSign = (outAxis === 'x' ? dx : dz) >= 0 ? 1 : -1;
            remote.sim = {
              type: 'fall',
              axis: outAxis, sign: outSign,
            };
          }
        }
      } else if (sim && sim.type === 'fall') {
        // ── FALL: slide outward + vertical drop ──
        m.position[sim.axis] += sim.sign * 0.06;
        if (m.position.y > GROUND_Y) m.position.y -= PHYSICS.fallSpeed;
        else {
          m.position.y = GROUND_Y;
          remote.sim = null;
          remote._fallDone = true;
          remote._awaitingRespawn = true;
        }
      } else {
        // ── IDLE / CHARGING (no sim): hold during wait, otherwise lerp ──
        if (remote._awaitingRespawn || remote._pendingServerSnap) {
          // Hold — server will send position and hard-snap in updateRemoteState
        } else {
          m.position.x += (remote.targetPos.x - m.position.x) * 0.4;
          m.position.y += (remote.targetPos.y - m.position.y) * 0.4;
          m.position.z += (remote.targetPos.z - m.position.z) * 0.4;
          const sy = m.scale.y + (remote.targetScaleY - m.scale.y) * 0.4;
          m.scale.y = sy;
          m.scale.x = m.scale.z = 1 + (1 - sy);
        }
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
    const remote = this.remotes.get(id); if (!remote) return;
    this._disposeMaterials(remote.mesh.material); remote.mesh.geometry.dispose();
    this.scene.remove(remote.mesh); this.remotes.delete(id);
  }

  _makeCubeMats(o) { const m = new THREE.MeshLambertMaterial({ color: COLORS.cube, transparent: true, opacity: o }); return [m.clone(),m.clone(),m.clone(),m.clone(),m.clone(),m.clone()]; }
  _makeFinishMats() {
    const d = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, transparent: true, opacity: 1 });
    const w = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    const c = new THREE.MeshLambertMaterial({ color: 0x000000, transparent: true, opacity: 1 });
    return [d.clone(),c.clone(),w.clone(),d.clone(),c.clone(),d.clone()];
  }
  _makeJumperMats() { const col = new THREE.Color(this._jumperColor); const s = new THREE.MeshLambertMaterial({ color: col }); const b = new THREE.MeshLambertMaterial({ color: col }); const t = this._jumperTex ? new THREE.MeshLambertMaterial({ map: this._jumperTex, color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: col }); return [s,t,b]; }
  _makeNameSprite(name, colorHex, opacity) {
    const cvs = document.createElement('canvas'); cvs.width = 256; cvs.height = 64; const ctx = cvs.getContext('2d');
    ctx.font = 'bold 42px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 6; ctx.strokeText(name, 128, 32); ctx.fillStyle = '#ffffff'; ctx.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat); sprite.scale.set(2.6, 0.65, 1); sprite.position.set(0, JUMPER.height + 0.5, 0); return sprite;
  }
  _setGroupOpacity(mats, tgt) { const arr = Array.isArray(mats) ? mats : [mats]; for (const m of arr) { if (!m.transparent) m.transparent = true; const c = m.opacity; if (Math.abs(tgt-c) < 0.002) m.opacity = tgt; else m.opacity += (tgt-c)*0.12; } }
  _disposeMaterials(mats) { const arr = Array.isArray(mats) ? mats : [mats]; for (const m of arr) m.dispose(); }
  _createJumper() { if (this.jumper) { this._disposeMaterials(this.jumper.material); this.scene.remove(this.jumper); } if (this._nameSprite) { this.scene.remove(this._nameSprite); this._nameSprite = null; } const r = JUMPER.width / 2; const geo = new THREE.CylinderGeometry(r, r, JUMPER.height, 32); geo.translate(0, JUMPER.height / 2, 0); const mats = this._makeJumperMats(); this.jumper = new THREE.Mesh(geo, mats); if (this._jumperName) { this._nameSprite = this._makeNameSprite(this._jumperName, '#ffffff', 1); this.scene.add(this._nameSprite); } if (this.cubes.length) this.jumper.position.copy(this.cubes[0].position); this.jumper.position.y = JUMPER.startY; this.scene.add(this.jumper); }
}
