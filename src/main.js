import { Renderer } from './Renderer.js';
import { World } from './World.js';
import { CameraController } from './CameraController.js';
import { InputManager } from './InputManager.js';
import { UI } from './UI.js';
import { Game } from './Game.js';
import { Network } from './Network.js';
import * as THREE from 'three';

const renderer = new Renderer();
const world = new World(renderer.scene);
const cameraCtrl = new CameraController(renderer.camera);
const input = new InputManager(renderer.domElement);
const ui = new UI();
const network = new Network();
const game = new Game(renderer, world, cameraCtrl, input, ui, network);

let myColor = '#232323';
let myName = '玩家';
let amHost = false;
let lastModeConfig = null;

// ── Latency polling ──────────────────────────────────────────────────
setInterval(() => {
  if (network.socket?.connected) {
    network.ping();
    setTimeout(() => {
      if (network.socket?.connected) {
        network.sendLatency(network.getLatency());
      }
    }, 500);
  }
}, 3000);

// ── Latency display (all screens) ─────────────────────────────────────
setInterval(() => {
  ui.updateLatency(network.getLatency() || 0);
}, 1000);

// ── Render keep-alive ────────────────────────────────────────────────
setInterval(() => {
  fetch('/health').catch(() => {});
}, 10 * 60 * 1000); // every 10 minutes

// ── Network events ──────────────────────────────────────────────────
network.onRoomUpdate = ({ players, hostId, modeConfig }) => {
  if (!network.playerId) return;
  amHost = (hostId === network.playerId);
  if (modeConfig) lastModeConfig = modeConfig;
  ui._amHost = amHost;
  ui.updateWaitingRoom(players, network.playerId);
  // Keep non-host readonly mode display in sync
  if (modeConfig) ui.updateModeDisplay(modeConfig);
};

network.onError = (msg) => alert(msg);

network.onGameStart = ({ cubes, dirs, mode, modeParam, faceAssignments, playerFaces, serverTime }) => {
  ui.hideWaitingScreen();
  world.loadSharedCubes(cubes, dirs, mode, modeParam, faceAssignments, playerFaces);
  game.setMode(mode, modeParam);
  game.setServerTime(serverTime);
  game._remotePlayers.clear();
  game.restart();
  game.start();
};

network.onRemoteState = (state) => {
  game.applyRemoteState(state.socketId, state);
};

network.onGameOver = ({ winner, winnerName, reason, scores }) => {
  // Build scoreboard — race shows idx(格), timed shows score(分)
  if (reason === 'race') {
    const lines = scores.map(s => `  ${s.name}: ${s.idx ?? s.score}格`).join('\n');
    ui.showGameOver('🏁 赛跑结束', `${winnerName} 获胜！`, lines, '回到房间', () => {
      ui.hideGameOver();
      ui.hideGameInfo();
      ui.hideRaceBar();
      ui.hideTimedLeaderboard();
      ui.hideRelativeBar();
      game.restart();
      ui.showWaitingScreen(network.roomId, amHost);
    });
  } else {
    const lines = scores.map(s => `  ${s.name}: ${s.idx ?? s.score}格`).join('\n');
    ui.showGameOver('⏱ 时间到', `最高分: ${winnerName}`, lines, '回到房间', () => {
      ui.hideGameOver();
      ui.hideGameInfo();
      ui.hideRaceBar();
      ui.hideTimedLeaderboard();
      ui.hideRelativeBar();
      game.restart();
      ui.showWaitingScreen(network.roomId, amHost);
    });
  }
  game._finished = true;
};

network.onRespawn = ({ idx }) => {
  // Server tells us to respawn — already handled by client-side timer
};

network.onBecomeHost = () => {
  amHost = true;
  ui.showWaitingScreen(network.roomId, true, lastModeConfig);
};

// ── Reconnect events ──────────────────────────────────────────────────
network.onReconnectState = (data) => {
  network.playerId = data.playerId; // update to new socket ID
  network.roomId = data.roomId;
  ui.hideWaitingScreen();
  ui.hideGameOver();
  world.loadSharedCubes(data.cubes, data.dirs, data.mode, data.modeParam, data.faceAssignments, data.playerFaces);
  game.restoreReconnectState(data);
};

network.onPlayerReconnected = ({ oldSocketId, socketId, name, color, idx, score }) => {
  world.updatePlayerFaceId(oldSocketId, socketId);
  game.applyRemoteState(socketId, { pos: { x: 0, y: 1, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scaleY: 1, state: 'idle', score, idx, name, color });
};

network.onPlayerOffline = ({ socketId }) => {
  game.removeRemote(socketId);
};

// ── UI callbacks ────────────────────────────────────────────────────
ui.onRoomReady((ready) => network.setReady(ready));
ui.onRoomStartGame(() => network.startGame());
ui.onRoomLeave(() => {
  network.leaveRoom();
  startRoomFlow();
});

// Host mode change → send to server
ui.onModeChange((modeConfig) => {
  network.setMode(modeConfig.mode, modeConfig.param);
});

// Host random-faces toggle
ui.onRandomFacesToggle(() => {
  network.toggleRandomFaces();
});

// ── Flow ────────────────────────────────────────────────────────────
ui.showUploadDialog().then(async ({ name, texture, color, texDataURL }) => {
  myName = name;
  myColor = color;
  world.configureJumper(texture, parseInt(color.replace('#', ''), 16));
  if (texDataURL) {
    game._texDataURL = texDataURL;
  }
  world.setJumperName(myName);
  game.setMyName(myName);
  game.setMyColorHex(color);

  try {
    await network.connect();
    ui.showLatency();
  } catch (e) {
    alert(`❌ ${e.message}\n\n请先运行: npm run dev\n然后在浏览器打开 http://localhost:3000`);
    return;
  }
  await startRoomFlow();
});

async function startRoomFlow() {
  while (true) {
    const { action, data } = await ui.showRoomScreen();

    try {
      await new Promise((resolve, reject) => {
        const done = { value: false };
        const onJoined = ({ roomId }) => {
          if (done.value) return;
          done.value = true;
          network.socket.off('room_joined', onJoined);
          network.socket.off('error', onError);
          amHost = action === 'create';
          world.setMyPlayerId(network.playerId);
          // Now that we know our socket ID, register self texture for cube faces
          if (game._texDataURL) world.setSelfFaceTex(game._texDataURL);
          ui.showWaitingScreen(roomId, amHost, network.joinedModeConfig);
          resolve();
        };
        const onError = (msg) => {
          if (done.value) return;
          done.value = true;
          network.socket.off('room_joined', onJoined);
          network.socket.off('error', onError);
          reject(new Error(msg));
        };
        network.socket.on('room_joined', onJoined);
        network.socket.on('error', onError);
        if (action === 'create') network.createRoom(myColor, myName);
        else network.joinRoom(data, myColor, myName);
      });
      return;
    } catch (e) {
      alert(e.message);
    }
  }
}
