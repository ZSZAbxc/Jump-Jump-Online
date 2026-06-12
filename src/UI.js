import * as THREE from 'three';

/**
 * Thin UI controller — score bar, game-over overlay, upload dialog, room screens, game info bar.
 */
export class UI {
  constructor() {
    this._createScoreBar();
    this._createGameOverOverlay();
    this._createUploadDialog();
    this._createRoomScreen();
    this._createWaitingScreen();
    this._createGameInfoBar();
    this._createLatencyIndicator();
    this._createEndGameButton();
    this._createEndGameDialog();
    this._createRaceBar();
    this._createTimedLeaderboard();

    // Player data for race bar / timed leaderboard
    this._playersData = {}; // playerId → { name, color, score, index, texDataURL }

  }

  /* ================================================================
   *  SCORE BAR
   * ================================================================ */

  _createScoreBar() {
    this.scoreBar = document.createElement('div');
    this.scoreBar.style.cssText =
      'position:fixed;top:20px;left:0;width:100%;text-align:center;' +
      'color:#fff;font-size:24px;z-index:10;pointer-events:none;';
    this.scoreLabel = document.createElement('span');
    this.scoreBar.appendChild(this.scoreLabel);
    document.body.appendChild(this.scoreBar);
    this.updateScore(0);
  }

  updateScore(n) {
    this.scoreLabel.textContent = `得分：${n}`;
  }

  /* ================================================================
   *  GAME INFO BAR (mode + progress / timer)
   * ================================================================ */

  _createGameInfoBar() {
    this.gameInfoBar = document.createElement('div');
    this.gameInfoBar.style.cssText =
      'display:none;position:fixed;top:60px;left:0;width:100%;text-align:center;' +
      'color:rgba(255,255,255,0.7);font-size:16px;z-index:10;pointer-events:none;';
    this.gameInfoLabel = document.createElement('span');
    this.gameInfoBar.appendChild(this.gameInfoLabel);
    document.body.appendChild(this.gameInfoBar);
  }

  showGameInfo(text) {
    this.gameInfoBar.style.display = 'block';
    this.gameInfoLabel.textContent = text;
  }

  updateGameInfo(text) {
    this.gameInfoLabel.textContent = text;
  }

  hideGameInfo() {
    this.gameInfoBar.style.display = 'none';
  }

  /* ================================================================
   *  LATENCY INDICATOR (top-left)
   * ================================================================ */

  _createLatencyIndicator() {
    this._latencyEl = document.createElement('div');
    this._latencyEl.style.cssText =
      'display:none;position:fixed;top:8px;left:8px;' +
      'padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.4);' +
      'color:#fff;font-size:11px;z-index:10;pointer-events:none;';
    this._latencyDot = document.createElement('span');
    this._latencyDot.style.cssText =
      'display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;';
    this._latencyLabel = document.createElement('span');
    this._latencyEl.appendChild(this._latencyDot);
    this._latencyEl.appendChild(this._latencyLabel);
    document.body.appendChild(this._latencyEl);
  }

  showLatency() {
    if (!this._latencyEl) this._createLatencyIndicator();
    this._latencyEl.style.display = 'block';
  }

  updateLatency(ms) {
    if (!this._latencyEl) this._createLatencyIndicator();
    const color = ms <= 0 ? '#555' : ms < 150 ? '#4caf50' : ms < 500 ? '#ff9800' : '#f44336';
    this._latencyDot.style.background = color;
    this._latencyLabel.textContent = ms > 0 ? `${ms}ms` : '--';
  }

  hideLatency() {
    if (this._latencyEl) this._latencyEl.style.display = 'none';
  }

  /* ================================================================
   *  END-GAME BUTTON + VOTE DIALOG
   * ================================================================ */

  _createEndGameButton() {
    this._endBtn = document.createElement('button');
    this._endBtn.textContent = '结束本局';
    this._endBtn.style.cssText =
      'display:none;position:fixed;top:8px;right:8px;' +
      'background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.3);' +
      'border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;z-index:15;';
    document.body.appendChild(this._endBtn);
  }

  showEndGameButton() { if (this._endBtn) this._endBtn.style.display = 'block'; }
  hideEndGameButton() { if (this._endBtn) this._endBtn.style.display = 'none'; }
  onEndGameClick(cb) { if (this._endBtn) this._endBtn.addEventListener('click', cb); }

  _createEndGameDialog() {
    this._endDialog = document.createElement('div');
    this._endDialog.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
      'flex-direction:column;align-items:center;justify-content:center;z-index:25;';

    const card = document.createElement('div');
    card.style.cssText =
      'background:rgba(50,50,50,0.95);border-radius:14px;padding:24px 32px;text-align:center;min-width:260px;';

    this._endDialogMsg = document.createElement('p');
    this._endDialogMsg.style.cssText = 'color:#fff;font-size:15px;margin:0 0 6px;';
    this._endDialogCount = document.createElement('p');
    this._endDialogCount.style.cssText = 'color:#aaa;font-size:13px;margin:0 0 16px;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;';

    this._endDialogAgreeBtn = document.createElement('button');
    this._endDialogAgreeBtn.textContent = '同意';
    this._endDialogAgreeBtn.style.cssText =
      'background:#4caf50;color:#fff;border:none;border-radius:20px;padding:8px 24px;font-size:14px;cursor:pointer;';

    this._endDialogRejectBtn = document.createElement('button');
    this._endDialogRejectBtn.textContent = '拒绝';
    this._endDialogRejectBtn.style.cssText =
      'background:#f44336;color:#fff;border:none;border-radius:20px;padding:8px 24px;font-size:14px;cursor:pointer;';

    btnRow.appendChild(this._endDialogAgreeBtn);
    btnRow.appendChild(this._endDialogRejectBtn);
    card.appendChild(this._endDialogMsg);
    card.appendChild(this._endDialogCount);
    card.appendChild(btnRow);
    this._endDialog.appendChild(card);
    document.body.appendChild(this._endDialog);
  }

