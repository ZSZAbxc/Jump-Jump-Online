import { GAME_STATES, PHYSICS, JUMPER, CUBE, GROUND_Y } from './constants.js';
import { Physics } from './Physics.js';
import * as THREE from 'three';

export class Game {
  constructor(renderer, world, cameraCtrl, input, ui, network, audioManager) {
    this.renderer   = renderer;
    this.world      = world;
    this.cameraCtrl = cameraCtrl;
    this.input      = input;
    this.ui         = ui;
    this.network    = network;
    this.audioManager = audioManager;

    this.state = GAME_STATES.IDLE;
    this.score = 0;
    this._alive = true;
    this._dead = false;
    this._running = false;
    this._finished = false;
    this._respawnIdx = 0;

    this._chargePower  = 0;
    this._jumpVelX     = 0;
    this._jumpVelY     = 0;
    this._hasLaunched  = false;

    this._fallMode    = 'tip';
    this._fallEnded   = false;
    this._tipAxis     = 'x';
    this._tipOutSign  = 1;

    this._transitionSteps = 0;

    this._myColorHex = '#232323';
    this._serverTime = 0;
    this._serverClockOffset = 0;
    this._timeEndMs = 0;

    this._syncTimer = 0;
    this._texSynced = false;
    this._texDataURL = null;
    this._chargeAudioURL = null;
    this._jumpAudioURL = null;
    this._chargeHandle = null; // active charge sound handle

    // Fixed timestep: run at most N physics ticks per frame
    this._physAccum = 0;
    this._physStep = 1 / 60;

    // Mode
    this._mode = 'race';
    this._modeParam = 100;
    this._respawnTimer = 0;

    // Timed mode countdown
    this._timeRunning = false;

    // Track all players for leaderboard / race bar
    this._remotePlayers = new Map();
    this._myName = '玩家';

    input.onChargeStart(() => this._onPress());
    input.onChargeEnd(() => this._onRelease());
    ui.onRestart(() => this.restart());
  }

  /* ================================================================
   *  PUBLIC
   * ================================================================ */

  setMode(mode, param) {
    this._mode = mode;
    this._modeParam = param;
  }

  setServerTime(serverTime) {
    this._serverTime = serverTime;
    this._serverClockOffset = Date.now() - serverTime;
  }

  setMyName(name) { this._myName = name; }
  setMyColorHex(hex) { this._myColorHex = hex; }

  restoreReconnectState(data) {
    this.ui.hideGameOver();
    this.ui.hideGameInfo();
    this.world.loadSharedCubes(data.cubes, data.dirs, data.mode, data.modeParam, data.faceAssignments, data.playerFaces);
    this.setMode(data.mode, data.modeParam);
    this.setServerTime(data.serverTime);

    for (const [id] of this.world.remotes) this.world.removeRemote(id);
    this._remotePlayers.clear();

    const myPlayer = data.players.find(p => p.socketId === data.playerId);
    const myIdx = myPlayer ? myPlayer.idx : 0;
    this.score = myPlayer ? myPlayer.score : 0;

    for (const p of data.players) {
      if (p.socketId === data.playerId) continue;
      if (p.offline) continue;
      this._remotePlayers.set(p.socketId, {
        name: p.name, color: p.color, score: p.score, idx: p.idx, texURL: null,
      });
    }

    this.world.init();
    this.world.currentIdx = myIdx;
    const cube = this.world.cubes[myIdx];
    this.world.jumper.position.x = cube.position.x;
    this.world.jumper.position.z = cube.position.z;
    this.world.jumper.position.y = JUMPER.startY;
    this.world.jumper.rotation.set(0, 0, 0);
    this.world.jumper.scale.set(1, 1, 1);

    this.cameraCtrl.reset();
    this.cameraCtrl.updateTarget(this.world.cubes, myIdx);

    this._alive = true;
    this._dead = false;
    this._finished = false;
    this._respawnIdx = myIdx;
    this._chargePower = 0;
    this._transitionSteps = 0;
    this._respawnTimer = 0;
    this._fallEnded = false;
    this._texSynced = false;
    this.state = GAME_STATES.IDLE;
    this.input.enable();
    this.ui.updateScore(this.score);

    if (this._mode === 'race') {
      this.ui.showRaceBar(); this.ui.hideTimedLeaderboard();
      this.ui.showGameInfo(`🏁 终点第 ${this._modeParam} 格`);
    } else {
      this._timeEndMs = this._serverTime + this._modeParam * 1000;
      this._timeRunning = true;
      this.ui.hideRaceBar(); this.ui.showTimedLeaderboard();
      this.ui.showGameInfo(`⏱ ${this._modeParam}s`);
    }
    this.ui.showRelativeBar();

    if (this._texDataURL) this.world.setSelfFaceTex(this._texDataURL);

    if (!this._running) { this._running = true; this._loop(); }
  }

