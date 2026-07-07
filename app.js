"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getDatabase, ref, set, get, onValue, off, runTransaction,
  update, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWBbDvDSkLr8ojm-Dr2rWfvqV2Gvsi-Ok",
  authDomain: "othello-online-c9697.firebaseapp.com",
  databaseURL: "https://othello-online-c9697-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "othello-online-c9697",
  storageBucket: "othello-online-c9697.firebasestorage.app",
  messagingSenderId: "261503404565",
  appId: "1:261503404565:web:1860206f1db8300715dc1c"
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);


const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const SINGLE_PLAYER = "single";
const TWO_PLAYERS = "multi";
const ONLINE_PLAY = "online";

class Board {
  static DIRECTIONS = [
    [-1,-1], [-1,0], [-1,1], [0,-1],
    [0,1], [1,-1], [1,0], [1,1]
  ];

  constructor(cells = null) {
    this.cells = cells ? cells.map(row => [...row]) : Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
    if (!cells) {
      this.cells[3][3] = WHITE;
      this.cells[3][4] = BLACK;
      this.cells[4][3] = BLACK;
      this.cells[4][4] = WHITE;
    }
  }

  clone() { return new Board(this.cells); }
  isInside(row, col) { return row >= 0 && row < 8 && col >= 0 && col < 8; }
  isEmpty(row, col) { return this.isInside(row, col) && this.cells[row][col] === EMPTY; }
  opponent(player) { return player === BLACK ? WHITE : BLACK; }
  getCell(row, col) { return this.isInside(row, col) ? this.cells[row][col] : EMPTY; }

  canFlipDirection(row, col, player, dr, dc) {
    if (!this.isEmpty(row, col)) return false;
    const opponent = this.opponent(player);
    let r = row + dr;
    let c = col + dc;
    if (!this.isInside(r, c) || this.cells[r][c] !== opponent) return false;
    r += dr;
    c += dc;
    while (this.isInside(r, c)) {
      if (this.cells[r][c] === EMPTY) return false;
      if (this.cells[r][c] === player) return true;
      r += dr;
      c += dc;
    }
    return false;
  }

  canPlaceStone(row, col, player) {
    return Board.DIRECTIONS.some(([dr, dc]) => this.canFlipDirection(row, col, player, dr, dc));
  }

  placeStone(row, col, player) {
    if (!this.canPlaceStone(row, col, player)) return false;
    for (const [dr, dc] of Board.DIRECTIONS) {
      if (!this.canFlipDirection(row, col, player, dr, dc)) continue;
      let r = row + dr;
      let c = col + dc;
      while (this.cells[r][c] === this.opponent(player)) {
        this.cells[r][c] = player;
        r += dr;
        c += dc;
      }
    }
    this.cells[row][col] = player;
    return true;
  }

  getValidMoves(player) {
    const moves = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (this.canPlaceStone(row, col, player)) moves.push({ row, col });
      }
    }
    return moves;
  }

  hasValidMove(player) { return this.getValidMoves(player).length > 0; }
  countStones(player) { return this.cells.flat().filter(cell => cell === player).length; }
  countEmpty() { return this.cells.flat().filter(cell => cell === EMPTY).length; }
  serialize() { return this.cells.flat().join(""); }
}

class RandomCpu {
  chooseMove(board, player) {
    const moves = board.getValidMoves(player);
    return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
  }
}

class HeuristicCpu {
  static SCORES = [
    [100,-25,10,5,5,10,-25,100],
    [-25,-50,-2,-2,-2,-2,-50,-25],
    [10,-2,5,1,1,5,-2,10],
    [5,-2,1,0,0,1,-2,5],
    [5,-2,1,0,0,1,-2,5],
    [10,-2,5,1,1,5,-2,10],
    [-25,-50,-2,-2,-2,-2,-50,-25],
    [100,-25,10,5,5,10,-25,100]
  ];