  showEndGameDialog(initiator, agreed, total, canVote) {
    this._endDialog.style.display = 'flex';
    this._endDialogMsg.textContent = `${initiator} 希望结束本局游戏`;
    this._endDialogCount.textContent = `已同意 ${agreed}/${total}`;
    if (canVote) {
      this._endDialogAgreeBtn.style.display = 'inline-block';
      this._endDialogRejectBtn.style.display = 'inline-block';
    } else {
      this._endDialogAgreeBtn.style.display = 'none';
      this._endDialogRejectBtn.style.display = 'none';
    }
  }

  hideEndGameDialog() { if (this._endDialog) this._endDialog.style.display = 'none'; }
  onEndDialogAgree(cb) { if (this._endDialogAgreeBtn) this._endDialogAgreeBtn.addEventListener('click', cb); }
  onEndDialogReject(cb) { if (this._endDialogRejectBtn) this._endDialogRejectBtn.addEventListener('click', cb); }

  /* ================================================================
   *  RACE PROGRESS BAR (top of screen, markers for each player)
   * ================================================================ */

  _createRaceBar() {
    this._raceBar = document.createElement('div');
    this._raceBar.style.cssText =
      'display:none;position:fixed;top:50px;left:50%;transform:translateX(-50%);width:80%;z-index:10;';

    // Track line
    this._raceTrack = document.createElement('div');
    this._raceTrack.style.cssText =
      'position:relative;height:8px;background:rgba(255,255,255,0.15);border-radius:4px;';

    // Markers container
    this._raceMarkers = document.createElement('div');
    this._raceMarkers.style.cssText = 'position:relative;height:0;';

    this._raceBar.appendChild(this._raceTrack);
    this._raceBar.appendChild(this._raceMarkers);
    document.body.appendChild(this._raceBar);
  }

  showRaceBar() {
    this._raceMarkerEls = null;
    this._raceBar.style.display = 'block';
  }