  start() {
    if (!this.world.jumper) this.world.init();
    this.world.jumper.position.copy(this.world.cubes[0].position);
    this.world.jumper.position.y = JUMPER.startY;
    this.world.jumper.rotation.set(0, 0, 0);
    this.world.jumper.scale.set(1, 1, 1);
    this.world.currentIdx = 0;

    this.cameraCtrl.updateTarget(this.world.cubes, 0);
    this.ui.updateScore(0);
    this._alive = true;
    this._dead = false;
    this._finished = false;
    this._respawnIdx = 0;

    if (this._mode === 'race') {
      this.ui.showGameInfo(`🏁 终点第 ${this._modeParam} 格`);
      this.ui.showRaceBar(); this.ui.hideTimedLeaderboard();
    } else {
      this._timeEndMs = this._serverTime + this._modeParam * 1000;
      this._timeRunning = true;
      this.ui.showGameInfo(`⏱ ${this._modeParam}s`);
      this.ui.hideRaceBar(); this.ui.showTimedLeaderboard();
    }
    this.ui.showRelativeBar();

    if (!this._running) { this._running = true; this._loop(); }
    this.network?.sendIdx(0);
    this.world.updateNameSprite();
  }

  restart() {
    this.ui.hideGameOver();
    this.ui.hideGameInfo();
    this.ui.hideRaceBar();
    this.ui.hideTimedLeaderboard();
    this.ui.hideRelativeBar();

    for (const [id] of this.world.remotes) this.world.removeRemote(id);
    this._remotePlayers.clear();

    if (!this.world.jumper) this.world.init();
    this.world.currentIdx = 0;
    this.world.jumper.position.copy(this.world.cubes[0].position);
    this.world.jumper.position.y = JUMPER.startY;
    this.world.jumper.rotation.set(0, 0, 0);
    this.world.jumper.scale.set(1, 1, 1);

    this.cameraCtrl.reset();
    this.cameraCtrl.updateTarget(this.world.cubes, 0);

    this.score = 0;
    this.ui.updateScore(0);
    this.state = GAME_STATES.IDLE;
    this._chargePower = 0;
    this._transitionSteps = 0;
    this._alive = true;
    this._dead = false;
    this._finished = false;
    this._respawnIdx = 0;
    this.input.enable();
    this._fallEnded = false;
    this._respawnTimer = 0;
    this._timeRunning = this._mode === 'timed';
    this._texSynced = false;

    if (this._mode === 'race') {
      this.ui.showGameInfo(`🏁 赛跑 — 终点第 ${this._modeParam} 格`);
    } else if (this._timeRunning) {
      this.ui.showGameInfo(`⏱ ${this._modeParam}s`);
    }

    if (this._timeRunning) {
      this._timeEndMs = this._serverTime + this._modeParam * 1000;
    }
  }

  /* ================================================================
   *  MAIN LOOP
   * ================================================================ */