  chooseMove(board, player) {
    const moves = board.getValidMoves(player);
    if (!moves.length) return null;
    const best = Math.max(...moves.map(m => HeuristicCpu.SCORES[m.row][m.col]));
    const candidates = moves.filter(m => HeuristicCpu.SCORES[m.row][m.col] === best);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

class SearchCpu {
  constructor({ normalDepth, completeSearchAt, impossible = false }) {
    this.normalDepth = normalDepth;
    this.completeSearchAt = completeSearchAt;
    this.impossible = impossible;
    this.cache = new Map();
    this.positionScores = impossible ? [
      [500,-120,30,10,10,30,-120,500],
      [-120,-180,-15,-10,-10,-15,-180,-120],
      [30,-15,20,5,5,20,-15,30],
      [10,-10,5,1,1,5,-10,10],
      [10,-10,5,1,1,5,-10,10],
      [30,-15,20,5,5,20,-15,30],
      [-120,-180,-15,-10,-10,-15,-180,-120],
      [500,-120,30,10,10,30,-120,500]
    ] : [
      [120,-25,20,5,5,20,-25,120],
      [-25,-50,-5,-5,-5,-5,-50,-25],
      [20,-5,15,3,3,15,-5,20],
      [5,-5,3,1,1,3,-5,5],
      [5,-5,3,1,1,3,-5,5],
      [20,-5,15,3,3,15,-5,20],
      [-25,-50,-5,-5,-5,-5,-50,-25],
      [120,-25,20,5,5,20,-25,120]
    ];
  }

  chooseMove(board, player) {
    const moves = this.sortMoves(board.getValidMoves(player));
    if (!moves.length) return null;
    this.cache.clear();
    const empty = board.countEmpty();
    const depth = empty <= this.completeSearchAt ? empty : this.normalDepth;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;
    for (const move of moves) {
      const next = board.clone();
      next.placeStone(move.row, move.col, player);
      const score = this.minimax(next, next.opponent(player), player, depth - 1, alpha, Infinity);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
    }
    return bestMove;
  }

  minimax(board, currentPlayer, cpuPlayer, depth, alpha, beta) {
    const opponent = board.opponent(currentPlayer);
    const currentHasMove = board.hasValidMove(currentPlayer);
    const opponentHasMove = board.hasValidMove(opponent);
    if (!currentHasMove && !opponentHasMove) return this.evaluateFinal(board, cpuPlayer);
    if (depth <= 0) return this.evaluate(board, cpuPlayer);

    const key = `${board.serialize()}:${currentPlayer}:${depth}`;
    if (this.impossible && this.cache.has(key)) return this.cache.get(key);

    if (!currentHasMove) {
      const score = this.minimax(board, opponent, cpuPlayer, depth, alpha, beta);
      if (this.impossible) this.cache.set(key, score);
      return score;
    }

    const moves = this.sortMoves(board.getValidMoves(currentPlayer));
    let result;
    if (currentPlayer === cpuPlayer) {
      result = -Infinity;
      for (const move of moves) {
        const next = board.clone();
        next.placeStone(move.row, move.col, currentPlayer);
        result = Math.max(result, this.minimax(next, opponent, cpuPlayer, depth - 1, alpha, beta));
        alpha = Math.max(alpha, result);
        if (beta <= alpha) break;
      }
    } else {
      result = Infinity;
      for (const move of moves) {
        const next = board.clone();
        next.placeStone(move.row, move.col, currentPlayer);
        result = Math.min(result, this.minimax(next, opponent, cpuPlayer, depth - 1, alpha, beta));
        beta = Math.min(beta, result);
        if (beta <= alpha) break;
      }
    }
    if (this.impossible) this.cache.set(key, result);
    return result;
  }

  sortMoves(moves) {
    return [...moves].sort((a, b) => this.positionScores[b.row][b.col] - this.positionScores[a.row][a.col]);
  }

  evaluate(board, cpuPlayer) {
    const opponent = board.opponent(cpuPlayer);
    const empty = board.countEmpty();
    let score = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = board.getCell(row, col);
        if (cell === cpuPlayer) score += this.positionScores[row][col];
        if (cell === opponent) score -= this.positionScores[row][col];
      }
    }

    const mobilityWeight = this.impossible ? 25 : 15;
    score += (board.getValidMoves(cpuPlayer).length - board.getValidMoves(opponent).length) * mobilityWeight;
    score += this.evaluateCorners(board, cpuPlayer, opponent);
    score += this.evaluateCornerDanger(board, cpuPlayer, opponent);
    score += this.evaluateFrontier(board, cpuPlayer, opponent);

    const diff = board.countStones(cpuPlayer) - board.countStones(opponent);
    if (empty > 40) score += diff;
    else if (empty > 15) score += diff * (this.impossible ? 4 : 3);
    else score += diff * (this.impossible ? 20 : 12);
    return score;
  }

  evaluateCorners(board, cpuPlayer, opponent) {
    const corners = [[0,0],[0,7],[7,0],[7,7]];
    const weight = this.impossible ? 1000 : 300;
    let score = 0;
    for (const [r,c] of corners) {
      if (board.getCell(r,c) === cpuPlayer) score += weight;
      else if (board.getCell(r,c) === opponent) score -= weight;
    }
    return score;
  }

  evaluateCornerDanger(board, cpuPlayer, opponent) {
    const areas = [
      [0,0,[[0,1],[1,0],[1,1]]],
      [0,7,[[0,6],[1,7],[1,6]]],
      [7,0,[[7,1],[6,0],[6,1]]],
      [7,7,[[7,6],[6,7],[6,6]]]
    ];
    const weight = this.impossible ? 200 : 80;
    let score = 0;
    for (const [cr, cc, nearby] of areas) {
      if (board.getCell(cr, cc) !== EMPTY) continue;
      for (const [r,c] of nearby) {
        if (board.getCell(r,c) === cpuPlayer) score -= weight;
        else if (board.getCell(r,c) === opponent) score += weight;
      }
    }
    return score;
  }

