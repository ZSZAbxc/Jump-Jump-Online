/**
 * AudioManager — handles local and remote sound effects.
 * Uses Web Audio API for precise control and volume attenuation
 * based on distance (cube index delta).
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this._initOnUserGesture();
    // Local audio buffers (decoded)
    this._chargeBuf = null;   // local charge sound
    this._jumpBuf = null;     // local jump sound
    // Remote audio buffers (received via sync)
    this._remoteChargeBufs = new Map(); // playerId → AudioBuffer
    this._remoteJumpBufs = new Map();
    // Active remote sources (for distance-based volume)
    this._remoteSources = new Map();    // playerId → { source, gainNode, type }
    // Distance data
    this._remoteIdx = new Map();
    this._myIdx = 0;
  }

  /** Wait for first user click to create AudioContext (browser policy). */
  _initOnUserGesture() {
    const handler = () => {
      if (this.ctx) return;
      this.ctx = new AudioContext();
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
    };
    document.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
  }

  /** Ensure AudioContext is ready — call before playing any sound. */
  _ensureReady() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /* ================================================================
   *  LOCAL AUDIO
   * ================================================================ */

  /**
   * Set local audio from decoded AudioBuffer.
   * @param {AudioBuffer|null} chargeBuf
   * @param {AudioBuffer|null} jumpBuf
   */
  setLocalAudio(chargeBuf, jumpBuf) {
    this._chargeBuf = chargeBuf;
    this._jumpBuf = jumpBuf;
  }

  /**
   * Play local charge sound. Returns a handle to stop it later.
   */
  playCharge() {
    if (!this._chargeBuf) return null;
    this._ensureReady();
    // Stop any previous local charge (belt-and-suspenders)
    if (this._localChargeHandle) {
      try { this._localChargeHandle.source.stop(); } catch {}
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._chargeBuf;
    src.loop = false; // play once, naturally stops
    const gain = this.ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    this._localChargeHandle = { source: src, gainNode: gain };
    return this._localChargeHandle;
  }

  /**
   * Stop charge sound, play jump sound once.
   */
  playJump(chargeHandle) {
    this._ensureReady();
    const h = chargeHandle || this._localChargeHandle;
    if (h) {
      try { h.source.stop(); } catch {}
      this._localChargeHandle = null;
    }
    if (!this._jumpBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._jumpBuf;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  /* ================================================================
   *  REMOTE AUDIO
   * ================================================================ */

  /** Store decoded remote audio buffers. */
  setRemoteAudio(playerId, chargeBuf, jumpBuf) {
    if (chargeBuf) this._remoteChargeBufs.set(playerId, chargeBuf);
    if (jumpBuf) this._remoteJumpBufs.set(playerId, jumpBuf);
  }

  /** Track remote player idx for distance calc. */
  setRemoteIdx(playerId, idx) {
    this._remoteIdx.set(playerId, idx);
  }
  setMyIdx(idx) {
    this._myIdx = idx;
  }

  /** Called when a remote player starts charging. */
  remoteChargeStart(playerId) {
    this._ensureReady();
    // Stop any existing source for this player
    this._stopRemote(playerId);

    const buf = this._remoteChargeBufs.get(playerId);
    if (!buf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = false; // play once, naturally stops
    const gain = this.ctx.createGain();
    gain.gain.value = this._calcVolume(playerId);
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    this._remoteSources.set(playerId, { source: src, gainNode: gain, type: 'charge' });
  }

  /** Called when a remote player releases (stops charge, plays jump). */
  remoteJumpStart(playerId) {
    this._ensureReady();
    this._stopRemote(playerId);

    const buf = this._remoteJumpBufs.get(playerId);
    if (!buf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = this._calcVolume(playerId);
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    // Auto-stop after playback
    src.onended = () => {
      this._remoteSources.delete(playerId);
    };
    this._remoteSources.set(playerId, { source: src, gainNode: gain, type: 'jump' });
  }

  /** Called every frame — updates volume for active remote sources. */
  updateRemoteVolumes() {
    for (const [playerId, h] of this._remoteSources) {
      h.gainNode.gain.value = this._calcVolume(playerId);
    }
  }

  stopRemote(playerId) {
    this._stopRemote(playerId);
  }

  /* ================================================================
   *  INTERNAL
   * ================================================================ */

  _calcVolume(playerId) {
    const myIdx = this._myIdx;
    const remoteIdx = this._remoteIdx.get(playerId) ?? myIdx;
    const delta = Math.abs(remoteIdx - myIdx);
    return Math.max(0, 1 - delta / 3);
  }

  _stopRemote(playerId) {
    const h = this._remoteSources.get(playerId);
    if (!h) return;
    try { h.source.stop(); } catch {}
    this._remoteSources.delete(playerId);
  }

  /** Decode a base64 data URL to an AudioBuffer. */
  static decodeDataURL(dataURL) {
    if (!dataURL) return Promise.resolve(null);
    const bin = atob(dataURL.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Promise((resolve) => {
      const ctx = new AudioContext();
      ctx.decodeAudioData(bytes.buffer, (buf) => {
        ctx.close();
        resolve(buf);
      }, () => resolve(null));
    });
  }
}