  _loop() {
    requestAnimationFrame(() => this._loop());

    // ── Fixed-timestep physics (60Hz, clock-driven, not frame-driven) ──
    const now = performance.now();
    const dt = this._lastPhysTime ? (now - this._lastPhysTime) / 1000 : this._physStep;
    this._lastPhysTime = now;
    this._physAccum += dt;

    // Run physics at 60Hz. On slow hardware, catch up (up to 120 ticks / 2s behind).
    for (let i = 0; i < 120 && this._physAccum >= this._physStep; i++) {
      this._physAccum -= this._physStep;

      // Timed countdown — uses server clock, runs once per frame
      if (i === 0 && this._timeRunning) {
        const serverNow = Date.now() - this._serverClockOffset;
        const remaining = Math.max(0, (this._timeEndMs - serverNow) / 1000);
        this.ui.updateGameInfo(`⏱ ${Math.ceil(remaining)}s` +
          (this.score ? ` — ${this.score}分` : ''));
        if (remaining <= 0) {
          this._timeRunning = false; this.input.disable();
          this.network?.sendTimeUp(this.score);
          this._finished = true; break;
        }
      }

      // Respawn timer — only one tick allowed
      if (this._respawnTimer > 0) {
        this._respawnTimer -= this._physStep;
        if (this._respawnTimer <= 0) { this._respawnTimer = 0; this._doRespawn(); }
        this.world.tickRemotes();
        this.world.tickChatBubbles();
        this.world.updateNameSprite();
        break;
      }

      // Core physics update (one tick)
      if (!this._dead || !this._fallEnded || this._respawnTimer > 0) {
        switch (this.state) {
          case GAME_STATES.CHARGING:      this._updateCharging();      break;
          case GAME_STATES.JUMPING:       this._updateJumping();       break;
          case GAME_STATES.TRANSITIONING: this._updateTransitioning(); break;
          case GAME_STATES.FALLING:       this._updateFalling();       break;
          default: break;
        }
      }
      // Remote prediction + name sync: once per physics tick = 60Hz invariant
      this.world.tickRemotes();
      this.world.tickChatBubbles();
      this.world.updateNameSprite();
    }

    if (this._finished) { this._physAccum = 0; return; }

    // ── Visual passes (always run, regardless of physics ticks) ──
    this.cameraCtrl.updateTarget(this.world.cubes, this.world.currentIdx);
    this.cameraCtrl.update();
    this.world.updateFades();
    this._syncState();
    this._updateModeUI();
    if (this.audioManager) {
      this.audioManager.setMyIdx(this.world.currentIdx);
      this.audioManager.updateRemoteVolumes();
    }
    this.renderer.render();
  }

  _update() {
    // kept for API compatibility — not used directly
    if (this._dead && this._fallEnded && this._respawnTimer <= 0) return;
    switch (this.state) {
      case GAME_STATES.CHARGING:      this._updateCharging();      break;
      case GAME_STATES.JUMPING:       this._updateJumping();       break;
      case GAME_STATES.TRANSITIONING: this._updateTransitioning(); break;
      case GAME_STATES.FALLING:       this._updateFalling();       break;
      default: break;
    }
  }

  _syncState() {
    if (this._dead || this._finished) return;
    if (!this.network || !this.network.roomId) return;
    // Skip during jumping — event-based sync handles this
    if (this.state === GAME_STATES.JUMPING) return;
    // Sync during charging (30Hz) for squash animation, otherwise 6Hz
    const syncRate = (this.state === GAME_STATES.CHARGING) ? 0.033 : 0.166;
    this._syncTimer += 0.016;
    if (this._syncTimer < syncRate) return;
    this._syncTimer = 0;

    const j = this.world.jumper;
    if (!j) return;
    const payload = {
      pos: { x: j.position.x, y: j.position.y, z: j.position.z },
      rot: { x: j.rotation.x, y: j.rotation.y, z: j.rotation.z },
      scaleY: j.scale.y,
      state: this.state,
      score: this.score,
      idx: this.world.currentIdx,
      name: this._myName,
      color: this._myColorHex,
    };
    if (!this._texSynced && this._texDataURL) {
      this._texSynced = true;
      payload.texData = this._texDataURL;
    }
    if (this._chargeAudioURL) payload.chargeAudio = this._chargeAudioURL;
    if (this._jumpAudioURL) payload.jumpAudio = this._jumpAudioURL;
    this.network.sendState(payload);
  }

  applyRemoteState(id, state) {
    this.world.addOrUpdateRemote(id, parseInt(state.color.replace('#', ''), 16), state.texData, state.name);
    this.world.updateRemoteState(id, state);
    // Event-based jump: start local simulation when remote player begins jumping
    if (state.jumpCharge !== undefined) {
      this.world.remoteJumpStart(id, {
        chargePower: state.jumpCharge, dir: state.jumpDir,
        pos: state.pos, scaleY: state.scaleY,
      });
    }
    this._remotePlayers.set(id, {
      name: state.name || '玩家',
      color: state.color || '#232323',
      score: state.score ?? 0,
      idx: state.idx ?? 0,
      texURL: state.texData || this._remotePlayers.get(id)?.texURL,
    });
  }

  getPlayersData() {
    const list = [{
      id: this.network?.playerId || 'me',
      name: this._myName,
      color: this._myColorHex,
      score: this.score,
      idx: this.world.currentIdx,
      texURL: this._texDataURL,
    }];
    for (const [id, p] of this._remotePlayers) {
      list.push({ id, name: p.name, color: p.color, score: p.score, idx: p.idx, texURL: p.texURL });
    }
    return list;
  }

  removeRemote(id) { this.world.removeRemote(id); }