  evaluateFrontier(board, cpuPlayer, opponent) {
    let cpu = 0;
    let enemy = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = board.getCell(row, col);
        if (cell === EMPTY || !this.isFrontier(board, row, col)) continue;
        if (cell === cpuPlayer) cpu++;
        else if (cell === opponent) enemy++;
      }
    }
    return (enemy - cpu) * (this.impossible ? 10 : 6);
  }

  isFrontier(board, row, col) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (board.isInside(r,c) && board.getCell(r,c) === EMPTY) return true;
      }
    }
    return false;
  }

  evaluateFinal(board, cpuPlayer) {
    const diff = board.countStones(cpuPlayer) - board.countStones(board.opponent(cpuPlayer));
    const winScore = this.impossible ? 10_000_000 : 1_000_000;
    const multiplier = this.impossible ? 10_000 : 1_000;
    if (diff > 0) return winScore + diff * multiplier;
    if (diff < 0) return -winScore + diff * multiplier;
    return 0;
  }
}

class SoundManager {
  constructor() {
    this.enabled = true;
    this.unlocked = false;
    this.paths = {
      place: "sounds/place.wav",
      pass: "sounds/pass.wav",
      result: "sounds/result.wav",
      loser: "sounds/loser.wav"
    };

    // 音源を先に読み込んで、着手時の遅延を減らす。
    this.audio = {};
    for (const [name, path] of Object.entries(this.paths)) {
      const sound = new Audio(path);
      sound.preload = "auto";
      sound.volume = 0.75;
      this.audio[name] = sound;
    }

    // ブラウザは、最初のユーザー操作前の音声再生を止めることがある。
    // 最初のクリック・タップ・キー入力時に再生許可を解除する。
    const unlock = () => this.unlock();
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    document.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  async unlock() {
    if (this.unlocked) return;

    const sound = this.audio.place;
    if (!sound) return;

    const originalVolume = sound.volume;

    try {
      sound.volume = 0;
      sound.currentTime = 0;
      await sound.play();
      sound.pause();
      sound.currentTime = 0;
      this.unlocked = true;
    } catch (error) {
      console.warn("音声の再生許可を解除できませんでした。", error);
    } finally {
      sound.volume = originalVolume;
    }
  }

  play(name) {
    if (!this.enabled) return;

    const source = this.audio[name];
    if (!source) {
      console.warn(`音源が見つかりません: ${name}`);
      return;
    }

    // 同じ音が短時間に続いても再生できるよう、複製して再生する。
    const sound = source.cloneNode();
    sound.volume = 0.75;
    sound.currentTime = 0;

    sound.play().catch(error => {
      console.warn(`音声を再生できませんでした: ${this.paths[name]}`, error);
    });
  }
}

class OthelloApp {
  constructor() {
    this.menuScreen = document.querySelector("#menu-screen");
    this.gameScreen = document.querySelector("#game-screen");
    this.boardElement = document.querySelector("#board");
    this.modeLabel = document.querySelector("#mode-label");
    this.turnLabel = document.querySelector("#turn-label");
    this.stoneCount = document.querySelector("#stone-count");
    this.messageLabel = document.querySelector("#message-label");
    this.passLabel = document.querySelector("#pass-label");
    this.undoButton = document.querySelector("#undo-button");
    this.newGameButton = document.querySelector("#new-game-button");
    this.menuButton = document.querySelector("#menu-button");
    this.validCheckbox = document.querySelector("#valid-moves-checkbox");
    this.soundCheckbox = document.querySelector("#sound-checkbox");
    this.modal = document.querySelector("#modal");
    this.modalTitle = document.querySelector("#modal-title");
    this.modalMessage = document.querySelector("#modal-message");
    this.modalOptions = document.querySelector("#modal-options");
    this.modalInputArea = document.querySelector("#modal-input-area");
    this.sound = new SoundManager();
    this.cells = [];
    this.cpuTimer = null;
    this.roomId = null;
    this.playerToken = this.getOrCreatePlayerToken();
    this.onlineColor = null;
    this.roomRef = null;
    this.roomListener = null;
    this.onlineBusy = false;
    this.onlineRevision = -1;
    this.buildBoard();
    this.bindEvents();
    this.resetState();
  }

  resetState() {
    this.board = new Board();
    this.mode = SINGLE_PLAYER;
    this.humanPlayer = BLACK;
    this.cpuPlayer = WHITE;
    this.cpuLevel = "easy";
    this.cpu = new RandomCpu();
    this.currentPlayer = BLACK;
    this.cpuThinking = false;
    this.gameOver = false;
    this.undoAvailable = false;
    this.savedState = null;
    this.showValidMoves = true;
    this.yellowCursor = { row: 2, col: 3 };
    this.redCursor = { row: -1, col: -1 };
  }

  getOrCreatePlayerToken() {
    const key = "othello-online-player-token";
    let token = sessionStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      sessionStorage.setItem(key, token);
    }
    return token;
  }

