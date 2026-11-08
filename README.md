# Neon Volley

A 3D ball game I built to practice WebGL. Two paddles, one bouncing ball, first to 3 wins. No frameworks — just raw WebGL 1.0 and glMatrix for the math.

I went for a synthwave / arcade look because I wanted the visuals to feel like something, not just a tech demo.

## Running it

The shaders live in their own files now and get loaded with `fetch()`, so opening `index.html` directly with `file://` won't work. I serve it locally instead:

```
python -m http.server
```

Then open <http://localhost:8000>. Any static server works (`npx serve`, VS Code Live Server, etc.).

## Controls

| Player 1 | Player 2 |
|----------|----------|
| W A S D  | Arrow keys |

First to 3 goals wins. There's a 3-2-1-GO countdown after each goal so nobody gets blindsided.

## Files

```
index.html      canvas + glMatrix CDN + the HUD overlay
style.css       arcade styling (CRT scanlines, neon glow, etc.)
main.js         everything else — WebGL setup, geometry, physics, game loop
shaders/
  lit.vert      shared vertex shader (used by both programs)
  lit.frag      Blinn-Phong for the ball / paddles / walls
  floor.frag    Blinn-Phong + procedural neon grid for the floor
```

## What I figured out along the way

A few things that took me a minute and felt worth writing down:

- **`mat4.lookAt` + `mat4.perspective`** are basically all you need for a fixed camera. I tilt mine down a bit so it looks like a foosball table.
- **Normals don't survive non-uniform scale.** If you scale a paddle by `[1.6, 0.3, 0.25]` and reuse the model matrix on the normals, the lighting goes weird. The fix is the inverse-transpose of the model's 3×3 — I wrote my own little helper for this since I only need it for normals.
- **Blinn-Phong** uses the half-vector `H = normalize(L + V)` instead of a reflection, which is cheaper and looks pretty much the same.
- **`fwidth`** in the fragment shader gives you screen-space pixel width, which is how I get the floor grid lines to anti-alias nicely instead of looking jagged at glancing angles. It needs the `OES_standard_derivatives` extension on WebGL 1.
- **Ball-vs-paddle collision** is a sphere against an axis-aligned box. The trick I learned: clamp the ball's center to the box's bounds to find the closest point, then check the distance. Cheap and exact.
- **The angle the ball comes off the paddle** depends on where it hit. Center = straight, edge = sharp. That single line is what makes it actually feel like a game and not a demo.
- **Web Audio synthesis**: I didn't want to ship audio files for three sound effects, so I just spawn an oscillator with an exponential gain ramp for each beep. ~10 lines.

## Things I'd add if I had more time

- A simple AI opponent for solo play
- Power-ups (bigger paddle, slow-mo, multi-ball?)
- Mobile/touch controls
- Better post-processing — maybe a bloom pass for the neon
- A real shadow instead of the dark disc I'm faking right now