  /* ================================================================
   *  INPUT
   * ================================================================ */

  _onPress() {
    if (this._dead || this._finished || this._respawnTimer > 0) return;
    if (this.state !== GAME_STATES.IDLE && this.state !== GAME_STATES.TRANSITIONING) return;
    this.state = GAME_STATES.CHARGING;
    this._chargePower = 0;
    if (this.audioManager) this._chargeHandle = this.audioManager.playCharge();
    // Force sync so remotes start local charging sim immediately
    this._syncTimer = 999;
  }

  _onRelease() {
    if (this._dead || this._finished || this._respawnTimer > 0) return;
    if (this.state !== GAME_STATES.CHARGING) return;
    const savedPower = this._chargePower;
    this._jumpVelX = savedPower * 1.3125;
    this._jumpVelY = PHYSICS.jumpSpeedY + savedPower * 2.6;
    this._hasLaunched = false;
    this.state = GAME_STATES.JUMPING;
    // send BEFORE we clear anything — remote needs the charge amount
    this.network?.sendState({
      state: 'jumping', score: this.score, idx: this.world.currentIdx,
      name: this._myName, color: this._myColorHex,
      jumpCharge: savedPower, jumpDir: this.world.currentDir,
      pos: { x: this.world.jumper.position.x, y: this.world.jumper.position.y, z: this.world.jumper.position.z },
      scaleY: this.world.jumper.scale.y,
    });
    this._chargePower = 0;
    this.world.jumper.scale.set(1, 1, 1);
    if (this.audioManager) { this.audioManager.playJump(this._chargeHandle); this._chargeHandle = null; }
  }

  /* ================================================================
   *  CHARGING / JUMPING
   * ================================================================ */

  _updateCharging() {
    const j = this.world.jumper;
    if (j.scale.y > 0.02) {
      const squashRate = PHYSICS.compressSpeed + this._chargePower * 0.03;
      j.scale.y -= squashRate;
      // Widen proportionally: Y shrinks → X and Z grow
      const widen = 1 + (1 - j.scale.y);
      j.scale.x = widen;
      j.scale.z = widen;
      this._chargePower += PHYSICS.chargeSpeed;
    }
  }

  _updateJumping() {
    const j = this.world.jumper;
    const dir = this.world.currentDir;
    const { velY } = Physics.jumpTrajectory(j.position, this._jumpVelX, this._jumpVelY, dir);
    this._jumpVelY = velY;
    if (j.scale.y < 1) {
      j.scale.y = Math.min(1, j.scale.y + PHYSICS.releaseSpeed);
      // Restore width proportionally
      const widen = 1 + (1 - j.scale.y);
      j.scale.x = widen;
      j.scale.z = widen;
    }
    if (!this._hasLaunched && j.position.y > JUMPER.startY) this._hasLaunched = true;
    if (this._hasLaunched && j.position.y <= JUMPER.startY) {
      j.position.y = JUMPER.startY;
      this._onLand();
    }
  }

  _onLand() {
    const j = this.world.jumper;
    const result = Physics.checkLanding(
      j.position.x, j.position.z,
      this.world.cubes, this.world.directions,
      this.world.currentIdx,
    );

    if (result.location >= 1) {
      const steps = result.location;
      const newIdx = this.world.currentIdx + steps;
      if (this._mode === 'race' && this.world.currentIdx >= this._modeParam - 1 && newIdx > this._modeParam) {
        this._startFall(); return;
      }
      this.score += steps;
      this.ui.updateScore(this.score);
      j.position.y = JUMPER.startY;
      this.world.advance(steps);
      this._respawnIdx = this._respawnIdx + 1;
      this._transitionSteps = steps;
      this.network?.sendIdx(this.world.currentIdx);
      // Force re-sync after landing — corrects remote simulation position
      this._syncTimer = 999;

      if (this._mode === 'race' && this.world.currentIdx === this._modeParam) {
        this._finished = true; this.input.disable();
        this.network?.sendFinish(); this.ui.hideRaceBar();
        return;
      }
      this.state = GAME_STATES.TRANSITIONING;
    } else if (result.location === -1) {
      this._respawnIdx = this.world.currentIdx;
      this.state = GAME_STATES.IDLE;
      this._syncTimer = 999; // force re-sync after landing
    } else {
      this._startFall();
    }
  }

  _updateTransitioning() {
    const d = this.cameraCtrl.current.distanceTo(this.cameraCtrl.target);
    if (d < 0.3) {
      this._transitionSteps = 0;
      this._respawnIdx = Math.min(this._respawnIdx + 1, this.world.currentIdx);
      this.state = GAME_STATES.IDLE;
    }
  }

