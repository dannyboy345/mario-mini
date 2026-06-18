/* =========================================================================
   PIXEL DASH — a tiny original side-scrolling platformer.
   Canvas + vanilla JS, no dependencies, no build step.
   All art is drawn procedurally as pixel blocks (no third-party sprites).
   ========================================================================= */
(() => {
  "use strict";

  // ---- Constants ---------------------------------------------------------
  const TILE = 16;                 // world pixels per tile
  const H_TILES = 12;              // level height in tiles
  const WORLD_H = H_TILES * TILE;  // 192 px
  const GRAVITY = 0.5;
  const MAX_FALL = 9;
  const MOVE_ACCEL = 0.55;
  const MAX_RUN = 2.6;
  const FRICTION = 0.78;
  const AIR_FRICTION = 0.92;
  const JUMP_V = 8.2;
  const JUMP_CUT = 0.45;           // velocity kept when jump released early
  const COYOTE = 6;                // frames of post-ledge jump grace
  const START_TIME = 200;
  const START_LIVES = 3;

  // ---- Canvas / camera ---------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let scale = 4;                   // world px -> screen px
  let viewW = 320;                 // visible world width (px), recomputed on resize
  const camera = { x: 0 };

  function resize() {
    const stage = document.getElementById("stage");
    const cssW = stage.clientWidth;
    const cssH = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // Fit the full world height into the view; horizontal scroll follows player.
    scale = canvas.height / WORLD_H;
    viewW = canvas.width / scale;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", resize);

  // ---- Level -------------------------------------------------------------
  // Built programmatically into a tile grid plus entity lists.
  const LEVEL_W = 150; // tiles
  let grid;            // grid[y][x] -> char
  let coins, enemies, flag, spawn;

  function solidChar(c) { return c === "s" || c === "g" || c === "b" || c === "=" ; }

  function buildLevel() {
    grid = Array.from({ length: H_TILES }, () => new Array(LEVEL_W).fill(" "));
    coins = [];
    enemies = [];

    const groundTop = H_TILES - 2;     // row index of grass
    const pits = [[28, 30], [57, 59], [88, 91], [116, 117]];
    const inPit = (x) => pits.some(([a, b]) => x >= a && x <= b);

    // Ground (two rows: grass over dirt), with gaps.
    for (let x = 0; x < LEVEL_W; x++) {
      if (inPit(x)) continue;
      grid[groundTop][x] = "g";
      grid[groundTop + 1][x] = "s";
    }

    // Helper to drop a solid platform of bricks.
    const platform = (x0, y, len, ch = "=") => {
      for (let i = 0; i < len; i++) if (x0 + i < LEVEL_W) grid[y][x0 + i] = ch;
    };
    const coin = (tx, ty) => coins.push({ x: tx * TILE + 4, y: ty * TILE + 2, taken: false });
    const enemy = (tx) => enemies.push(makeEnemy(tx * TILE, (groundTop - 1) * TILE));

    // --- Hand-placed features for pacing ---
    platform(8, 7, 3, "b");                 coin(9, 6);
    platform(14, 6, 4);                      coin(14, 5); coin(15, 5); coin(16, 5);
    enemy(20);
    platform(24, 7, 2, "b");                 coin(24, 6);
    // coins arcing over first pit
    coin(28, 5); coin(29, 4); coin(30, 5);
    platform(34, 6, 3);                      coin(35, 5);
    enemy(40); enemy(44);
    platform(48, 7, 2, "b"); platform(51, 5, 3, "="); coin(52, 4); coin(53, 4);
    coin(57, 5); coin(58, 4); coin(59, 5);   // over second pit
    platform(63, 6, 4);                      coin(64, 5); coin(66, 5);
    enemy(70);
    platform(74, 7, 2, "b"); platform(77, 5, 2, "="); platform(80, 7, 2, "b");
    coin(77, 4); coin(78, 4);
    enemy(84);
    coin(88, 5); coin(89, 4); coin(90, 4); coin(91, 5); // over third pit
    platform(95, 6, 5);                      coin(96, 5); coin(98, 5); coin(99, 5);
    enemy(102); enemy(106);
    platform(110, 7, 3, "b");                coin(111, 6);
    platform(113, 5, 2, "="); coin(113, 4); coin(114, 4);
    coin(116, 6); coin(117, 6);              // over last pit
    // staircase up to the flag
    for (let i = 0; i < 4; i++) platform(122 + i, groundTop - 1 - i, 1, "b");
    enemy(120);
    platform(126, groundTop - 4, 6, "b");
    coin(127, groundTop - 5); coin(129, groundTop - 5); coin(131, groundTop - 5);

    // Flag near the end on solid ground.
    const flagX = 140;
    flag = { x: flagX * TILE + 6, base: groundTop, raised: 0, reached: false };

    spawn = { x: 2 * TILE, y: (groundTop - 1) * TILE };
  }

  function makeEnemy(x, y) {
    return { x, y, w: 14, h: 14, vx: -0.7, vy: 0, alive: true, squashT: 0 };
  }

  function isSolidAt(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (ty < 0) return false;
    if (tx < 0 || tx >= LEVEL_W) return true;           // walls at level edges
    if (ty >= H_TILES) return false;
    return solidChar(grid[ty][tx]);
  }

  // ---- Player ------------------------------------------------------------
  const player = {
    x: 0, y: 0, w: 12, h: 14,
    vx: 0, vy: 0,
    onGround: false, coyote: 0, facing: 1,
    invuln: 0, anim: 0, dead: false,
  };

  function resetPlayer() {
    player.x = spawn.x; player.y = spawn.y;
    player.vx = 0; player.vy = 0;
    player.onGround = false; player.coyote = 0;
    player.facing = 1; player.invuln = 90; player.anim = 0; player.dead = false;
  }

  // ---- Game state --------------------------------------------------------
  const STATE = { START: 0, PLAY: 1, OVER: 2, WIN: 3 };
  let state = STATE.START;
  let score = 0, coinCount = 0, lives = START_LIVES, timeLeft = START_TIME;

  const keys = { left: false, right: false, jump: false, jumpHeld: false };

  // ---- Audio (tiny WebAudio blips, optional/graceful) --------------------
  let actx = null;
  function beep(freq, dur, type = "square", vol = 0.05) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g); g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.stop(actx.currentTime + dur);
    } catch (e) { /* audio not available — ignore */ }
  }

  // ---- Input -------------------------------------------------------------
  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump", Space: "jump",
  };
  window.addEventListener("keydown", (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      if (k === "jump") { keys.jump = !keys.jumpHeld; keys.jumpHeld = true; }
      else keys[k] = true;
    }
    if ((e.code === "Enter" || e.code === "Space") &&
        (state === STATE.START || state === STATE.OVER || state === STATE.WIN)) {
      startGame();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      if (k === "jump") { keys.jumpHeld = false; }
      else keys[k] = false;
    }
  });

  // Touch controls
  function bindTouch(btn) {
    const key = btn.dataset.key;
    const press = (e) => {
      e.preventDefault();
      if (key === "jump") { keys.jump = !keys.jumpHeld; keys.jumpHeld = true; }
      else keys[key] = true;
    };
    const release = (e) => {
      e.preventDefault();
      if (key === "jump") keys.jumpHeld = false;
      else keys[key] = false;
    };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
  }
  document.querySelectorAll(".tbtn").forEach(bindTouch);

  // Buttons
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("retry-btn").addEventListener("click", startGame);
  document.getElementById("next-btn").addEventListener("click", startGame);

  // ---- HUD ---------------------------------------------------------------
  const el = {
    score: document.getElementById("score"),
    coins: document.getElementById("coins"),
    lives: document.getElementById("lives"),
    time: document.getElementById("time"),
  };
  function updateHUD() {
    el.score.textContent = score;
    el.coins.textContent = coinCount;
    el.lives.textContent = lives;
    el.time.textContent = Math.max(0, Math.ceil(timeLeft));
  }

  function show(id) { document.getElementById(id).classList.remove("hidden"); }
  function hide(id) { document.getElementById(id).classList.add("hidden"); }

  // ---- Game flow ---------------------------------------------------------
  function startGame() {
    buildLevel();
    score = 0; coinCount = 0; lives = START_LIVES; timeLeft = START_TIME;
    resetPlayer();
    camera.x = 0;
    state = STATE.PLAY;
    hide("overlay"); hide("gameover"); hide("win");
    updateHUD();
    try { if (actx && actx.state === "suspended") actx.resume(); } catch (e) {}
  }

  function loseLife() {
    lives--;
    beep(110, 0.4, "sawtooth", 0.06);
    updateHUD();
    if (lives <= 0) {
      gameOver();
    } else {
      resetPlayer();
    }
  }

  function gameOver() {
    state = STATE.OVER;
    document.getElementById("go-score").textContent = score;
    show("gameover");
  }

  function winGame() {
    state = STATE.WIN;
    const bonus = Math.max(0, Math.ceil(timeLeft)) * 10;
    score += bonus;
    document.getElementById("win-score").textContent = score;
    document.getElementById("win-bonus").textContent = "Time bonus: +" + bonus;
    updateHUD();
    beep(523, 0.12); setTimeout(() => beep(659, 0.12), 120);
    setTimeout(() => beep(784, 0.2), 240);
    show("win");
  }

  // ---- Update ------------------------------------------------------------
  function update(dt) {
    if (state !== STATE.PLAY) return;

    // Timer
    timeLeft -= dt * 1.3;
    if (timeLeft <= 0) { timeLeft = 0; lives = 0; updateHUD(); gameOver(); return; }

    updatePlayer();
    updateEnemies();
    updateCoins();
    updateFlag();
    updateCamera();
    updateHUD();
  }

  function updatePlayer() {
    const p = player;
    p.anim += Math.abs(p.vx) * 0.25 + 0.05;

    // Horizontal input
    if (keys.left && !keys.right) { p.vx -= MOVE_ACCEL; p.facing = -1; }
    else if (keys.right && !keys.left) { p.vx += MOVE_ACCEL; p.facing = 1; }
    else { p.vx *= (p.onGround ? FRICTION : AIR_FRICTION); }
    p.vx = Math.max(-MAX_RUN, Math.min(MAX_RUN, p.vx));
    if (Math.abs(p.vx) < 0.05) p.vx = 0;

    // Jump (with coyote time + variable height)
    if (p.coyote > 0) p.coyote--;
    if (keys.jump && (p.onGround || p.coyote > 0)) {
      p.vy = -JUMP_V; p.onGround = false; p.coyote = 0;
      beep(440, 0.08, "square", 0.04);
    }
    keys.jump = false;
    if (!keys.jumpHeld && p.vy < 0) p.vy *= JUMP_CUT; // cut jump when released

    // Gravity
    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY);

    // Move + collide on X
    p.x += p.vx;
    collideAxis(p, "x");
    // Move + collide on Y
    const wasGround = p.onGround;
    p.onGround = false;
    p.y += p.vy;
    collideAxis(p, "y");
    if (wasGround && !p.onGround && p.vy >= 0) p.coyote = COYOTE;

    if (p.invuln > 0) p.invuln--;

    // Fell into a pit
    if (p.y > WORLD_H + 40) loseLife();
  }

  // Axis-separated AABB vs tile collision.
  function collideAxis(o, axis) {
    const left = Math.floor(o.x / TILE);
    const right = Math.floor((o.x + o.w - 1) / TILE);
    const top = Math.floor(o.y / TILE);
    const bottom = Math.floor((o.y + o.h - 1) / TILE);

    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (!isSolidAt(tx * TILE, ty * TILE)) continue;
        const tileL = tx * TILE, tileT = ty * TILE;
        if (axis === "x") {
          if (o.vx > 0) { o.x = tileL - o.w; o.vx = 0; }
          else if (o.vx < 0) { o.x = tileL + TILE; o.vx = 0; }
        } else {
          if (o.vy > 0) { o.y = tileT - o.h; o.vy = 0; o.onGround = true; }
          else if (o.vy < 0) { o.y = tileT + TILE; o.vy = 0; }
        }
      }
    }
  }

  function updateEnemies() {
    const p = player;
    for (const e of enemies) {
      if (!e.alive) { e.squashT -= 1; continue; }

      e.vy = Math.min(MAX_FALL, e.vy + GRAVITY);

      // Horizontal move; reverse if we hit a wall.
      const dir = Math.sign(e.vx) || -1;
      e.x += e.vx;
      const vxBefore = e.vx;
      collideAxis(e, "x");
      if (e.vx === 0) e.vx = -dir * Math.abs(vxBefore || 0.7); // hit a wall -> turn

      // Vertical move.
      e.onGround = false;
      e.y += e.vy;
      collideAxis(e, "y");

      // Ledge detection: if standing and no ground ahead, turn around.
      if (e.onGround) {
        const aheadX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        const footY = e.y + e.h + 1;
        if (!isSolidAt(aheadX, footY)) e.vx = -e.vx;
      }

      // Collide with player
      if (overlap(p, e) && p.invuln <= 0 && !p.dead) {
        const stomp = p.vy > 0 && (p.y + p.h) - e.y < 10;
        if (stomp) {
          e.alive = false; e.squashT = 12;
          p.vy = -JUMP_V * 0.7;       // bounce
          score += 200; updateHUD();
          beep(660, 0.08, "square", 0.05);
        } else {
          loseLife();
        }
      }
    }
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function updateCoins() {
    const p = player;
    for (const c of coins) {
      if (c.taken) continue;
      if (p.x < c.x + 10 && p.x + p.w > c.x && p.y < c.y + 12 && p.y + p.h > c.y) {
        c.taken = true; coinCount++; score += 100;
        updateHUD();
        beep(880, 0.07, "square", 0.04);
      }
    }
  }

  function updateFlag() {
    const p = player;
    if (!flag.reached && p.x + p.w > flag.x) {
      flag.reached = true;
      winGame();
    }
  }

  function updateCamera() {
    const target = player.x + player.w / 2 - viewW / 2;
    camera.x += (target - camera.x) * 0.12;
    camera.x = Math.max(0, Math.min(LEVEL_W * TILE - viewW, camera.x));
    if (!isFinite(camera.x) || camera.x < 0) camera.x = 0;
  }

  // ---- Rendering ---------------------------------------------------------
  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h));
  }

  function render() {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#5c94fc");
    g.addColorStop(1, "#9fd0ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-camera.x, 0);

    drawBackground();
    drawTiles();
    drawCoins();
    drawFlag();
    drawEnemies();
    drawPlayer();

    ctx.restore();
  }

  function drawBackground() {
    // Parallax hills
    const baseY = WORLD_H - TILE * 2;
    for (let i = 0; i < 14; i++) {
      const hx = i * 120 - (camera.x * 0.4) % 120 + camera.x;
      px(hx, baseY - 26, 70, 40, "#6fcf5b");
      px(hx + 14, baseY - 40, 40, 24, "#7fdc6a");
    }
    // Clouds (slower parallax)
    for (let i = 0; i < 12; i++) {
      const cx = i * 160 - (camera.x * 0.25) % 160 + camera.x;
      const cy = 20 + (i % 3) * 22;
      px(cx, cy, 26, 9, "#ffffff");
      px(cx + 7, cy - 6, 16, 9, "#ffffff");
      px(cx + 18, cy, 16, 8, "#ffffff");
    }
  }

  function drawTiles() {
    const x0 = Math.max(0, Math.floor(camera.x / TILE) - 1);
    const x1 = Math.min(LEVEL_W, Math.ceil((camera.x + viewW) / TILE) + 1);
    for (let ty = 0; ty < H_TILES; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const c = grid[ty][tx];
        if (c === " ") continue;
        const X = tx * TILE, Y = ty * TILE;
        if (c === "g") {
          px(X, Y, TILE, TILE, "#3a8c2a");
          px(X, Y, TILE, 4, "#5fd048");
          px(X + 2, Y + 6, 2, 2, "#2f6b22");
          px(X + 9, Y + 9, 2, 2, "#2f6b22");
        } else if (c === "s") {
          px(X, Y, TILE, TILE, "#7a4a25");
          px(X + 2, Y + 2, 3, 3, "#8c5a30");
          px(X + 9, Y + 8, 3, 3, "#673a1d");
        } else if (c === "b") {
          px(X, Y, TILE, TILE, "#b5651d");
          px(X, Y, TILE, TILE, "#c1772f");
          ctx.fillStyle = "#7a4413";
          ctx.fillRect(X, Y + 7, TILE, 2);
          ctx.fillRect(X + 7, Y, 2, 7);
          ctx.fillRect(X + 3, Y + 9, 2, 7);
          ctx.fillRect(X + 12, Y + 9, 2, 7);
        } else if (c === "=") {
          px(X, Y, TILE, TILE, "#caa15a");
          px(X, Y, TILE, 4, "#e3c27e");
          px(X, Y + TILE - 3, TILE, 3, "#9c7a3e");
        }
      }
    }
  }

  function drawCoins() {
    const t = player.anim;
    for (const c of coins) {
      if (c.taken) continue;
      const wob = Math.sin(t * 0.5 + c.x) * 1.2;
      const w = 6 + Math.abs(Math.sin(t * 0.4 + c.x)) * 2; // spin
      const cx = c.x + (8 - w) / 2;
      px(cx, c.y + wob, w, 9, "#ffce4a");
      px(cx + 1, c.y + 2 + wob, Math.max(1, w - 4), 5, "#fff1a8");
      px(cx, c.y + wob, w, 1, "#c79a1e");
    }
  }

  function drawFlag() {
    const baseY = flag.base * TILE;
    const poleX = flag.x;
    // pole
    px(poleX, baseY - TILE * 6, 2, TILE * 6 + TILE, "#dddddd");
    px(poleX - 1, baseY - TILE * 6 - 3, 4, 4, "#c0c0c0");
    // banner
    const fy = baseY - TILE * 6 + 2;
    px(poleX - 14, fy, 14, 10, "#ff5a4d");
    px(poleX - 14, fy, 3, 10, "#d63a30");
    // base block
    px(poleX - 4, baseY, 10, TILE, "#2b8c8c");
  }

  function drawEnemies() {
    for (const e of enemies) {
      if (!e.alive) {
        if (e.squashT > 0) px(e.x, e.y + e.h - 4, e.w, 4, "#7a3b8c"); // squashed
        continue;
      }
      const step = Math.floor(player.anim) % 2 === 0 ? 0 : 2;
      // body (a grumpy purple critter — original design)
      px(e.x, e.y + 2, e.w, e.h - 2, "#8e44ad");
      px(e.x, e.y + 2, e.w, 3, "#a55bc4");
      // feet
      px(e.x + 1, e.y + e.h - 2, 4, 2, "#5b2c6f");
      px(e.x + e.w - 5 - step, e.y + e.h - 2, 4, 2, "#5b2c6f");
      // eyes
      const dir = e.vx < 0 ? 0 : 2;
      px(e.x + 2 + dir, e.y + 5, 3, 3, "#fff");
      px(e.x + e.w - 6 + dir, e.y + 5, 3, 3, "#fff");
      px(e.x + 3 + dir, e.y + 6, 1, 2, "#000");
      px(e.x + e.w - 5 + dir, e.y + 6, 1, 2, "#000");
      // angry brow
      px(e.x + 1, e.y + 3, e.w - 2, 1, "#5b2c6f");
    }
  }

  function drawPlayer() {
    const p = player;
    if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return; // blink
    const X = p.x, Y = p.y, f = p.facing;
    const run = p.onGround && Math.abs(p.vx) > 0.4;
    const legPhase = Math.floor(p.anim) % 2;

    // Original character: teal explorer with an orange cap. Not a known mascot.
    // Cap
    px(X + 1, Y, 10, 3, "#ff8c1a");
    px(X + (f > 0 ? 8 : 1), Y + 1, 3, 2, "#ffae5c"); // brim toward facing
    // Head
    px(X + 2, Y + 3, 8, 5, "#ffd9b3");
    // Eye
    px(X + (f > 0 ? 7 : 3), Y + 4, 2, 2, "#1a1c2c");
    // Body / shirt
    px(X + 1, Y + 8, 10, 4, "#1fa39c");
    px(X + 1, Y + 8, 10, 1, "#2fc4bc");
    // Arms
    px(X + (f > 0 ? 10 : -1), Y + 8, 2, 3, "#ffd9b3");
    // Legs (animate)
    if (!p.onGround) {
      px(X + 2, Y + 12, 3, 2, "#34506b");
      px(X + 7, Y + 12, 3, 2, "#34506b");
    } else if (run && legPhase === 0) {
      px(X + 1, Y + 12, 3, 2, "#34506b");
      px(X + 8, Y + 12, 3, 2, "#34506b");
    } else if (run) {
      px(X + 3, Y + 12, 3, 2, "#34506b");
      px(X + 6, Y + 12, 3, 2, "#34506b");
    } else {
      px(X + 2, Y + 12, 3, 2, "#34506b");
      px(X + 7, Y + 12, 3, 2, "#34506b");
    }
  }

  // ---- Main loop ---------------------------------------------------------
  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;              // clamp big gaps (tab switch)
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---- Boot --------------------------------------------------------------
  buildLevel();
  resetPlayer();
  resize();
  // Draw an initial frame behind the start overlay.
  render();
  requestAnimationFrame(frame);
})();
