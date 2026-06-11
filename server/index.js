import { createServer as createHttpServer } from 'http';
import { Server } from 'socket.io';
import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';

const PORT = process.env.PORT || 3000;
const IS_PROD = existsSync('./dist'); // dist exists after npm run build

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

let httpServer;

if (IS_PROD) {
  // Production: serve static files from dist/
  const distDir = join(process.cwd(), 'dist');
  httpServer = createHttpServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    let path = req.url.split('?')[0];
    if (path === '/') path = '/index.html';
    const filePath = join(distDir, path);
    if (existsSync(filePath)) {
      const ext = extname(path);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    } else {
      // SPA fallback
      const index = join(distDir, 'index.html');
      if (existsSync(index)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(readFileSync(index));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    }
  });
} else {
  // Development: use Vite middleware
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true } });
  httpServer = createHttpServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    vite.middlewares(req, res);
  });
}

const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 3000,
  pingTimeout: 10000,
  transports: ['websocket', 'polling'],
  allowEIO3: false,
  connectTimeout: 15000,
});

const rooms = new Map();

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
function generateCubes(seed, count) {
  const rand = rng(seed), cubes = [], dirs = [];
  cubes.push({ x: 0, y: 0, z: 0 });
  for (let i = 1; i < count; i++) {
    const dir = rand() > 0.5 ? 'left' : 'right', gap = 6 + rand() * 6;
    const prev = cubes[i - 1], next = { ...prev };
    if (dir === 'left') next.x -= gap; else next.z -= gap;
    cubes.push(next); dirs.push(dir);
  }
  return { cubes, dirs };
}
function createRoom() {
  const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
  rooms.set(roomId, { id: roomId, players: new Map(), hostId: null, seed: Date.now() % 100000,
    started: false, mode: 'race', modeParam: 100, randomFaces: false, faceAssignments: null, playerFaces: null });
  return roomId;
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);
  let myRoom = null;

  function leaveRoom() {
    if (!myRoom) return;
    const room = rooms.get(myRoom); if (!room) { myRoom = null; return; }
    const p = room.players.get(socket.id), wasHost = room.hostId === socket.id;
    if (p?._disconnectTimer) { clearTimeout(p._disconnectTimer); p._disconnectTimer = null; }
    room.players.delete(socket.id); socket.leave(myRoom);
    if (room.players.size === 0) rooms.delete(myRoom);
    else {
      if (wasHost) {
        const remaining = [...room.players.keys()];
        const newHost = remaining[Math.floor(Math.random() * remaining.length)];
        room.hostId = newHost; room.players.get(newHost).ready = true;
        io.to(newHost).emit('you_are_host');
      }
      broadcastRoom(room);
    }
    myRoom = null;
  }

  function broadcastRoom(room) {
    const players = [];
    for (const [sid, p] of room.players)
      players.push({ id: sid, name: p.name, color: p.color, ready: p.ready, ping: p.ping || 0, offline: !!p.offline });
    io.to(room.id).emit('room_update', { players, hostId: room.hostId, started: room.started,
      modeConfig: { mode: room.mode, param: room.modeParam, randomFaces: room.randomFaces } });
  }

  function getGameSnapshot(room) {
    const totalCubes = room.mode === 'race' ? Math.max(room.modeParam + 10, 20) : 60;
    const { cubes, dirs } = generateCubes(room.seed, totalCubes);
    const players = [];
    for (const [sid, p] of room.players)
      players.push({ socketId: sid, name: p.name, color: p.color, score: p.score, idx: p.idx, alive: p.alive, offline: !!p.offline });
    const playerFaces = [];
    for (const [sid, p] of room.players) playerFaces.push({ id: sid, color: p.color, name: p.name });
    const faceAssignments = [];
    if (room.randomFaces) {
      const fr = rng(room.seed + 77777);
      for (let i = 0; i < totalCubes; i++) faceAssignments.push(Math.floor(fr() * playerFaces.length));
    }
    return { cubes, dirs, players, faceAssignments, playerFaces };
  }

  function dedupName(room, name) {
    const base = name || '玩家';
    const existing = new Set();
    for (const [, p] of room.players) existing.add(p.name);
    if (!existing.has(base)) return base;
    let i = 1;
    while (existing.has(`${base}(${i})`)) i++;
    return `${base}(${i})`;
  }

  socket.on('create_room', ({ color, name, playerId }) => {
    leaveRoom();
    const room = rooms.get(createRoom());
    room.hostId = socket.id;
    room.players.set(socket.id, { playerId, color, name: dedupName(room, name), ready: true, alive: true, score: 0, idx: 0, ping: 0, offline: false });
    socket.join(room.id); myRoom = room.id;
    socket.emit('room_joined', { roomId: room.id, playerId: socket.id, name: room.players.get(socket.id).name, modeConfig: { mode: room.mode, param: room.modeParam, randomFaces: room.randomFaces } });
    broadcastRoom(room);
  });

  socket.on('join_room', ({ roomId, color, name, playerId }) => {
    leaveRoom();
    const room = rooms.get(roomId);
    if (!room) { socket.emit('error', '房间不存在'); return; }
    if (room.started) { socket.emit('error', '游戏已开始'); return; }
    room.players.set(socket.id, { playerId, color, name: dedupName(room, name), ready: false, alive: true, score: 0, idx: 0, ping: 0, offline: false });
    socket.join(roomId); myRoom = roomId;
    socket.emit('room_joined', { roomId, playerId: socket.id, name: room.players.get(socket.id).name, modeConfig: { mode: room.mode, param: room.modeParam, randomFaces: room.randomFaces } });
    broadcastRoom(room);
  });

  socket.on('leave_room', () => { leaveRoom(); socket.emit('room_left'); });

  socket.on('reconnect_room', ({ roomId, playerId }) => {
    leaveRoom();
    const room = rooms.get(roomId);
    if (!room || !room.started) { socket.emit('error', room ? '游戏未开始' : '房间不存在'); return; }
    let oldSid = null;
    for (const [sid, p] of room.players) { if (p.playerId === playerId && p.offline) { oldSid = sid; if (p._disconnectTimer) { clearTimeout(p._disconnectTimer); p._disconnectTimer = null; } break; } }
    if (!oldSid) { socket.emit('error', '无法重连'); return; }
    const oldData = room.players.get(oldSid);
    room.players.delete(oldSid);
    oldData.offline = false; oldData.ping = 0;
    room.players.set(socket.id, oldData);
    socket.join(roomId); myRoom = roomId;
    const snap = getGameSnapshot(room);
    const playerFaces = [...snap.playerFaces];
    room.playerFaces = playerFaces;
    socket.emit('reconnect_state', { roomId, playerId: socket.id, mode: room.mode, modeParam: room.modeParam,
      cubes: snap.cubes, dirs: snap.dirs, faceAssignments: room.faceAssignments, playerFaces,
      serverTime: Date.now(), players: snap.players });
    socket.to(myRoom).emit('player_reconnected', { oldSocketId: oldSid, socketId: socket.id, name: oldData.name, color: oldData.color, idx: oldData.idx, score: oldData.score });
    broadcastRoom(room);
  });

  socket.on('set_ready', ({ ready }) => {
    const room = rooms.get(myRoom); if (!room || room.started) return;
    const p = room.players.get(socket.id); if (p) p.ready = ready;
    broadcastRoom(room);
  });

  socket.on('ping_req', (ts) => { socket.emit('pong_res', ts); });
  socket.on('latency_update', ({ ping }) => {
    const room = rooms.get(myRoom); if (!room) return;
    const p = room.players.get(socket.id); if (p) p.ping = ping;
    if (room) broadcastRoom(room);
  });

  socket.on('set_mode', ({ mode, param }) => {
    const room = rooms.get(myRoom); if (!room || room.started) return;
    room.mode = mode; room.modeParam = param; broadcastRoom(room);
  });
  socket.on('toggle_random_faces', () => {
    const room = rooms.get(myRoom); if (!room || room.started) return;
    room.randomFaces = !room.randomFaces; broadcastRoom(room);
  });

  socket.on('start_game', () => {
    const room = rooms.get(myRoom); if (!room || room.started) return;
    const allReady = room.players.size >= 2 && [...room.players.entries()].every(([id, p]) => id === room.hostId || p.ready);
    if (!allReady) { socket.emit('error', '需要至少2人且全部准备'); return; }
    room.started = true;
    for (const [, p] of room.players) { p.alive = true; p.score = 0; p.idx = 0; p.offline = false; if (p._disconnectTimer) { clearTimeout(p._disconnectTimer); p._disconnectTimer = null; } }
    const snap = getGameSnapshot(room);
    room.faceAssignments = snap.faceAssignments;
    room.playerFaces = snap.playerFaces;
    io.to(myRoom).emit('game_start', { cubes: snap.cubes, dirs: snap.dirs, mode: room.mode, modeParam: room.modeParam,
      faceAssignments: snap.faceAssignments, playerFaces: snap.playerFaces, serverTime: Date.now() });
    broadcastRoom(room);
  });

  socket.on('player_state', (state) => {
    const room = rooms.get(myRoom); if (!room || !room.started) return;
    socket.to(myRoom).emit('remote_state', { socketId: socket.id, ...state });
  });

  socket.on('jump_start', (data) => {
    const room = rooms.get(myRoom); if (!room || !room.started) return;
    socket.to(myRoom).emit('remote_jump_start', { socketId: socket.id, ...data });
  });

  socket.on('jump_land', (data) => {
    const room = rooms.get(myRoom); if (!room || !room.started) return;
    socket.to(myRoom).emit('remote_jump_land', { socketId: socket.id, ...data });
  });

  socket.on('player_dead', () => {
    const room = rooms.get(myRoom); if (!room || !room.started) return;
    const p = room.players.get(socket.id); if (p) socket.emit('respawn', { idx: p.idx });
  });
  socket.on('update_idx', ({ idx }) => {
    const room = rooms.get(myRoom); if (!room || !room.started) return;
    const p = room.players.get(socket.id); if (p) p.idx = idx;
  });

  socket.on('player_finish', () => {
    const room = rooms.get(myRoom); if (!room || !room.started) return;
    const p = room.players.get(socket.id); if (!p) return;
    room.started = false;
    io.to(myRoom).emit('game_over', { winner: socket.id, winnerName: p.name, reason: 'race',
      scores: [...room.players.entries()].map(([id, pl]) => ({ id, name: pl.name, score: pl.score, idx: pl.idx })) });
    for (const [id, pl] of room.players) { pl.ready = (id === room.hostId); pl.alive = true; pl.score = 0; pl.idx = 0; }
    broadcastRoom(room);
  });

  socket.on('time_up', ({ score }) => {
    const room = rooms.get(myRoom); if (!room || !room.started) return;
    const p = room.players.get(socket.id); if (p) { p.score = score; p.finished = true; }
    if ([...room.players.values()].some(pl => !pl.finished)) return;
    room.started = false;
    let best = null;
    for (const [id, pl] of room.players) if (!best || pl.score > best.score) best = { id, score: pl.score, name: pl.name };
    io.to(myRoom).emit('game_over', { winner: best?.id, winnerName: best?.name, reason: 'timed',
      scores: [...room.players.entries()].map(([id, pl]) => ({ id, name: pl.name, score: pl.score, idx: pl.idx })) });
    for (const [id, pl] of room.players) { pl.ready = (id === room.hostId); pl.alive = true; pl.score = 0; pl.idx = 0; pl.finished = false; }
    broadcastRoom(room);
  });

  // ── End-game vote ─────────────────────────────────────────────
  socket.on('end_game_vote', () => {
    const room = rooms.get(myRoom);
    if (!room || !room.started) return;
    if (room._vote) return; // already voting
    const p = room.players.get(socket.id);
    if (!p) return;

    room._vote = {
      initiatorId: socket.id,
      initiatorName: p.name,
      votes: new Map([[socket.id, true]]),
      total: room.players.size,
    };

    const voterIds = [...room._vote.votes.keys()];
    const agreed = voterIds.length;
    const total = room._vote.total;
    io.to(myRoom).emit('end_game_vote_start', { initiatorName: p.name, voterIds, total, agreed });
    socket.emit('end_game_vote_start', { initiatorName: p.name, voterIds, total, agreed });
  });

  socket.on('end_game_vote_response', ({ agree }) => {
    const room = rooms.get(myRoom);
    if (!room || !room.started || !room._vote) return;
    room._vote.votes.set(socket.id, agree);
    const total = room._vote.total;

    if (!agree) {
      io.to(myRoom).emit('end_game_vote_end', { passed: false, reason: '有人拒绝' });
      room._vote = null;
      return;
    }

    const agreed = [...room._vote.votes.values()].filter(v => v).length;
    const voterIds = [...room._vote.votes.keys()];
    io.to(myRoom).emit('end_game_vote_update', { agreed, total, voterIds });

    if (agreed >= total) {
      // Unanimous — end game
      room.started = false;
      io.to(myRoom).emit('end_game_vote_end', { passed: true, reason: '全票通过' });
      for (const [id, pl] of room.players) {
        pl.ready = (id === room.hostId);
        pl.alive = true; pl.score = 0; pl.idx = 0;
      }
      room._vote = null;
      broadcastRoom(room);
    }
  });

  socket.on('disconnect', () => {
    const room = rooms.get(myRoom);
    if (!room || !room.started) { leaveRoom(); console.log(`[dc] ${socket.id}`); return; }
    const p = room.players.get(socket.id);
    if (!p) { myRoom = null; return; }
    p.offline = true;
    const roomId = myRoom;
    // If the disconnecting player is the vote initiator, cancel the vote
    if (room._vote && room._vote.initiatorId === socket.id) {
      io.to(roomId).emit('end_game_vote_end', { passed: false, reason: '发起者离线' });
      room._vote = null;
    }
    socket.to(roomId).emit('player_offline', { socketId: socket.id });
    broadcastRoom(room);
    p._disconnectTimer = setTimeout(() => {
      const r = rooms.get(roomId); if (!r || !r.players.has(socket.id)) return;
      // Clean vote entry if there's an active vote
      if (r._vote) {
        r._vote.votes.delete(socket.id);
        const total = r._vote.total;
        const agreed = [...r._vote.votes.values()].filter(v => v).length;
        const voterIds = [...r._vote.votes.keys()];
        io.to(roomId).emit('end_game_vote_update', { agreed, total, voterIds });
      }
      const wasHost = r.hostId === socket.id;
      r.players.delete(socket.id); socket.leave(roomId);
      if (r.players.size === 0) rooms.delete(roomId);
      else { if (wasHost) { const rem = [...r.players.keys()]; r.hostId = rem[Math.floor(Math.random()*rem.length)]; r.players.get(r.hostId).ready = true; io.to(r.hostId).emit('you_are_host'); } broadcastRoom(r); }
    }, 30000);
    myRoom = null;
  });
});

httpServer.listen(PORT, '0.0.0.0', () => console.log(`[server] Jump Jump at http://localhost:${PORT}`));