  _startFall() {
    // Broadcast fall to other players before marking dead (syncState skips dead)
    const j = this.world.jumper;
    this.network?.sendState({
      state: 'falling',
      pos: { x: j.position.x, y: j.position.y, z: j.position.z },
      rot: { x: j.rotation.x, y: j.rotation.y, z: j.rotation.z },
      scaleY: j.scale.y,
      score: this.score, idx: this.world.currentIdx,
      name: this._myName, color: this._myColorHex,
    });
    this._dead = true;
    this.state = GAME_STATES.FALLING;
    this._fallEnded = false;
    this.input.disable();
    this._transitionSteps = 0;
    if (this.audioManager && this._chargeHandle) { this.audioManager.playJump(this._chargeHandle); this._chargeHandle = null; }

    const dir = this.world.currentDir;
    const moveAxis = dir === 'left' ? 'x' : 'z';
    const safeIdx = this._respawnIdx;
    let nearest = null, nDist = Infinity;
    for (let i = Math.max(0, safeIdx - 1); i < this.world.cubes.length && i <= safeIdx + 2; i++) {
      const d = Math.abs(j.position[moveAxis] - this.world.cubes[i].position[moveAxis]);
      if (d < nDist) { nDist = d; nearest = this.world.cubes[i]; }
    }
    if (!nearest || nDist > CUBE.width + JUMPER.width) { this._fallMode = 'drop'; return; }
    this._fallMode = 'tip';
    this._tipAxis = moveAxis;
    this._tipOutSign = (j.position[moveAxis] - nearest.position[moveAxis]) >= 0 ? 1 : -1;
    this.network?.sendDead();
  }

  _updateFalling() {
    if (this._fallEnded) return;
    const j = this.world.jumper;
    if (this._fallMode === 'drop') {
      if (j.position.y > GROUND_Y) j.position.y -= PHYSICS.fallSpeed;
      else this._endFall();
      return;
    }
    j.position[this._tipAxis] += this._tipOutSign * 0.08;
    if (j.position.y > GROUND_Y) j.position.y -= PHYSICS.fallSpeed;
    else this._endFall();
    this._resolveCubeCollisions();
  }

  _resolveCubeCollisions() {
    const j = this.world.jumper;
    const minSep = (CUBE.width + JUMPER.width) / 2;
    const idx = this.world.currentIdx;
    let nearest = null, nDist = Infinity;
    for (let i = Math.max(0, idx - 1); i < this.world.cubes.length && i <= idx + 1; i++) {
      const d = Math.abs(j.position[this._tipAxis] - this.world.cubes[i].position[this._tipAxis]);
      if (d < nDist) { nDist = d; nearest = this.world.cubes[i]; }
    }
    if (!nearest) return;
    const d = j.position[this._tipAxis] - nearest.position[this._tipAxis];
    if (Math.abs(d) < minSep) j.position[this._tipAxis] += (minSep - Math.abs(d)) * Math.sign(d);
  }

  _endFall() {
    this.world.jumper.position.y = GROUND_Y;
    this._fallEnded = true; this._alive = false;
    this.state = GAME_STATES.GAMEOVER;
    this._respawnTimer = 1.5;
  }

  _doRespawn() {
    this._dead = false; this._alive = true;
    const cube = this.world.cubes[this._respawnIdx];
    this.world.jumper.position.x = cube.position.x;
    this.world.jumper.position.z = cube.position.z;
    this.world.jumper.position.y = JUMPER.startY;
    this.world.jumper.rotation.set(0, 0, 0);
    this.world.jumper.scale.set(1, 1, 1);
    this.world.currentIdx = this._respawnIdx;
    this.state = GAME_STATES.IDLE;
    this._chargePower = 0; this._fallEnded = false;
    this.input.enable(); this._hasLaunched = false;
    this.cameraCtrl.updateTarget(this.world.cubes, this._respawnIdx);
    this.world.updateNameSprite();
    this._syncTimer = 999; // force re-sync so remotes hard-snap to new position
  }

  _updateModeUI() {
    const data = this.getPlayersData();
    if (this._mode === 'race') {
      this.ui.updateRaceBar(data, this._modeParam);
    } else {
      this.ui.updateTimedLeaderboard(data);
    }
    this.ui.updateRelativeBar(data, this._myName, this.world.currentIdx);
  }
}
