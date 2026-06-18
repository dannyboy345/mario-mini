/* Minimal dependency-free smoke test.
   Verifies the static files exist, are wired together, and that game.js
   parses as valid JavaScript. Run with: npm test  (or: node test/smoke.js) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log("  ok   - " + name);
  } else {
    console.error("  FAIL - " + name);
    failures++;
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const js = fs.readFileSync(path.join(root, "game.js"), "utf8");

console.log("files present & wired:");
check("index.html links style.css", html.includes("style.css"));
check("index.html loads game.js", html.includes("game.js"));
check("index.html has #game canvas", /id=["']game["']/.test(html));
check("index.html has HUD score/lives", html.includes("score") && html.includes("lives"));
check("index.html has touch controls", html.includes("touch-controls"));
check("style.css is non-empty", css.length > 100);

console.log("game.js parses as valid JS:");
try {
  new vm.Script(js, { filename: "game.js" });
  check("game.js compiles without syntax errors", true);
} catch (e) {
  check("game.js compiles without syntax errors (" + e.message + ")", false);
}

console.log("game.js contains core mechanics:");
check("has gravity/physics", /GRAVITY/.test(js));
check("has coins", /coins/.test(js));
check("has enemies", /enemies/.test(js));
check("has win + game-over states", /winGame/.test(js) && /gameOver/.test(js));

if (failures) {
  console.error("\n" + failures + " check(s) failed.");
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