  generateRoomId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(6);
    crypto.getRandomValues(values);
    return Array.from(values, value => chars[value % chars.length]).join("");
  }

  roomUrl(roomId) {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    return url.toString();
  }

  buildBoard() {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = document.createElement("button");
        cell.className = "cell";
        cell.type = "button";
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.setAttribute("role", "gridcell");
        cell.addEventListener("mouseenter", () => {
          this.yellowCursor = { row, col };
          this.render();
        });
        cell.addEventListener("focus", () => {
          this.yellowCursor = { row, col };
          this.render();
        });
        cell.addEventListener("click", () => this.handleMouseMove(row, col));
        this.boardElement.append(cell);
        this.cells.push(cell);
      }
    }
  }

  bindEvents() {
    document.querySelector("#single-button").addEventListener("click", () => this.selectSingleColor());
    document.querySelector("#multi-button").addEventListener("click", () => this.startGame(TWO_PLAYERS, BLACK, "easy"));
    document.querySelector("#online-button").addEventListener("click", () => this.selectOnlineMode());
    document.querySelector("#help-button").addEventListener("click", () => this.showAlert(
      "遊び方",
      "シングルプレイ：マウスまたは矢印キー＋Enterで操作します。\n\nマルチプレイ：黒はマウス、白は矢印キー＋Enterで操作します。\n\nEsc：取り消し　N：再戦　Z：スタート画面へ戻る"
    ));
    this.undoButton.addEventListener("click", () => this.undo());
    this.newGameButton.addEventListener("click", () => this.startNewGame());
    this.menuButton.addEventListener("click", () => this.confirmReturnToMenu());
    this.validCheckbox.addEventListener("change", () => {
      this.showValidMoves = this.validCheckbox.checked;
      this.render();
    });
    this.soundCheckbox.addEventListener("change", () => {
      this.sound.enabled = this.soundCheckbox.checked;
    });
    document.addEventListener("keydown", event => this.handleKey(event));
  }

  async selectOnlineMode() {
    const action = await this.showOptions(
      "オンライン対戦",
      "利用する方法を選んでください",
      [
        { label: "ルームを作る", value: "create", primary: true },
        { label: "ルームに入る", value: "join" },
        { label: "戻る", value: null }
      ]
    );

    if (action === "create") return this.createOnlineRoom();
    if (action === "join") {
      const roomId = await this.showTextInput(
        "ルームに入る",
        "6文字のルーム番号を入力してください",
        "例：AB12CD"
      );
      if (roomId) return this.joinOnlineRoom(roomId);
    }
  }

  async createOnlineRoom() {
    try {
      this.messageLabel.textContent = "ルームを作成しています...";
      let roomId;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = this.generateRoomId();
        const snapshot = await get(ref(database, `rooms/${candidate}`));
        if (!snapshot.exists()) { roomId = candidate; break; }
      }
      if (!roomId) throw new Error("ルーム番号を発行できませんでした");

      const room = {
        version: 1,
        status: "waiting",
        board: new Board().cells,
        currentPlayer: BLACK,
        revision: 0,
        lastMove: null,
        winner: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        players: {
          black: { token: this.playerToken, connected: true, joinedAt: serverTimestamp() }
        }
      };
      await set(ref(database, `rooms/${roomId}`), room);
      await this.enterOnlineRoom(roomId, BLACK);
      const invite = this.roomUrl(roomId);
      const copied = await this.copyText(invite);
      await this.showAlert(
        "ルームを作成しました",
        `ルーム番号：${roomId}

相手の参加を待っています。${copied ? "
招待URLをクリップボードへコピーしました。" : "
招待URL：" + invite}`
      );
    } catch (error) {
      console.error(error);
      await this.showAlert("ルーム作成エラー", this.firebaseErrorMessage(error));
    }
  }

  async joinOnlineRoom(roomId) {
    roomId = roomId.trim().toUpperCase();
    const roomReference = ref(database, `rooms/${roomId}`);
    try {
      const result = await runTransaction(roomReference, room => {
        if (!room || room.status === "finished") return;
        room.players = room.players || {};
        if (room.players.white && room.players.white.token !== this.playerToken) return;
        room.players.white = {
          token: this.playerToken,
          connected: true,
          joinedAt: Date.now()
        };
        room.status = "playing";
        room.updatedAt = Date.now();
        return room;
      }, { applyLocally: false });

      if (!result.committed) {
        const snapshot = await get(roomReference);
        if (!snapshot.exists()) throw new Error("指定されたルームが見つかりません");
        throw new Error("このルームにはすでに2人参加しています");
      }
      await this.enterOnlineRoom(roomId, WHITE);
    } catch (error) {
      console.error(error);
      await this.showAlert("入室エラー", this.firebaseErrorMessage(error));
    }
  }

  async enterOnlineRoom(roomId, color) {
    this.leaveOnlineRoom(false);
    this.roomId = roomId;
    this.onlineColor = color;
    this.mode = ONLINE_PLAY;
    this.roomRef = ref(database, `rooms/${roomId}`);
    const side = color === BLACK ? "black" : "white";
    const presenceRef = ref(database, `rooms/${roomId}/players/${side}/connected`);
    await set(presenceRef, true);
    onDisconnect(presenceRef).set(false);

    this.startGame(ONLINE_PLAY, color, "easy");
    this.roomId = roomId;
    this.onlineColor = color;
    this.roomRef = ref(database, `rooms/${roomId}`);
    this.onlineRevision = -1;
    this.undoAvailable = false;
    this.undoButton.disabled = true;
    this.newGameButton.classList.add("hidden");
    this.listenToRoom();
  }

  listenToRoom() {
    if (!this.roomRef) return;
    this.roomListener = onValue(this.roomRef, snapshot => {
      const room = snapshot.val();
      if (!room) {
        this.showAlert("ルーム終了", "ルームが削除されたか、利用できなくなりました。");
        this.returnToMenu();
        return;
      }
      if (!Array.isArray(room.board)) return;
      this.board = new Board(room.board);
      this.currentPlayer = room.currentPlayer || BLACK;
      this.onlineRevision = room.revision || 0;
      this.gameOver = room.status === "finished";
      this.cpuThinking = false;
      const opponentSide = this.onlineColor === BLACK ? "white" : "black";
      const opponent = room.players && room.players[opponentSide];
      const opponentPresent = !!opponent;
      const opponentConnected = !!(opponent && opponent.connected);

      if (room.status === "waiting") {
        this.messageLabel.textContent = "相手の参加を待っています...";
      } else if (!opponentConnected) {
        this.messageLabel.textContent = opponentPresent ? "相手との接続が切れています" : "相手の参加を待っています...";
      } else if (room.status === "finished") {
        const black = this.board.countStones(BLACK);
        const white = this.board.countStones(WHITE);
        this.messageLabel.textContent = black === white ? "引き分けです" : `${black > white ? "黒" : "白"}の勝ちです`;
      } else if (this.currentPlayer === this.onlineColor) {
        this.messageLabel.textContent = "あなたの番です";
      } else {
        this.messageLabel.textContent = "相手の番です";
      }
      if (room.lastMove) this.redCursor = { row: room.lastMove.row, col: room.lastMove.col };
      this.clearPass();
      if (room.passPlayer) this.showPass(room.passPlayer);
      this.updateModeLabel();
      this.render();
    }, error => {
      console.error(error);
      this.messageLabel.textContent = "Firebaseとの通信に失敗しました";
    });
  }

  async copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  }

  firebaseErrorMessage(error) {
    const message = error && error.message ? error.message : String(error);
    if (message.includes("PERMISSION_DENIED")) return "データベースへのアクセスが拒否されました。Firebaseのルールを確認してください。";
    if (message.includes("network")) return "通信できませんでした。インターネット接続を確認してください。";
    return message;
  }

  async selectSingleColor() {
    const color = await this.showOptions("シングルプレイ", "使用する色を選んでください", [
      { label: "先手・黒", value: BLACK, primary: true },
      { label: "後手・白", value: WHITE },
      { label: "キャンセル", value: null }
    ]);
    if (color == null) return;
    const level = await this.showOptions("CPUレベル", "CPUの強さを選んでください", [
      { label: "かんたん", value: "easy" },
      { label: "ふつう", value: "normal" },
      { label: "むずかしい", value: "strong" },
      { label: "不可能", value: "impossible", primary: true },
      { label: "戻る", value: "back" }
    ]);
    if (level === "back") return this.selectSingleColor();
    if (!level) return;
    this.startGame(SINGLE_PLAYER, color, level);
  }

  createCpu(level) {
    if (level === "normal") return new HeuristicCpu();
    if (level === "strong") return new SearchCpu({ normalDepth: 5, completeSearchAt: 10 });
    if (level === "impossible") return new SearchCpu({ normalDepth: 6, completeSearchAt: 12, impossible: true });
    return new RandomCpu();
  }

  startGame(mode, humanPlayer, level) {
    this.stopCpuTimer();
    this.board = new Board();
    this.mode = mode;
    this.humanPlayer = humanPlayer;
    this.cpuPlayer = this.board.opponent(humanPlayer);
    this.cpuLevel = level;
    this.cpu = this.createCpu(level);
    this.currentPlayer = BLACK;
    this.cpuThinking = false;
    this.gameOver = false;
    this.undoAvailable = false;
    this.savedState = null;
    this.yellowCursor = { row: 2, col: 3 };
    this.redCursor = mode === TWO_PLAYERS ? { row: 5, col: 4 } : { row: -1, col: -1 };
    this.passLabel.textContent = "";
    this.passLabel.classList.remove("active");
    this.messageLabel.textContent = "置くマスを選んでください";
    this.undoButton.disabled = true;
    this.newGameButton.classList.add("hidden");
    this.menuButton.classList.remove("hidden");
    this.menuScreen.classList.add("hidden");
    this.gameScreen.classList.remove("hidden");
    this.updateModeLabel();
    this.render();
    if (this.mode === SINGLE_PLAYER && this.currentPlayer === this.cpuPlayer) this.startCpuTurn();
  }

  startNewGame() {
    if (this.mode === ONLINE_PLAY) return;
    this.startGame(this.mode, this.humanPlayer, this.cpuLevel);
  }

  updateModeLabel() {
    if (this.mode === ONLINE_PLAY) {
      const color = this.onlineColor === BLACK ? "黒" : "白";
      this.modeLabel.textContent = `モード：オンライン対戦　ルーム：${this.roomId || "------"}　あなた：${color}`;
      return;
    }
    if (this.mode === TWO_PLAYERS) {
      this.modeLabel.textContent = "モード：マルチプレイ　黒：マウス　白：キーボード";
      return;
    }
    const color = this.humanPlayer === BLACK ? "人間：黒・先手" : "人間：白・後手";
    const names = { easy: "かんたん", normal: "ふつう", strong: "むずかしい", impossible: "不可能" };
    this.modeLabel.textContent = `モード：シングルプレイ　${color}　CPU：${names[this.cpuLevel]}`;
  }

  render() {
    const valid = this.showValidMoves && !this.gameOver ? this.board.getValidMoves(this.currentPlayer) : [];
    const validSet = new Set(valid.map(move => `${move.row},${move.col}`));
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = this.cells[row * 8 + col];
        const state = this.board.getCell(row, col);
        cell.className = "cell";
        if (state === BLACK) cell.classList.add("black");
        if (state === WHITE) cell.classList.add("white");
        if (validSet.has(`${row},${col}`)) cell.classList.add(this.currentPlayer === BLACK ? "valid-black" : "valid-white");
        if (row === this.yellowCursor.row && col === this.yellowCursor.col) cell.classList.add("cursor-yellow");
        if (row === this.redCursor.row && col === this.redCursor.col) cell.classList.add("cursor-red");
        // 二人用では白番でも盤面をグレーアウトしない。
        // マウス着手の可否はhandleMouseMove()側で制御する。
        cell.disabled = this.gameOver || this.onlineBusy || (
          this.mode === SINGLE_PLAYER
          && (this.cpuThinking || this.currentPlayer !== this.humanPlayer)
        ) || (
          this.mode === ONLINE_PLAY
          && this.currentPlayer !== this.onlineColor
        );
        cell.setAttribute("aria-label", `${row + 1}行${col + 1}列`);
      }
    }
    this.turnLabel.textContent = this.gameOver ? "ゲーム終了" : `${this.playerName(this.currentPlayer)}の番です`;
    this.stoneCount.textContent = `黒：${this.board.countStones(BLACK)}個　白：${this.board.countStones(WHITE)}個`;
    this.undoButton.disabled = this.mode === ONLINE_PLAY || this.gameOver || this.cpuThinking || !this.undoAvailable;
  }

  handleMouseMove(row, col) {
    if (this.gameOver || this.cpuThinking) return;
    if (this.mode === SINGLE_PLAYER && this.currentPlayer !== this.humanPlayer) return;
    if (this.mode === TWO_PLAYERS && this.currentPlayer !== BLACK) return;
    if (this.mode === ONLINE_PLAY) {
      if (this.currentPlayer !== this.onlineColor) return;
      return this.placeOnlineStone(row, col);
    }
    this.placeHumanStone(row, col);
  }

  async placeOnlineStone(row, col) {
    if (!this.roomRef || this.onlineBusy || this.gameOver) return;
    if (!this.board.canPlaceStone(row, col, this.onlineColor)) {
      this.messageLabel.textContent = "そこには置けません";
      return;
    }
    this.onlineBusy = true;
    this.render();
    try {
      const token = this.playerToken;
      const color = this.onlineColor;
      const result = await runTransaction(this.roomRef, room => {
        if (!room || room.status !== "playing") return;
        const side = color === BLACK ? "black" : "white";
        if (!room.players || !room.players[side] || room.players[side].token !== token) return;
        if (room.currentPlayer !== color || !Array.isArray(room.board)) return;
        const board = new Board(room.board);
        if (!board.placeStone(row, col, color)) return;

        const opponent = board.opponent(color);
        let nextPlayer = opponent;
        let passPlayer = null;
        let status = "playing";
        if (!board.hasValidMove(opponent)) {
          if (board.hasValidMove(color)) {
            nextPlayer = color;
            passPlayer = opponent;
          } else {
            status = "finished";
            nextPlayer = color;
          }
        }
        room.board = board.cells;
        room.currentPlayer = nextPlayer;
        room.status = status;
        room.passPlayer = passPlayer;
        room.lastMove = { row, col, player: color };
        room.revision = (room.revision || 0) + 1;
        room.updatedAt = Date.now();
        if (status === "finished") {
          const black = board.countStones(BLACK);
          const white = board.countStones(WHITE);
          room.winner = black === white ? 0 : (black > white ? BLACK : WHITE);
        }
        return room;
      }, { applyLocally: false });
      if (!result.committed) this.messageLabel.textContent = "着手できませんでした。盤面を再確認してください";
      else this.sound.play("place");
    } catch (error) {
      console.error(error);
      this.messageLabel.textContent = this.firebaseErrorMessage(error);
    } finally {
      this.onlineBusy = false;
      this.render();
    }
  }

  placeHumanStone(row, col) {
    if (this.gameOver || this.cpuThinking) return;
    if (!this.board.canPlaceStone(row, col, this.currentPlayer)) {
      this.messageLabel.textContent = "そこには置けません";
      return;
    }
    this.savedState = { board: this.board.clone(), player: this.currentPlayer };
    this.board.placeStone(row, col, this.currentPlayer);
    this.undoAvailable = true;
    this.sound.play("place");
    this.clearPass();
    const moved = this.currentPlayer;
    this.render();
    this.finishTurn(moved);
  }

  finishTurn(playerWhoMoved) {
    const opponent = this.board.opponent(playerWhoMoved);
    if (this.board.hasValidMove(opponent)) {
      this.currentPlayer = opponent;
      this.messageLabel.textContent = "置くマスを選んでください";
      this.render();
      if (this.mode === SINGLE_PLAYER && this.currentPlayer === this.cpuPlayer) this.startCpuTurn();
      return;
    }
    if (this.board.hasValidMove(playerWhoMoved)) {
      this.currentPlayer = playerWhoMoved;
      this.showPass(opponent);
      this.sound.play("pass");
      this.messageLabel.textContent = this.mode === SINGLE_PLAYER && this.currentPlayer === this.cpuPlayer ? "CPUが考えています..." : "置くマスを選んでください";
      this.render();
      if (this.mode === SINGLE_PLAYER && this.currentPlayer === this.cpuPlayer) this.startCpuTurn();
      return;
    }
    this.showResult();
  }

  startCpuTurn() {
    if (this.gameOver || this.cpuThinking) return;
    this.cpuThinking = true;
    this.messageLabel.textContent = "CPUが考えています...";
    this.render();
    this.cpuTimer = window.setTimeout(() => {
      const move = this.cpu.chooseMove(this.board, this.cpuPlayer);
      this.cpuTimer = null;
      if (this.gameOver) return;
      if (!move || !this.board.placeStone(move.row, move.col, this.cpuPlayer)) {
        this.cpuThinking = false;
        this.finishTurn(this.cpuPlayer);
        return;
      }
      this.redCursor = { ...move };
      this.sound.play("place");
      this.clearPass();
      this.cpuThinking = false;
      this.render();
      this.finishTurn(this.cpuPlayer);
    }, 420);
  }

  undo() {
    if (this.mode === ONLINE_PLAY) return;
    if (this.gameOver || this.cpuThinking) return;
    if (!this.undoAvailable || !this.savedState) {
      this.messageLabel.textContent = "取り消せる手がありません";
      return;
    }
    this.board = this.savedState.board.clone();
    this.currentPlayer = this.savedState.player;
    this.savedState = null;
    this.undoAvailable = false;
    if (this.mode === SINGLE_PLAYER) this.redCursor = { row: -1, col: -1 };
    this.clearPass();
    this.messageLabel.textContent = "直前の手を取り消しました";
    this.render();
  }

  showResult() {
    this.gameOver = true;
    this.cpuThinking = false;
    const black = this.board.countStones(BLACK);
    const white = this.board.countStones(WHITE);
    let result = "引き分けです";
    if (black > white) result = "黒の勝ちです";
    if (white > black) result = "白の勝ちです";
    this.messageLabel.textContent = result;
    const humanLost = this.mode === SINGLE_PLAYER && this.board.countStones(this.humanPlayer) < this.board.countStones(this.cpuPlayer);
    this.sound.play(humanLost ? "loser" : "result");
    this.newGameButton.classList.remove("hidden");
    this.clearPass();
    this.render();
  }

  showPass(player) {
    this.passLabel.textContent = `${this.playerName(player)}は置ける場所がないためパスです`;
    this.passLabel.classList.add("active");
  }
  clearPass() {
    this.passLabel.textContent = "";
    this.passLabel.classList.remove("active");
  }
  playerName(player) { return player === BLACK ? "黒" : "白"; }

  handleKey(event) {
    if (!this.gameScreen.classList.contains("hidden") && !this.modal.classList.contains("hidden")) return;
    if (this.gameScreen.classList.contains("hidden")) return;
    const key = event.key.toLowerCase();
    if (["arrowup","arrowdown","arrowleft","arrowright","enter","escape"].includes(key)) event.preventDefault();
    if (key === "n" && this.gameOver) return this.startNewGame();
    if (key === "z") return this.confirmReturnToMenu();
    if (key === "escape") return this.undo();
    if (this.gameOver) return;

    const cursor = this.mode === TWO_PLAYERS ? this.redCursor : this.yellowCursor;
    if (key === "arrowup") cursor.row = (cursor.row + 7) % 8;
    else if (key === "arrowdown") cursor.row = (cursor.row + 1) % 8;
    else if (key === "arrowleft") cursor.col = (cursor.col + 7) % 8;
    else if (key === "arrowright") cursor.col = (cursor.col + 1) % 8;
    else if (key === "enter") {
      if (this.cpuThinking) return;
      if (this.mode === SINGLE_PLAYER && this.currentPlayer === this.humanPlayer) this.placeHumanStone(this.yellowCursor.row, this.yellowCursor.col);
      if (this.mode === TWO_PLAYERS && this.currentPlayer === WHITE) this.placeHumanStone(this.redCursor.row, this.redCursor.col);
      if (this.mode === ONLINE_PLAY && this.currentPlayer === this.onlineColor) this.placeOnlineStone(this.yellowCursor.row, this.yellowCursor.col);
      return;
    } else return;
    this.render();
  }

  async confirmReturnToMenu() {
    if (this.gameOver) return this.returnToMenu();
    const answer = await this.showOptions("ゲームを中断", "ゲームを中断してスタート画面に戻りますか？", [
      { label: "YES", value: true, primary: true },
      { label: "NO", value: false }
    ]);
    if (answer) this.returnToMenu();
  }

  returnToMenu() {
    this.stopCpuTimer();
    this.leaveOnlineRoom(true);
    this.gameScreen.classList.add("hidden");
    this.menuScreen.classList.remove("hidden");
  }
  leaveOnlineRoom(markDisconnected = true) {
    if (this.roomListener) this.roomListener();
    if (markDisconnected && this.roomId && this.onlineColor) {
      const side = this.onlineColor === BLACK ? "black" : "white";
      update(ref(database, `rooms/${this.roomId}/players/${side}`), {
        connected: false,
        leftAt: serverTimestamp()
      }).catch(() => {});
    }
    this.roomListener = null;
    this.roomRef = null;
    this.roomId = null;
    this.onlineColor = null;
    this.onlineBusy = false;
  }

  stopCpuTimer() {
    if (this.cpuTimer != null) window.clearTimeout(this.cpuTimer);
    this.cpuTimer = null;
  }

  showAlert(title, message) {
    return this.showOptions(title, message, [{ label: "閉じる", value: true, primary: true }]);
  }

  showOptions(title, message, options) {
    this.modalTitle.textContent = title;
    this.modalMessage.textContent = message;
    this.modalOptions.innerHTML = "";
    this.modalInputArea.innerHTML = "";
    this.modalInputArea.classList.add("hidden");
    this.modal.classList.remove("hidden");
    return new Promise(resolve => {
      for (const option of options) {
        const button = document.createElement("button");
        button.textContent = option.label;
        if (option.primary) button.classList.add("primary");
        button.addEventListener("click", () => {
          this.modal.classList.add("hidden");
          resolve(option.value);
        }, { once: true });
        this.modalOptions.append(button);
      }
    });
  }

  showTextInput(title, message, placeholder = "") {
    this.modalTitle.textContent = title;
    this.modalMessage.textContent = message;
    this.modalOptions.innerHTML = "";
    this.modalInputArea.innerHTML = "";
    this.modalInputArea.classList.remove("hidden");

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 6;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.className = "room-input";

    const submit = document.createElement("button");
    submit.textContent = "入室";
    submit.classList.add("primary");

    const cancel = document.createElement("button");
    cancel.textContent = "キャンセル";

    this.modalInputArea.append(input);
    this.modalOptions.append(submit, cancel);
    this.modal.classList.remove("hidden");

    return new Promise(resolve => {
      const finish = value => {
        this.modal.classList.add("hidden");
        this.modalInputArea.classList.add("hidden");
        resolve(value);
      };

      const submitRoom = () => {
        const value = input.value.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(value)) {
          input.setCustomValidity("英数字6文字で入力してください");
          input.reportValidity();
          return;
        }
        finish(value);
      };

      submit.addEventListener("click", submitRoom, { once: true });
      cancel.addEventListener("click", () => finish(null), { once: true });
      input.addEventListener("input", () => input.setCustomValidity(""));
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") submitRoom();
      });
      window.setTimeout(() => input.focus(), 0);
    });
  }
}

const appInstance = new OthelloApp();
const invitedRoom = new URLSearchParams(window.location.search).get("room");
if (invitedRoom && /^[A-Z0-9]{6}$/i.test(invitedRoom)) {
  window.setTimeout(() => appInstance.joinOnlineRoom(invitedRoom.toUpperCase()), 100);
}
