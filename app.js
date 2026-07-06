"use strict";

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const SINGLE_PLAYER = "single";
const TWO_PLAYERS = "multi";

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
    this.paths = {
      place: "sounds/place.wav",
      pass: "sounds/pass.wav",
      result: "sounds/result.wav",
      loser: "sounds/loser.wav"
    };
  }
  play(name) {
    if (!this.enabled) return;
    const audio = new Audio(this.paths[name]);
    audio.volume = 0.75;
    audio.play().catch(() => {});
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
    this.sound = new SoundManager();
    this.cells = [];
    this.cpuTimer = null;
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

  startNewGame() { this.startGame(this.mode, this.humanPlayer, this.cpuLevel); }

  updateModeLabel() {
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
        cell.disabled = this.gameOver || (
          this.mode === SINGLE_PLAYER
          && (this.cpuThinking || this.currentPlayer !== this.humanPlayer)
        );
        cell.setAttribute("aria-label", `${row + 1}行${col + 1}列`);
      }
    }
    this.turnLabel.textContent = this.gameOver ? "ゲーム終了" : `${this.playerName(this.currentPlayer)}の番です`;
    this.stoneCount.textContent = `黒：${this.board.countStones(BLACK)}個　白：${this.board.countStones(WHITE)}個`;
    this.undoButton.disabled = this.gameOver || this.cpuThinking || !this.undoAvailable;
  }

  handleMouseMove(row, col) {
    if (this.gameOver || this.cpuThinking) return;
    if (this.mode === SINGLE_PLAYER && this.currentPlayer !== this.humanPlayer) return;
    if (this.mode === TWO_PLAYERS && this.currentPlayer !== BLACK) return;
    this.placeHumanStone(row, col);
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
    this.gameScreen.classList.add("hidden");
    this.menuScreen.classList.remove("hidden");
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
}

new OthelloApp();
