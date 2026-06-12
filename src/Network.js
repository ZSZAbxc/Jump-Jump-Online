import { io } from 'socket.io-client';

/**
 * Manages WebSocket connection, room lifecycle, and state relay.
 */
export class Network {
  constructor(url = '') {
    this.socket = null;
    this.url = url;
    this.roomId = null;
    this.playerId = null;
    this._latency = 0;

    // Persistent player ID for reconnection
    this._persistentId = localStorage.getItem('jumpPlayerId');
    if (!this._persistentId) {
      this._persistentId = 'P' + Math.random().toString(36).slice(2, 10).toUpperCase();
      localStorage.setItem('jumpPlayerId', this._persistentId);
    }
    // Store room info for auto-reconnect
    this._lastRoomId = null;

    this.onRoomUpdate = null;
    this.onGameStart = null;
    this.onRemoteState = null;
    this.onGameOver = null;
    this.onRespawn = null;
    this.onBecomeHost = null;
    this.onReconnectState = null;
    this.onPlayerReconnected = null;
    this.onPlayerOffline = null;
    this.onEndGameVoteStart = null;
    this.onEndGameVoteUpdate = null;
    this.onEndGameVoteEnd = null;
    this.onRemoteJumpStart = null;
    this.onRemoteJumpLand = null;
    this.onChatMessage = null;
    this.onError = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.url, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      });
      this.socket.on('connect', () => resolve());
      this.socket.on('connect_error', (err) => {
        reject(new Error(`无法连接服务器 (${err.message})，请确保 npm run dev 正在运行`));
      });
      // Auto-reconnect: if we were in a started room, try to rejoin
      this.socket.on('disconnect', () => {
        this._lastRoomId = this.roomId;
      });
      this.socket.io.on('reconnect', () => {
        if (this._lastRoomId && this._persistentId) {
          this.reconnectRoom(this._lastRoomId);
        }
      });
      this._bind();
    });
  }

  _bind() {
    this.socket.on('room_joined', ({ roomId, playerId, modeConfig }) => {
      this.roomId = roomId;
      this._lastRoomId = roomId;
      this.playerId = playerId;
      this._joinedModeConfig = modeConfig;
    });
    this.socket.on('room_left', () => { this.roomId = null; });
    this.socket.on('room_update', (data) => { this.onRoomUpdate?.(data); });
    this.socket.on('game_start', (data) => { this.onGameStart?.(data); });
    this.socket.on('remote_state', (state) => { this.onRemoteState?.(state); });
    this.socket.on('game_over', (data) => { this.onGameOver?.(data); });
    this.socket.on('respawn', (data) => { this.onRespawn?.(data); });
    this.socket.on('you_are_host', () => { this.onBecomeHost?.(); });
    this.socket.on('pong_res', (ts) => { this._latency = Date.now() - ts; });
    this.socket.on('reconnect_state', (data) => { this.onReconnectState?.(data); });
    this.socket.on('player_reconnected', (data) => { this.onPlayerReconnected?.(data); });
    this.socket.on('player_offline', (data) => { this.onPlayerOffline?.(data); });
    this.socket.on('end_game_vote_start', (data) => { this.onEndGameVoteStart?.(data); });
    this.socket.on('end_game_vote_update', (data) => { this.onEndGameVoteUpdate?.(data); });
    this.socket.on('end_game_vote_end', (data) => { this.onEndGameVoteEnd?.(data); });
    this.socket.on('remote_jump_start', (data) => { this.onRemoteJumpStart?.(data); });
    this.socket.on('remote_jump_land', (data) => { this.onRemoteJumpLand?.(data); });
    this.socket.on('chat_message', (data) => { this.onChatMessage?.(data); });
    this.socket.on('error', (msg) => { this.onError?.(msg); });
  }

  get joinedModeConfig() { return this._joinedModeConfig; }

  createRoom(color, name)   { this.socket.emit('create_room', { color, name, playerId: this._persistentId }); }
  joinRoom(roomId, color, name) { this.socket.emit('join_room', { roomId, color, name, playerId: this._persistentId }); }
  reconnectRoom(roomId)      { this.socket.emit('reconnect_room', { roomId, playerId: this._persistentId }); }
  leaveRoom()               { this.socket.emit('leave_room'); }
  setReady(ready)           { this.socket.emit('set_ready', { ready }); }
  setMode(mode, param)      { this.socket.emit('set_mode', { mode, param }); }
  toggleRandomFaces()        { this.socket.emit('toggle_random_faces'); }
  startGame()               { this.socket.emit('start_game'); }
  sendState(state)           { if (this.roomId) this.socket.emit('player_state', state); }
  sendDead()                { this.socket.emit('player_dead'); }
  sendIdx(idx)              { this.socket.emit('update_idx', { idx }); }
  sendFinish()              { this.socket.emit('player_finish'); }
  sendTimeUp(score)         { this.socket.emit('time_up', { score }); }
  sendEndGameVote()          { this.socket.emit('end_game_vote'); }
  sendEndGameVoteResponse(agree) { this.socket.emit('end_game_vote_response', { agree }); }
  sendChat(message)          { if (this.roomId) this.socket.emit('chat_message', { message }); }
  ping()                    { this.socket.emit('ping_req', Date.now()); }
  sendLatency(ping)          { this.socket.emit('latency_update', { ping }); }
  getLatency()               { return this._latency; }
  disconnect()              { this.socket?.disconnect(); }
}
