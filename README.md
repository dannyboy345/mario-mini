# Pixel Dash

A polished, original one-page browser **platformer** inspired by classic
side-scrollers. Run, jump, collect coins, stomp foes, and reach the flag before
the timer runs out.

> All artwork is drawn procedurally with the Canvas API (pixel blocks) and CSS.
> No Nintendo/Mario — or any other third-party — sprites or assets are used.

## Features

- 🎮 **Keyboard + touch controls** — playable on desktop and mobile.
- 🟫 **Pixel-art look** using only CSS + `<canvas>` (no images, no sprite sheets).
- 🏃 Run / variable-height jump with coyote-time, momentum, and friction.
- 🪙 Collectible coins, 👾 patrolling enemies you can stomp, and a 🏁 goal flag.
- 📊 Live **score, coins, lives, and countdown timer** HUD.
- 🧭 **Start / Game Over / Win** states with a time bonus on victory.
- 📱 Responsive, mobile-friendly layout (on-screen D-pad + jump on touch devices).
- 🔊 Tiny optional WebAudio blips (gracefully skipped if unavailable).
- ⚡ **No build step.** Just static `index.html`, `style.css`, and `game.js`.

## Controls

| Action | Keyboard | Touch |
| ------ | -------- | ----- |
| Move   | `←` `→` / `A` `D` | ◀ ▶ buttons |
| Jump   | `↑` / `W` / `Space` | JUMP button |
| Start / Restart | `Enter` / `Space` | tap the button |

Bounce on an enemy's head to defeat it; touching one from the side costs a life.
Fall in a pit or run out of time and you lose a life too. Lose all lives → Game Over.

## Run locally

It's a static site — any static file server works.

```bash
# Python (no install needed on most systems)
python3 -m http.server 3000
# then open http://localhost:3000
```

or

```bash
npx serve -l 3000 .
```

## Run with Docker

```bash
docker build -t pixel-dash .
docker run --rm -p 3000:3000 pixel-dash
# open http://localhost:3000
```

The container serves the static files on **port 3000** using Python's built-in
`http.server` (no extra dependencies).

## Project structure

```
index.html   # markup, HUD, overlays, touch controls
style.css    # pixel-art styling + responsive layout
game.js      # game engine: physics, level, entities, rendering, states
Dockerfile   # python http.server on port 3000
package.json # start/build/test scripts
test/        # dependency-free smoke test
```

## Scripts

```bash
npm start    # serve on http://localhost:3000 (python http.server)
npm test     # dependency-free smoke test (files wired + game.js parses)
npm run build  # no-op: static site, nothing to build
```

## License

Original code and art, free to use and modify. No third-party game assets included.