  updateRaceBar(players, totalCubes) {
    // Rebuild if player set changed
    const rebuild = !this._raceMarkerEls ||
      players.length !== this._raceMarkerEls.length ||
      players.some((p, i) => this._raceMarkerEls[i]?.id !== p.id);
    if (rebuild) {
      this._raceMarkers.innerHTML = '';
      this._raceMarkerEls = [];
      for (const p of players) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText =
          'position:absolute;top:-22px;transform:translateX(-50%);text-align:center;';

        const av = document.createElement('div');
        av.style.cssText =
          'width:22px;height:22px;border-radius:4px;margin:0 auto 2px;overflow:hidden;' +
          `background:${p.color};background-size:cover;background-position:center;`;
        if (p.texURL) {
          av.style.backgroundImage = `url(${p.texURL})`;
          av.style.borderRadius = '4px';
        } else {
          av.style.borderRadius = '50%';
        }

        const lbl = document.createElement('span');
        lbl.style.cssText =
          'display:block;font-size:10px;color:rgba(255,255,255,0.8);white-space:nowrap;';
        lbl.textContent = p.name;

        wrapper.appendChild(av);
        wrapper.appendChild(lbl);
        this._raceMarkers.appendChild(wrapper);
        this._raceMarkerEls.push({ el: wrapper, id: p.id, idx: p.idx });
      }
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const marker = this._raceMarkerEls[i];
      if (!marker) continue;
      if (marker.idx === p.idx) continue;
      marker.idx = p.idx;
      const pct = Math.min(100, Math.max(0, (p.idx / totalCubes) * 100));
      marker.el.style.left = pct + '%';
    }
  }

  hideRaceBar() {
    this._raceMarkerEls = null;
    this._raceBar.style.display = 'none';
  }

  /* ================================================================
   *  TIMED SCOREBOARD (top-right corner)
   * ================================================================ */

  _createTimedLeaderboard() {
    this._timedBoard = document.createElement('div');
    this._timedBoard.style.cssText =
      'display:none;position:fixed;top:16px;right:16px;background:rgba(0,0,0,0.4);' +
      'border-radius:10px;padding:12px 16px;min-width:140px;z-index:10;';
    this._timedBoard.innerHTML = '<div style="color:#aaa;font-size:12px;margin-bottom:6px;">🏆 排行榜</div>';
    this._timedList = document.createElement('div');
    this._timedBoard.appendChild(this._timedList);
    document.body.appendChild(this._timedBoard);
  }

  showTimedLeaderboard() {
    this._timedBoard.style.display = 'block';
  }

  updateTimedLeaderboard(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    // Only rebuild if order or scores changed
    const hash = sorted.map(p => p.id + ':' + p.score).join('|');
    if (hash === this._timedHash) return;
    this._timedHash = hash;

    while (this._timedList.firstChild) this._timedList.removeChild(this._timedList.firstChild);
    sorted.forEach((p, i) => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:6px;padding:2px 0;color:#fff;font-size:13px;';
      const rank = document.createElement('span');
      rank.textContent = `${i + 1}.`;
      rank.style.cssText = 'color:#aaa;width:16px;';
      const av = document.createElement('span');
      av.style.cssText = `display:inline-block;width:16px;height:16px;background:${p.color};background-size:cover;background-position:center;`;
      if (p.texURL) { av.style.backgroundImage = `url(${p.texURL})`; av.style.borderRadius = '4px'; }
      else av.style.borderRadius = '50%';
      const info = document.createElement('span');
      info.textContent = p.name;
      info.style.cssText = 'flex:1;';
      const sc = document.createElement('span');
      sc.textContent = `${p.score}分`;
      sc.style.cssText = 'font-weight:bold;';
      row.appendChild(rank); row.appendChild(av); row.appendChild(info); row.appendChild(sc);
      this._timedList.appendChild(row);
    });
  }

  hideTimedLeaderboard() {
    this._timedHash = null;
    this._timedBoard.style.display = 'none';
  }

  /* ================================================================
   *  RELATIVE POSITION OVERLAY — large badges at fixed screen positions
   * ================================================================ */

  _createRelativeBar() {
    this._relBar = document.createElement('div');
    this._relBar.style.cssText =
      'display:none;position:fixed;inset:0;pointer-events:none;z-index:10;';
    // Self marker (fixed bottom-left)
    this._relSelf = document.createElement('div');
    this._relSelf.style.cssText =
      'position:absolute;left:12px;bottom:20px;padding:4px 12px;border-radius:6px;' +
      'background:rgba(0,0,0,0.5);color:#fff;font-size:13px;text-align:center;';
    this._relBar.appendChild(this._relSelf);
    // Containers
    this._relTop = document.createElement('div');
    this._relTop.style.cssText = 'position:absolute;left:12px;top:80px;display:flex;flex-direction:column;gap:12px;';
    this._relBar.appendChild(this._relTop);
    this._relBottom = document.createElement('div');
    this._relBottom.style.cssText = 'position:absolute;left:12px;bottom:60px;display:flex;flex-direction:column;gap:12px;';
    this._relBar.appendChild(this._relBottom);
    document.body.appendChild(this._relBar);
  }

  showRelativeBar() {
    if (!this._relBar) this._createRelativeBar();
    this._relBar.style.display = 'block';
  }

  updateRelativeBar(players, myName, myIdx) {
    if (!this._relBar) this._createRelativeBar();

    const ahead  = players.filter(p => p.idx > myIdx && p.name !== myName && p.idx - myIdx > 3);
    const behind = players.filter(p => p.idx < myIdx && p.name !== myName && myIdx - p.idx > 2);

    // Auto-scale: 75% on mobile, compress if many players
    const isMobile = window.innerWidth < 768;
    const total = ahead.length + behind.length;
    let scale = isMobile ? 0.75 : 1;
    if (total > 4) scale = Math.max(0.45, scale - (total - 4) * 0.1);

    this._relSelf.textContent = `你 · ${myIdx}格`;

    this._relTop.innerHTML = '';
    ahead.forEach(p => this._relTop.appendChild(this._bigBadge(p, `领先${p.idx - myIdx}格`, scale)));

    this._relBottom.innerHTML = '';
    behind.forEach(p => this._relBottom.appendChild(this._bigBadge(p, `落后${myIdx - p.idx}格`, scale)));

    // Adjust container gap for scale
    const gap = Math.round(8 * scale);
    this._relTop.style.gap = gap + 'px';
    this._relBottom.style.gap = gap + 'px';
  }

  _bigBadge(p, label, scale = 1) {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      `display:flex;flex-direction:column;align-items:center;gap:3px;transform:scale(${scale});transform-origin:top center;`;
    const avatarSize = Math.round(96 * scale);
    const fontSizeName = Math.round(14 * scale);
    const fontSizeDist = Math.round(15 * scale);

    // Large semi-transparent circle avatar
    const av = document.createElement('div');
    av.style.cssText =
      `width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;` +
      `background:${p.color};background-size:cover;background-position:center;` +
      'border:3px solid rgba(255,255,255,0.4);' +
      'box-shadow:0 0 20px rgba(0,0,0,0.5);' +
      'opacity:0.6;';
    if (p.texURL) {
      av.style.backgroundImage = `url(${p.texURL})`;
      av.style.borderRadius = '50%';
    }

    // Name
    const nameEl = document.createElement('span');
    nameEl.textContent = p.name;
    nameEl.style.cssText = `color:#fff;font-size:${fontSizeName}px;text-shadow:0 1px 4px #000;font-weight:bold;`;

    // Distance — bold pill badge
    const distEl = document.createElement('span');
    distEl.textContent = label;
    distEl.style.cssText =
      `color:#fff;font-size:${fontSizeDist}px;font-weight:bold;` +
      'background:rgba(0,0,0,0.6);padding:2px 10px;border-radius:10px;' +
      'text-shadow:0 1px 2px #000;';

    wrap.appendChild(av);
    wrap.appendChild(nameEl);
    wrap.appendChild(distEl);
    return wrap;
  }

  hideRelativeBar() {
    if (this._relBar) this._relBar.style.display = 'none';
  }

  /** Update tracked player data (called from Game loop). */
  setPlayerData(playerId, data) {
    this._playersData[playerId] = { ...this._playersData[playerId], ...data };
  }

  getPlayerData() {
    return Object.values(this._playersData);
  }

  /* ================================================================
   *  GAME-OVER OVERLAY
   * ================================================================ */

  _createGameOverOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);' +
      'flex-direction:column;align-items:center;justify-content:center;z-index:20;';

    const card = document.createElement('div');
    card.style.cssText =
      'background:rgba(0,0,0,0.55);border-radius:20px;padding:40px 60px;' +
      'text-align:center;border:1px solid rgba(255,255,255,0.1);';

    this._overlayTitle = document.createElement('p');
    this._overlayTitle.style.cssText = 'color:rgba(255,255,255,0.6);font-size:20px;margin:0 0 4px;';
    this._overlayTitle.textContent = '本次得分';

    this.finalScore = document.createElement('h1');
    this.finalScore.style.cssText =
      'color:#fff;font-size:60px;margin:0 0 8px;font-weight:bold;';

    this._overlayExtra = document.createElement('p');
    this._overlayExtra.style.cssText = 'color:#aaa;font-size:14px;margin:0 0 20px;white-space:pre-line;text-align:left;';

    this.restartBtn = document.createElement('button');
    this.restartBtn.textContent = '重新开始';
    this.restartBtn.style.cssText =
      'background:#fff;border:none;border-radius:24px;padding:10px 40px;' +
      'font-size:18px;font-weight:bold;cursor:pointer;';

    card.appendChild(this._overlayTitle);
    card.appendChild(this.finalScore);
    card.appendChild(this._overlayExtra);
    card.appendChild(this.restartBtn);
    this.overlay.appendChild(card);
    document.body.appendChild(this.overlay);
  }

  showGameOver(title, score, extra, buttonText, buttonCb) {
    this._overlayTitle.textContent = title || '本次得分';
    this._overlayExtra.textContent = extra || '';
    this.finalScore.textContent = score ?? '';
    this.restartBtn.textContent = buttonText || '重新开始';
    this._gameOverCb = buttonCb || null;
    this.overlay.style.display = 'flex';
  }

  showGameOverMsg(title, msg) {
    this.showGameOver(title, '', msg);
  }

  hideGameOver() {
    this.overlay.style.display = 'none';
  }

  onRestart(fn) {
    this.restartBtn.addEventListener('click', () => {
      if (this._gameOverCb) {
        this._gameOverCb();
        this._gameOverCb = null;
      } else {
        fn();
      }
    });
  }

  /* ================================================================
   *  UPLOAD DIALOG
   * ================================================================ */

  _createUploadDialog() {
    const container = document.createElement('div');
    container.style.cssText =
      'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.6);' +
      'flex-direction:column;align-items:center;justify-content:center;z-index:30;';

    const card = document.createElement('div');
    card.style.cssText =
      'background:rgba(60,60,60,0.95);border-radius:16px;padding:32px 40px;' +
      'text-align:center;max-width:360px;width:90%;';

    card.innerHTML = '<p style="color:#fff;font-size:18px;margin:0 0 6px;font-weight:bold;">自定义角色</p>' +
      '<p style="color:#999;font-size:13px;margin:0 0 18px;">可选上传图片 + 调色 + 命名</p>';

    // Name input
    this._nameInput = document.createElement('input');
    this._nameInput.placeholder = '你的昵称';
    this._nameInput.value = '玩家';
    this._nameInput.style.cssText =
      'background:#444;color:#fff;border:none;border-radius:8px;padding:6px 12px;' +
      'font-size:14px;text-align:center;width:140px;outline:none;margin-bottom:14px;';

    // Color picker
    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px;';
    const colorLabel = document.createElement('span');
    colorLabel.textContent = '颜色';
    colorLabel.style.cssText = 'color:#ccc;font-size:14px;';
    this._colorInput = document.createElement('input');
    this._colorInput.type = 'color';
    this._colorInput.value = '#232323';
    this._colorInput.style.cssText = 'width:36px;height:36px;border:none;cursor:pointer;background:none;padding:0;';
    colorRow.appendChild(colorLabel);
    colorRow.appendChild(this._colorInput);

    // Preview / image upload
    const preview = document.createElement('div');
    preview.style.cssText =
      'width:120px;height:120px;margin:0 auto 16px;border-radius:50%;' +
      'border:2px dashed #777;display:flex;align-items:center;justify-content:center;' +
      'cursor:pointer;overflow:hidden;background:rgba(255,255,255,0.05);';
    const previewText = document.createElement('span');
    previewText.textContent = '点击选图';
    previewText.style.cssText = 'color:#999;font-size:14px;';
    preview.appendChild(previewText);
    const previewImg = document.createElement('img');
    previewImg.style.cssText = 'display:none;width:100%;height:100%;object-fit:cover;';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const startBtn = document.createElement('button');
    startBtn.textContent = '确定';
    startBtn.style.cssText =
      'background:#fff;color:#333;border:none;border-radius:20px;' +
      'padding:8px 24px;font-size:14px;font-weight:bold;cursor:pointer;';

    preview.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Center-crop to largest square, fit into preview
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 120;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 120, 120);
          previewImg.src = canvas.toDataURL('image/jpeg', 0.85);
          previewImg.style.display = 'block';
          previewText.style.display = 'none';
          preview.style.borderColor = '#4caf50';
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });

    btnRow.appendChild(startBtn);
    preview.appendChild(previewImg); // img INSIDE the circle
    card.appendChild(this._nameInput);
    card.appendChild(colorRow);
    card.appendChild(preview);

    // ---- Audio section ----
    const audioSection = document.createElement('div');
    audioSection.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;gap:8px;';
    audioSection.innerHTML = '<span style="color:#aaa;font-size:12px;">自定义音效(可选)</span>';
    // Charge audio row
    const chargeRow = this._makeAudioRow('蓄力音效', 'charge');
    // Jump audio row
    const jumpRow = this._makeAudioRow('跳跃音效', 'jump');
    audioSection.appendChild(chargeRow);
    audioSection.appendChild(jumpRow);
    card.appendChild(audioSection);

    btnRow.appendChild(startBtn);
    card.appendChild(btnRow);
    container.appendChild(card);
    document.body.appendChild(container);

    this._uploadContainer  = container;
    this._uploadFileInput  = fileInput;
    this._uploadPreviewImg  = previewImg;
    this._uploadPreviewText = previewText;
    this._uploadStartBtn    = startBtn;
  }

  _makeAudioRow(label, kind) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'color:#ccc;font-size:12px;width:60px;';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.cssText = 'color:#aaa;font-size:11px;flex:1;min-width:0;';
    const status = document.createElement('span');
    status.style.cssText = 'color:#888;font-size:10px;min-width:18px;text-align:center;';
    input.addEventListener('change', () => {
      status.textContent = input.files[0] ? '✅' : '';
    });

    // Record button
    const recordBtn = document.createElement('button');
    recordBtn.textContent = '🎙️';
    recordBtn.title = '点击录音';
    recordBtn.style.cssText =
      'background:transparent;border:1px solid #555;color:#aaa;border-radius:4px;' +
      'padding:2px 6px;font-size:14px;cursor:pointer;flex-shrink:0;';
    let mediaRecorder = null, chunks = [];

    recordBtn.addEventListener('click', async () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        // Stop recording
        mediaRecorder.stop();
        recordBtn.textContent = '🎙️';
        recordBtn.style.borderColor = '#555';
        status.textContent = '⏳';
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const file = new File([blob], `${kind}.webm`, { type: 'audio/webm' });
          // Inject into the file input
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          status.textContent = '✅';
          mediaRecorder = null;
        };
        mediaRecorder.start();
        recordBtn.textContent = '🔴';
        recordBtn.style.borderColor = '#f44336';
        status.textContent = '';
      } catch {
        status.textContent = '❌';
      }
    });

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(recordBtn);
    row.appendChild(status);
    if (kind === 'charge') this._chargeAudioInput = input;
    else this._jumpAudioInput = input;
    return row;
  }

  showUploadDialog() {
    return new Promise((resolve) => {
      this._uploadContainer.style.display = 'flex';
      this.showChatInput(false);
      const finish = (texture, texDataURL, chargeAudioURL, jumpAudioURL) => {
        this._uploadContainer.style.display = 'none';
        resolve({ name: this._nameInput.value.trim() || '玩家', texture, color: this._colorInput.value, texDataURL, chargeAudioURL, jumpAudioURL });
      };
      this._uploadStartBtn.onclick = () => {
        const imgFile = this._uploadFileInput.files[0];
        // Read audio files
        const audioPromises = [];
        const chargeFile = this._chargeAudioInput?.files[0];
        const jumpFile = this._jumpAudioInput?.files[0];
        if (chargeFile) {
          audioPromises.push(new Promise(r => { const rd = new FileReader(); rd.onload = e => r({ kind: 'charge', url: e.target.result }); rd.readAsDataURL(chargeFile); }));
        }
        if (jumpFile) {
          audioPromises.push(new Promise(r => { const rd = new FileReader(); rd.onload = e => r({ kind: 'jump', url: e.target.result }); rd.readAsDataURL(jumpFile); }));
        }

        const thenFinish = (tex, texURL) => {
          if (audioPromises.length === 0) { finish(tex, texURL, null, null); return; }
          Promise.all(audioPromises).then(results => {
            let cu = null, ju = null;
            for (const r of results) { if (r.kind === 'charge') cu = r.url; else ju = r.url; }
            finish(tex, texURL, cu, ju);
          });
        };

        if (!imgFile) { thenFinish(null, null); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          const rawURL = e.target.result;
          img.onload = () => {
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
            const croppedURL = canvas.toDataURL('image/jpeg', 0.85);
            const croppedImg = new Image();
            croppedImg.onload = () => {
              const tex = new THREE.Texture(croppedImg);
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              tex.center.set(0.5, 0.5);
              tex.rotation = 2 * Math.PI / 3;
              tex.needsUpdate = true;
              thenFinish(tex, croppedURL);
            };
            croppedImg.src = croppedURL;
          };
          img.src = rawURL;
        };
        reader.readAsDataURL(imgFile);
      };
    });
  }

  /* ================================================================
   *  ROOM SCREEN
   * ================================================================ */

  _createRoomScreen() {
    const c = document.createElement('div');
    c.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);' +
      'flex-direction:column;align-items:center;justify-content:center;z-index:30;';

    const createCard = document.createElement('div');
    createCard.style.cssText =
      'background:rgba(50,50,50,0.95);border-radius:14px;padding:24px 32px;text-align:center;';
    createCard.innerHTML = '<p style="color:#fff;font-size:16px;margin:0 0 16px;">创建新房间</p>';
    const createBtn = document.createElement('button');
    createBtn.textContent = '创建房间';
    createBtn.style.cssText =
      'background:#4caf50;color:#fff;border:none;border-radius:20px;padding:10px 30px;font-size:15px;cursor:pointer;';
    createCard.appendChild(createBtn);

    const joinCard = document.createElement('div');
    joinCard.style.cssText =
      'background:rgba(50,50,50,0.95);border-radius:14px;padding:24px 32px;text-align:center;margin-top:16px;';
    joinCard.innerHTML = '<p style="color:#fff;font-size:16px;margin:0 0 12px;">加入已有房间</p>';
    const codeInput = document.createElement('input');
    codeInput.placeholder = '房间号';
    codeInput.style.cssText =
      'background:#444;color:#fff;border:none;border-radius:8px;padding:8px 12px;' +
      'font-size:18px;text-align:center;letter-spacing:2px;width:120px;outline:none;';
    const joinBtn = document.createElement('button');
    joinBtn.textContent = '加入';
    joinBtn.style.cssText =
      'background:#2196f3;color:#fff;border:none;border-radius:20px;padding:10px 30px;' +
      'font-size:15px;cursor:pointer;margin-top:12px;';
    joinCard.appendChild(codeInput);
    joinCard.appendChild(document.createElement('br'));
    joinCard.appendChild(joinBtn);

    c.appendChild(createCard);
    c.appendChild(joinCard);
    document.body.appendChild(c);

    this._roomScreen = c;
    this._roomCodeInput = codeInput;
    this._roomCreateBtn = createBtn;
    this._roomJoinBtn = joinBtn;
  }

  _createWaitingScreen() {
    const c = document.createElement('div');
    c.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);' +
      'flex-direction:column;align-items:center;justify-content:center;z-index:30;';

    const card = document.createElement('div');
    card.style.cssText =
      'background:rgba(50,50,50,0.95);border-radius:14px;padding:28px 36px;text-align:center;min-width:320px;max-height:90vh;overflow-y:auto;';

    this._roomCodeLabel = document.createElement('p');
    this._roomCodeLabel.style.cssText = 'color:#aaa;font-size:13px;margin:0 0 8px;';
    this._roomCodeLabel.style.display = 'inline';

    // Copy button
    this._copyBtn = document.createElement('button');
    this._copyBtn.textContent = '📋';
    this._copyBtn.style.cssText =
      'background:transparent;border:1px solid #555;color:#aaa;border-radius:6px;' +
      'padding:2px 8px;font-size:12px;cursor:pointer;margin-left:8px;';
    this._copyBtn.title = '复制房间号';

    // Room code row
    this._roomCodeRow = document.createElement('div');
    this._roomCodeRow.style.cssText = 'margin-bottom:8px;';
    this._roomCodeRow.appendChild(this._roomCodeLabel);
    this._roomCodeRow.appendChild(this._copyBtn);

    // Mode row (host editable)
    this._modeRow = document.createElement('div');
    this._modeRow.style.cssText = 'margin:8px 0;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;';
    this._modeSelect = document.createElement('select');
    this._modeSelect.style.cssText =
      'background:#444;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:13px;';
    this._modeSelect.innerHTML = '<option value="race">赛跑</option><option value="timed">限时</option>';
    this._modeParamInput = document.createElement('input');
    this._modeParamInput.type = 'number';
    this._modeParamInput.min = '1';
    this._modeParamInput.value = '100';
    this._modeParamInput.style.cssText =
      'background:#444;color:#fff;border:none;border-radius:6px;padding:4px 6px;font-size:13px;width:50px;text-align:center;';
    this._modeParamLabel = document.createElement('span');
    this._modeParamLabel.style.cssText = 'color:#aaa;font-size:12px;';
    this._modeParamLabel.textContent = '格';

    this._modeReadonly = document.createElement('span');
    this._modeReadonly.style.cssText = 'color:#aaa;font-size:13px;display:none;';
    this._modeRow.appendChild(this._modeSelect);
    this._modeRow.appendChild(this._modeParamInput);
    this._modeRow.appendChild(this._modeParamLabel);
    this._modeRow.appendChild(this._modeReadonly);

    // -- Random faces toggle row --
    this._randomFacesRow = document.createElement('div');
    this._randomFacesRow.style.cssText = 'margin:6px 0;display:flex;align-items:center;justify-content:center;gap:8px;';
    this._randomFacesToggle = document.createElement('input');
    this._randomFacesToggle.type = 'checkbox';
    this._randomFacesToggle.style.cssText = 'width:16px;height:16px;cursor:pointer;';
    this._randomFacesLabel = document.createElement('span');
    this._randomFacesLabel.textContent = '随机地块';
    this._randomFacesLabel.style.cssText = 'color:#ccc;font-size:13px;';
    this._randomFacesDesc = document.createElement('span');
    this._randomFacesDesc.textContent = '(地块顶部随机显示玩家头像)';
    this._randomFacesDesc.style.cssText = 'color:#888;font-size:11px;';
    this._randomFacesReadonly = document.createElement('span');
    this._randomFacesReadonly.style.cssText = 'color:#aaa;font-size:13px;display:none;';
    this._randomFacesRow.appendChild(this._randomFacesToggle);
    this._randomFacesRow.appendChild(this._randomFacesLabel);
    this._randomFacesRow.appendChild(this._randomFacesDesc);
    this._randomFacesRow.appendChild(this._randomFacesReadonly);

    this._playerList = document.createElement('div');
    this._playerList.style.cssText = 'margin:12px 0;text-align:left;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-top:16px;';

    this._readyBtn = document.createElement('button');
    this._readyBtn.textContent = '准备';
    this._readyBtn.style.cssText =
      'background:#ff9800;color:#fff;border:none;border-radius:20px;padding:8px 24px;font-size:14px;cursor:pointer;';

    this._waitStartBtn = document.createElement('button');
    this._waitStartBtn.textContent = '开始游戏';
    this._waitStartBtn.style.cssText =
      'background:#4caf50;color:#fff;border:none;border-radius:20px;padding:8px 24px;font-size:14px;cursor:pointer;';

    const leaveBtn = document.createElement('button');
    leaveBtn.textContent = '离开';
    leaveBtn.style.cssText =
      'background:transparent;color:#999;border:1px solid #555;border-radius:20px;padding:8px 24px;font-size:14px;cursor:pointer;';

    this._waitStartBtn.style.display = 'none';

    btnRow.appendChild(this._readyBtn);
    btnRow.appendChild(this._waitStartBtn);
    btnRow.appendChild(leaveBtn);

    card.appendChild(this._roomCodeRow);
    card.appendChild(this._modeRow);
    card.appendChild(this._randomFacesRow);
    card.appendChild(this._playerList);
    card.appendChild(btnRow);
    c.appendChild(card);
    document.body.appendChild(c);

    this._waitingScreen = c;
    this._waitLeaveBtn = leaveBtn;
    this._isReady = false;
    this._amHost = false;
  }

  showRoomScreen() {
    return new Promise((resolve) => {
      if (!this._roomScreen) this._createRoomScreen();
      this._roomScreen.style.display = 'flex';
      this.showChatInput(false);
      const finish = (action, data) => {
        this._roomScreen.style.display = 'none';
        resolve({ action, data });
      };
      this._roomCreateBtn.onclick = () => finish('create', null);
      this._roomJoinBtn.onclick = () => {
        const code = this._roomCodeInput.value.trim().toUpperCase();
        if (code) finish('join', code);
      };
    });
  }

  showWaitingScreen(roomId, amHost, modeConfig) {
    if (!this._waitingScreen) this._createWaitingScreen();
    this._waitingScreen.style.display = 'flex';
    this.showChatInput(true);
    this._roomCodeLabel.textContent = `房间号: ${roomId}`;
    this._copyBtn.onclick = () => {
      navigator.clipboard.writeText(roomId).then(() => {
        this._copyBtn.textContent = '✅';
        setTimeout(() => { this._copyBtn.textContent = '📋'; }, 1500);
      }).catch(() => {
        // Fallback: select text manually
        const ta = document.createElement('textarea');
        ta.value = roomId;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this._copyBtn.textContent = '✅';
        setTimeout(() => { this._copyBtn.textContent = '📋'; }, 1500);
      });
    };
    this._amHost = amHost;

    if (amHost) {
      this._readyBtn.style.display = 'none';
      this._waitStartBtn.style.display = 'inline-block';
      this._waitStartBtn.disabled = true;
      this._waitStartBtn.style.opacity = '0.5';
      // Editable mode controls
      this._modeSelect.style.display = 'inline-block';
      this._modeParamInput.style.display = 'inline-block';
      this._modeParamLabel.style.display = 'inline';
      this._modeReadonly.style.display = 'none';
      // Random faces toggle
      this._randomFacesToggle.style.display = 'inline-block';
      this._randomFacesLabel.style.display = 'inline';
      this._randomFacesDesc.style.display = 'inline';
      this._randomFacesReadonly.style.display = 'none';
      if (modeConfig) {
        this._modeSelect.value = modeConfig.mode || 'race';
        this._modeParamInput.value = modeConfig.param != null ? modeConfig.param : 100;
        this._randomFacesToggle.checked = modeConfig.randomFaces || false;
      }
      this._modeParamLabel.textContent = this._modeSelect.value === 'race' ? '格' : '秒';
    } else {
      this._readyBtn.style.display = 'inline-block';
      this._readyBtn.textContent = '准备';
      this._readyBtn.style.background = '#ff9800';
      this._isReady = false;
      this._waitStartBtn.style.display = 'none';
      // Readonly mode display
      this._modeSelect.style.display = 'none';
      this._modeParamInput.style.display = 'none';
      this._modeParamLabel.style.display = 'none';
      this._modeReadonly.style.display = 'inline-block';
      // Readonly random faces display
      this._randomFacesToggle.style.display = 'none';
      this._randomFacesLabel.style.display = 'none';
      this._randomFacesDesc.style.display = 'none';
      this._randomFacesReadonly.style.display = 'inline-block';
      if (modeConfig) {
        const label = modeConfig.mode === 'race' ? '赛跑' : '限时';
        this._modeReadonly.textContent = `${label} ${modeConfig.param}${modeConfig.mode === 'race' ? '格' : '秒'}`;
        if (modeConfig.randomFaces) {
          this._randomFacesReadonly.textContent = '🎲 随机地块已启用';
        } else {
          this._randomFacesReadonly.textContent = '';
        }
      } else {
        this._modeReadonly.textContent = '等待房主设置…';
      }
    }
    this._playerList.innerHTML = '';
  }

  /** Returns { mode, param } or null if host hasn't changed */
  getModeConfig() {
    return {
      mode: this._modeSelect.value,
      param: parseInt(this._modeParamInput.value) || 100,
    };
  }

  updateWaitingRoom(players, myId) {
    if (!this._playerList) return;

    const me = players.find(p => p.id === myId);
    const others = players.filter(p => p.id !== myId);
    const allOthersReady = others.length > 0 && others.every(p => p.ready);

    if (!this._amHost && me) {
      this._isReady = me.ready;
      this._readyBtn.textContent = me.ready ? '取消准备' : '准备';
      this._readyBtn.style.background = me.ready ? '#4caf50' : '#ff9800';
    }
    if (this._amHost) {
      this._waitStartBtn.disabled = !allOthersReady;
      this._waitStartBtn.style.opacity = allOthersReady ? '1' : '0.5';
    }

    this._playerList.innerHTML = '';
    for (const p of players) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:4px 0;color:#fff;font-size:14px;';

      const sw = document.createElement('span');
      sw.style.cssText = `display:inline-block;width:14px;height:14px;border-radius:50%;background:${p.color};`;

      const name = document.createElement('span');
      name.textContent = (p.name || '玩家') + (p.id === myId ? (this._amHost ? '(房主)' : '') : '');

      const badge = document.createElement('span');
      badge.textContent = p.ready ? '✅' : (p.id === myId && this._amHost ? '🏠' : '⏳');
      badge.style.cssText = 'font-size:14px;margin-left:4px;';

      // Ping indicator
      const pingDot = document.createElement('span');
      const ping = p.ping || 0;
      pingDot.style.cssText =
        `display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:4px;` +
        `background:${ping <= 0 ? '#555' : ping < 150 ? '#4caf50' : ping < 500 ? '#ff9800' : '#f44336'};`;
      pingDot.title = ping > 0 ? `延迟: ${ping}ms` : '延迟: 未知';
      const pingText = document.createElement('span');
      pingText.textContent = ping > 0 ? `${ping}ms` : '';
      pingText.style.cssText = 'font-size:10px;color:#999;margin-left:2px;';

      row.appendChild(sw);
      row.appendChild(name);
      row.appendChild(badge);
      row.appendChild(pingDot);
      row.appendChild(pingText);
      this._playerList.appendChild(row);
    }
  }

  onRoomReady(cb) {
    if (!this._readyBtn) this._createWaitingScreen();
    this._readyBtn.addEventListener('click', () => {
      this._isReady = !this._isReady;
      cb(this._isReady);
    });
  }

  onRoomStartGame(cb) {
    if (!this._waitStartBtn) this._createWaitingScreen();
    this._waitStartBtn.addEventListener('click', cb);
  }

  onRoomLeave(cb) {
    if (!this._waitLeaveBtn) this._createWaitingScreen();
    this._waitLeaveBtn.addEventListener('click', () => {
      this._waitingScreen.style.display = 'none';
      cb();
    });
  }

  hideWaitingScreen() {
    if (this._waitingScreen) this._waitingScreen.style.display = 'none';
  }

  /** Host-only: detect mode change and emit */
  onModeChange(cb) {
    if (!this._modeSelect) return;
    const handler = () => {
      this._modeParamLabel.textContent = this._modeSelect.value === 'race' ? '格' : '秒';
      cb(this.getModeConfig());
    };
    this._modeSelect.addEventListener('change', handler);
    this._modeParamInput.addEventListener('input', handler);
  }

  /** Host-only: detect random-faces toggle */
  onRandomFacesToggle(cb) {
    if (!this._randomFacesToggle) return;
    this._randomFacesToggle.addEventListener('change', () => {
      cb(this._randomFacesToggle.checked);
    });
  }

  /** Update mode display for non-host players (called on room_update). */
  updateModeDisplay(modeConfig) {
    if (!modeConfig || this._amHost || !this._modeReadonly) return;
    const label = modeConfig.mode === 'race' ? '赛跑' : '限时';
    this._modeReadonly.textContent = `${label} ${modeConfig.param}${modeConfig.mode === 'race' ? '格' : '秒'}`;
    // Also update random faces read-only
    if (this._randomFacesReadonly) {
      this._randomFacesReadonly.textContent = modeConfig.randomFaces ? '🎲 随机地块已启用' : '';
    }
  }

  /* ================================================================
   *  CHAT
   * ================================================================ */

  _createChat() {
    if (this._chatContainer) return;
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;pointer-events:none;z-index:200;';

    // -- Input bar --
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 16px 12px;' +
      'background:linear-gradient(transparent, rgba(0,0,0,0.6));pointer-events:auto;';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 80;
    input.placeholder = '输入消息...';
    input.style.cssText = 'width:220px;max-width:60vw;padding:6px 10px;border-radius:16px;border:1px solid rgba(255,255,255,0.25);' +
      'background:rgba(0,0,0,0.45);color:#fff;font-size:13px;outline:none;';
    const emojiBtn = document.createElement('button');
    emojiBtn.textContent = '😄';
    emojiBtn.style.cssText = 'background:transparent;border:none;font-size:20px;cursor:pointer;padding:2px;';
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '发送';
    sendBtn.style.cssText = 'background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:16px;' +
      'padding:6px 14px;font-size:13px;cursor:pointer;';

    // -- Emoji picker --
    const picker = document.createElement('div');
    picker.style.cssText = 'display:none;position:fixed;bottom:52px;left:50%;transform:translateX(-50%);' +
      'background:rgba(30,30,30,0.95);border-radius:12px;padding:8px;grid-template-columns:repeat(8,32px);gap:4px;' +
      'z-index:201;max-width:90vw;overflow-y:auto;max-height:200px;pointer-events:auto;';
    const emojis = '😀😃😄😁😅😂🤣😊😇🙂😉😌😍🥰😘😗😙😚😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶😵🤯🤠🥳🥸😎🤓🧐😕😟🙁😮😯😲😳🥺😢😭😤😡🤬💀☠️💩🤡👹👺👻👽🤖😺😸😹😻😼😽🙀😿😾❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝👍👎👏🙌🤝💪🦾🦿🦶👂🦻👃🧠🫀🫁🦷🦴👀👁👅👄';
    picker.style.display = 'none';
    for (const ch of emojis) {
      const btn = document.createElement('span');
      btn.textContent = ch;
      btn.style.cssText = 'font-size:20px;text-align:center;cursor:pointer;padding:2px;border-radius:4px;';
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.2)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const start = input.selectionStart ?? input.value.length;
        input.value = input.value.slice(0, start) + ch + input.value.slice(start);
        input.focus();
        picker.style.display = 'none';
      });
      picker.appendChild(btn);
    }
    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target) && e.target !== emojiBtn) picker.style.display = 'none';
    });

    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      picker.style.display = picker.style.display === 'grid' ? 'none' : 'grid';
    });

    const send = () => {
      const msg = input.value.trim();
      if (!msg) return;
      if (this._chatSendCb) this._chatSendCb(msg);
      input.value = '';
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });

    bar.appendChild(input);
    bar.appendChild(emojiBtn);
    bar.appendChild(sendBtn);

    // -- Chat log (bottom-left) --
    const log = document.createElement('div');
    log.style.cssText = 'position:fixed;top:85px;left:50%;transform:translateX(-50%);max-width:500px;display:flex;flex-direction:column;align-items:center;gap:4px;' +
      'pointer-events:none;z-index:9;';
    log.id = 'chat-log';

    c.appendChild(log);
    c.appendChild(bar);
    c.appendChild(picker);
    document.body.appendChild(c);

    this._chatContainer = c;
    this._chatInput = input;
    this._chatLog = log;
    this._chatPicker = picker;
    this._chatFadeTimer = null;
    this._chatMessages = []; // { el, expires }
  }

  showChatInput(visible) {
    if (!this._chatContainer) this._createChat();
    this._chatContainer.style.display = visible ? 'block' : 'none';
  }

  onChatSend(cb) { this._chatSendCb = cb; }

  addChatMessage(data) {
    if (!this._chatContainer) this._createChat();

    // Create row: color dot + name: message
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:6px;color:#fff;font-size:12px;' +
      'background:rgba(0,0,0,0.55);border-radius:8px;padding:4px 8px;transition:opacity 0.4s;opacity:1;';
    const dot = document.createElement('span');
    dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${data.color || '#fff'};margin-top:4px;flex-shrink:0;`;
    const text = document.createElement('span');
    text.textContent = `${data.name}: ${data.message}`;
    row.appendChild(dot);
    row.appendChild(text);
    this._chatLog.appendChild(row);

    const entry = { el: row, expires: Date.now() + 10000 };
    this._chatMessages.push(entry);

    // Reset fade timer for all messages
    this._resetChatFade();
  }

  _resetChatFade() {
    if (this._chatFadeTimer) clearTimeout(this._chatFadeTimer);
    // Ensure all messages are fully visible
    for (const e of this._chatMessages) {
      e.el.style.opacity = '1';
      e.expires = Date.now() + 10000;
    }
    // Set timer to start fade after 10s
    this._chatFadeTimer = setTimeout(() => this._fadeChatOut(), 10000);
  }

  _fadeChatOut() {
    this._chatFadeTimer = setTimeout(() => {
      // Remove all messages after fade completes
      for (const e of this._chatMessages) {
        if (e.el.parentNode) e.el.remove();
      }
      this._chatMessages.length = 0;
    }, 2000);
    // Start fade
    for (const e of this._chatMessages) e.el.style.opacity = '0';
  }
}
