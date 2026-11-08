const ARENA_HALF_W   = 10.0;
const ARENA_HALF_L   = 15.0;
const WALL_HEIGHT    = 1.2;
const BALL_RADIUS    = 0.45;

const PADDLE_W       = 3.2;
const PADDLE_H       = 0.6;
const PADDLE_D       = 0.5;
const PADDLE_Z_P1    =  13.0;
const PADDLE_Z_P2    = -13.0;

const PADDLE_SPEED    = 18.0;
const BALL_BASE_SPEED = 11.0;
const BALL_MAX_SPEED  = 22.0;
const BALL_SPEEDUP    = 1.06;

const MAX_SCORE = 3;

const CAMERA_POS    = [0.0, 12.5, 22.0];
const CAMERA_TARGET = [0.0,  0.0,  0.0];
const CAMERA_UP     = [0.0,  1.0,  0.0];
const FOV_Y         = Math.PI / 4;
const Z_NEAR        = 0.1;
const Z_FAR         = 200.0;

const LIGHT_DIR     = new Float32Array([-0.4, -1.0, -0.3]);
const LIGHT_COLOR   = [1.0, 0.95, 1.0];
const AMBIENT_COLOR = [0.22, 0.18, 0.35];

const COLOR_P1      = [0.00, 0.94, 1.00];
const COLOR_P2      = [1.00, 0.17, 0.84];
const COLOR_BALL    = [1.00, 0.89, 0.30];
const COLOR_WALL    = [0.24, 0.18, 0.55];
const COLOR_GOAL_P1 = [0.00, 0.94, 1.00];
const COLOR_GOAL_P2 = [1.00, 0.17, 0.84];


function showError(msg) {
    let box = document.getElementById('__err');
    if (!box) {
        box = document.createElement('pre');
        box.id = '__err';
        box.style.cssText = 'position:fixed;left:12px;bottom:12px;max-width:90vw;'
            + 'padding:10px 14px;background:#300;color:#fbb;border:1px solid #f55;'
            + 'font:12px/1.4 monospace;white-space:pre-wrap;z-index:9999';
        document.body.appendChild(box);
    }
    box.textContent += msg + '\n';
    console.error(msg);
}
window.addEventListener('error', e => showError('JS: ' + e.message));

const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
if (!gl) {
    showError('WebGL not supported in this browser.');
    throw new Error('no webgl');
}

// gl-matrix 2.8.1 UMD attaches mat4/vec3 to window; newer builds nest under window.glMatrix.
const GLM = (window.glMatrix && window.glMatrix.mat4) ? window.glMatrix : window;
const mat4 = GLM.mat4;
const vec3 = GLM.vec3;
if (!mat4 || !vec3) {
    showError('glMatrix failed to load (CDN blocked?).');
    throw new Error('no glMatrix');
}

gl.enable(gl.DEPTH_TEST);
// Sphere/plane/disc generators wind in one direction only; double-sided is cheap here.
gl.disable(gl.CULL_FACE);
gl.clearColor(0.02, 0.01, 0.05, 1.0);

gl.getExtension('OES_standard_derivatives');


async function loadText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.text();
}

function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        showError('Shader compile: ' + gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
    }
    return s;
}

function link(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        showError('Program link: ' + gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function locs(program, attrs, unis) {
    const out = { program, a: {}, u: {} };
    attrs.forEach(n => out.a[n] = gl.getAttribLocation(program, n));
    unis .forEach(n => out.u[n] = gl.getUniformLocation(program, n));
    return out;
}


function createBox() {
    const f = [
        { n: [ 1, 0, 0], q: [[1,-1,-1],[1, 1,-1],[1, 1, 1],[1,-1, 1]] },
        { n: [-1, 0, 0], q: [[-1,-1, 1],[-1, 1, 1],[-1, 1,-1],[-1,-1,-1]] },
        { n: [ 0, 1, 0], q: [[-1, 1,-1],[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1]] },
        { n: [ 0,-1, 0], q: [[-1,-1, 1],[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1]] },
        { n: [ 0, 0, 1], q: [[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1],[-1,-1, 1]] },
        { n: [ 0, 0,-1], q: [[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1],[ 1,-1,-1]] },
    ];
    const pos = [], nrm = [], idx = [];
    f.forEach((face, fi) => {
        const base = fi * 4;
        face.q.forEach(v => { pos.push(...v); nrm.push(...face.n); });
        idx.push(base, base + 1, base + 2,  base, base + 2, base + 3);
    });
    return meshFrom(pos, nrm, idx);
}

function createSphere(latBands = 24, lonBands = 32) {
    const pos = [], nrm = [], idx = [];
    for (let lat = 0; lat <= latBands; lat++) {
        const theta = lat * Math.PI / latBands;
        const sT = Math.sin(theta), cT = Math.cos(theta);
        for (let lon = 0; lon <= lonBands; lon++) {
            const phi = lon * 2 * Math.PI / lonBands;
            const sP = Math.sin(phi), cP = Math.cos(phi);
            const x = cP * sT, y = cT, z = sP * sT;
            pos.push(x, y, z);
            nrm.push(x, y, z);
        }
    }
    for (let lat = 0; lat < latBands; lat++) {
        for (let lon = 0; lon < lonBands; lon++) {
            const a =  lat      * (lonBands + 1) + lon;
            const b = (lat + 1) * (lonBands + 1) + lon;
            idx.push(a, b, a + 1,  b, b + 1, a + 1);
        }
    }
    return meshFrom(pos, nrm, idx);
}

function createPlane() {
    const pos = [-1, 0, -1,  1, 0, -1,  1, 0,  1,  -1, 0,  1];
    const nrm = [ 0, 1,  0,  0, 1,  0,  0, 1,  0,   0, 1,  0];
    const idx = [0, 1, 2, 0, 2, 3];
    return meshFrom(pos, nrm, idx);
}

function createDisc(segments = 40) {
    const pos = [0, 0, 0];
    const nrm = [0, 1, 0];
    const idx = [];
    for (let i = 0; i <= segments; i++) {
        const a = i / segments * Math.PI * 2;
        pos.push(Math.cos(a), 0, Math.sin(a));
        nrm.push(0, 1, 0);
    }
    for (let i = 1; i <= segments; i++) {
        idx.push(0, i, i + 1);
    }
    return meshFrom(pos, nrm, idx);
}

function meshFrom(pos, nrm, idx) {
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);

    const nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.STATIC_DRAW);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

    return { posBuf, nrmBuf, idxBuf, count: idx.length };
}


const ball = {
    pos: [0, BALL_RADIUS + 0.2, 0],
    vel: [0, 0, 0],
    speed: BALL_BASE_SPEED,
    live: false,
};

const p1 = { pos: [0, PADDLE_H, PADDLE_Z_P1], color: COLOR_P1 };
const p2 = { pos: [0, PADDLE_H, PADDLE_Z_P2], color: COLOR_P2 };

const state = {
    score: [0, 0],
    winner: 0,
    shakeT: 0,
    shakeAmp: 0,
    flashUntil: 0,
    lastLauncher: 2,
};


const keys = Object.create(null);
addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }
});
addEventListener('keyup', e => { keys[e.code] = false; });


let audioCtx = null;
function ensureAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) { audioCtx = null; }
}
addEventListener('keydown', ensureAudio, { once: true });
addEventListener('click',   ensureAudio, { once: true });

function beep(freq, durSec, type = 'square', gain = 0.06) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g   = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec);
}


function resetBall(towardPlayer) {
    ball.pos[0] = 0;
    ball.pos[1] = BALL_RADIUS + 0.2;
    ball.pos[2] = 0;
    ball.speed  = BALL_BASE_SPEED;

    const angle = (Math.random() - 0.5) * (Math.PI / 3);
    const dx = Math.sin(angle);
    const dz = Math.cos(angle) * (towardPlayer === 1 ? 1 : -1);
    ball.vel[0] = dx * ball.speed;
    ball.vel[1] = 0;
    ball.vel[2] = dz * ball.speed;

    ball.live = false;
}

function updatePaddles(dt) {
    let p1x = p1.pos[0], p1z = p1.pos[2];
    if (keys['KeyA']) p1x -= PADDLE_SPEED * dt;
    if (keys['KeyD']) p1x += PADDLE_SPEED * dt;
    if (keys['KeyW']) p1z -= PADDLE_SPEED * dt;
    if (keys['KeyS']) p1z += PADDLE_SPEED * dt;
    p1.pos[0] = clamp(p1x, -ARENA_HALF_W + PADDLE_W / 2,  ARENA_HALF_W - PADDLE_W / 2);
    p1.pos[2] = clamp(p1z,  1.5,                          ARENA_HALF_L - PADDLE_D / 2 - 0.1);

    let p2x = p2.pos[0], p2z = p2.pos[2];
    if (keys['ArrowLeft'])  p2x -= PADDLE_SPEED * dt;
    if (keys['ArrowRight']) p2x += PADDLE_SPEED * dt;
    if (keys['ArrowUp'])    p2z -= PADDLE_SPEED * dt;
    if (keys['ArrowDown'])  p2z += PADDLE_SPEED * dt;
    p2.pos[0] = clamp(p2x, -ARENA_HALF_W + PADDLE_W / 2,  ARENA_HALF_W - PADDLE_W / 2);
    p2.pos[2] = clamp(p2z, -ARENA_HALF_L + PADDLE_D / 2 + 0.1, -1.5);
}

function updateBall(dt) {
    if (!ball.live) return;

    ball.pos[0] += ball.vel[0] * dt;
    ball.pos[2] += ball.vel[2] * dt;

    const xLimit = ARENA_HALF_W - BALL_RADIUS;
    if (ball.pos[0] >  xLimit) { ball.pos[0] =  xLimit; ball.vel[0] = -Math.abs(ball.vel[0]); onWallHit(); }
    if (ball.pos[0] < -xLimit) { ball.pos[0] = -xLimit; ball.vel[0] =  Math.abs(ball.vel[0]); onWallHit(); }

    paddleCollide(p1, +1);
    paddleCollide(p2, -1);

    if (ball.pos[2] >  ARENA_HALF_L + BALL_RADIUS * 2) {
        onGoal(2);
    } else if (ball.pos[2] < -ARENA_HALF_L - BALL_RADIUS * 2) {
        onGoal(1);
    }
}

function paddleCollide(p, facing) {
    const px = p.pos[0], pz = p.pos[2];
    const hx = PADDLE_W / 2, hz = PADDLE_D / 2;

    const dx = Math.max(-hx, Math.min(ball.pos[0] - px, hx));
    const dz = Math.max(-hz, Math.min(ball.pos[2] - pz, hz));
    const cx = px + dx, cz = pz + dz;
    const offX = ball.pos[0] - cx;
    const offZ = ball.pos[2] - cz;
    const dist2 = offX * offX + offZ * offZ;

    if (dist2 > BALL_RADIUS * BALL_RADIUS) return;
    if (facing === +1 && ball.vel[2] <= 0) return;
    if (facing === -1 && ball.vel[2] >= 0) return;

    const hitFactor = clamp((ball.pos[0] - px) / (PADDLE_W / 2), -1, 1);

    ball.speed = Math.min(ball.speed * BALL_SPEEDUP, BALL_MAX_SPEED);
    const maxAngle = Math.PI / 3.2;
    const angle = hitFactor * maxAngle;
    ball.vel[0] = Math.sin(angle) * ball.speed;
    ball.vel[2] = Math.cos(angle) * ball.speed * -facing;

    ball.pos[2] = pz + (facing === +1 ? -1 : 1) * (hz + BALL_RADIUS + 0.01);

    onPaddleHit();
    updateSpeedReadout();
}

function onWallHit()   { beep(260, 0.06, 'square', 0.04); }
function onPaddleHit() { beep(440 + Math.random() * 80, 0.07, 'square', 0.06); }

function onGoal(scorer) {
    state.score[scorer - 1]++;
    state.shakeT   = 0.35;
    state.shakeAmp = 0.35;
    state.flashUntil = performance.now() + 220;
    flashEl.classList.add('active');
    setTimeout(() => flashEl.classList.remove('active'), 200);

    beep(180, 0.25, 'sawtooth', 0.09);
    setTimeout(() => beep(110, 0.35, 'sawtooth', 0.08), 120);

    updateScoreboard();
    lastEventEl.textContent = `GOAL // PLAYER 0${scorer}`;

    if (state.score[scorer - 1] >= MAX_SCORE) {
        state.winner = scorer;
        showWin();
    } else {
        const loser = scorer === 1 ? 2 : 1;
        resetBall(loser);
        startCountdown();
    }
}


const projMat = mat4.create();
const viewMat = mat4.create();

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor((rect.width  || 900) * dpr));
    const h = Math.max(1, Math.floor((rect.height || 600) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    mat4.perspective(projMat, FOV_Y, canvas.width / canvas.height, Z_NEAR, Z_FAR);
}
addEventListener('resize', resize);

function buildView() {
    let jx = 0, jy = 0;
    if (state.shakeT > 0) {
        jx = (Math.random() - 0.5) * state.shakeAmp;
        jy = (Math.random() - 0.5) * state.shakeAmp;
    }
    mat4.lookAt(
        viewMat,
        [CAMERA_POS[0] + jx, CAMERA_POS[1] + jy, CAMERA_POS[2]],
        CAMERA_TARGET,
        CAMERA_UP
    );
}

function bindMeshAttribs(mesh, loc) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.posBuf);
    gl.enableVertexAttribArray(loc.a.aPosition);
    gl.vertexAttribPointer(loc.a.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrmBuf);
    gl.enableVertexAttribArray(loc.a.aNormal);
    gl.vertexAttribPointer(loc.a.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idxBuf);
}

const tmpMat3 = new Float32Array(9);
function setModelUniforms(loc, model) {
    gl.uniformMatrix4fv(loc.u.uModel, false, model);
    mat3FromMat4(tmpMat3, model);
    mat3InvertTranspose(tmpMat3);
    gl.uniformMatrix3fv(loc.u.uNormalMat, false, tmpMat3);
}

let litLoc, floorLoc, litProgram, floorProgram;
let meshBox, meshSphere, meshPlane, meshDisc;

function drawLit(mesh, model, baseColor, shininess = 40.0, emissive = 0.0) {
    gl.useProgram(litProgram);
    bindMeshAttribs(mesh, litLoc);

    gl.uniformMatrix4fv(litLoc.u.uView, false, viewMat);
    gl.uniformMatrix4fv(litLoc.u.uProj, false, projMat);
    gl.uniform3fv(litLoc.u.uLightDir,   LIGHT_DIR);
    gl.uniform3fv(litLoc.u.uLightColor, LIGHT_COLOR);
    gl.uniform3fv(litLoc.u.uAmbient,    AMBIENT_COLOR);
    gl.uniform3fv(litLoc.u.uCameraPos,  CAMERA_POS);
    gl.uniform3fv(litLoc.u.uBaseColor,  baseColor);
    gl.uniform1f (litLoc.u.uShininess,  shininess);
    gl.uniform1f (litLoc.u.uEmissive,   emissive);

    setModelUniforms(litLoc, model);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

function drawFloor() {
    gl.useProgram(floorProgram);
    bindMeshAttribs(meshPlane, floorLoc);

    gl.uniformMatrix4fv(floorLoc.u.uView, false, viewMat);
    gl.uniformMatrix4fv(floorLoc.u.uProj, false, projMat);
    gl.uniform3fv(floorLoc.u.uLightDir,   LIGHT_DIR);
    gl.uniform3fv(floorLoc.u.uLightColor, LIGHT_COLOR);
    gl.uniform3fv(floorLoc.u.uAmbient,    AMBIENT_COLOR);
    gl.uniform3fv(floorLoc.u.uCameraPos,  CAMERA_POS);
    gl.uniform3fv(floorLoc.u.uColorP1,    COLOR_GOAL_P1);
    gl.uniform3fv(floorLoc.u.uColorP2,    COLOR_GOAL_P2);
    gl.uniform1f (floorLoc.u.uHalfW,      ARENA_HALF_W);
    gl.uniform1f (floorLoc.u.uHalfL,      ARENA_HALF_L);

    const m = mat4.create();
    mat4.scale(m, m, [ARENA_HALF_W, 1, ARENA_HALF_L]);
    setModelUniforms(floorLoc, m);

    gl.drawElements(gl.TRIANGLES, meshPlane.count, gl.UNSIGNED_SHORT, 0);
}

function drawScene() {
    resize();
    buildView();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    drawFloor();

    const wallThickness = 0.4;
    for (const sx of [-1, +1]) {
        const m = mat4.create();
        mat4.translate(m, m, [sx * (ARENA_HALF_W + wallThickness / 2), WALL_HEIGHT / 2, 0]);
        mat4.scale(m, m, [wallThickness / 2, WALL_HEIGHT / 2, ARENA_HALF_L]);
        drawLit(meshBox, m, COLOR_WALL, 20.0, 0.12);
    }

    for (const [z, col] of [[+ARENA_HALF_L, COLOR_GOAL_P1], [-ARENA_HALF_L, COLOR_GOAL_P2]]) {
        const m = mat4.create();
        mat4.translate(m, m, [0, 0.05, z]);
        mat4.scale(m, m, [ARENA_HALF_W, 0.05, 0.08]);
        drawLit(meshBox, m, col, 5.0, 0.9);
    }

    {
        const m = mat4.create();
        mat4.translate(m, m, [ball.pos[0], 0.01, ball.pos[2]]);
        mat4.scale(m, m, [BALL_RADIUS * 1.4, 1, BALL_RADIUS * 1.4]);
        drawLit(meshDisc, m, [0.0, 0.0, 0.0], 1.0, 0.0);
    }

    {
        const m = mat4.create();
        mat4.translate(m, m, ball.pos);
        mat4.scale(m, m, [BALL_RADIUS, BALL_RADIUS, BALL_RADIUS]);
        drawLit(meshSphere, m, COLOR_BALL, 80.0, 0.25);
    }

    drawPaddle(p1);
    drawPaddle(p2);
}

function drawPaddle(p) {
    const m = mat4.create();
    mat4.translate(m, m, p.pos);
    mat4.scale(m, m, [PADDLE_W / 2, PADDLE_H / 2, PADDLE_D / 2]);
    drawLit(meshBox, m, p.color, 60.0, 0.35);
}


const scoreEl1     = document.getElementById('score1');
const scoreEl2     = document.getElementById('score2');
const countdownEl  = document.getElementById('countdown');
const winOverlay   = document.getElementById('winOverlay');
const winTitleEl   = document.getElementById('winTitle');
const winSubEl     = document.getElementById('winSub');
const playAgainBtn = document.getElementById('playAgain');
const startOverlay = document.getElementById('startOverlay');
const startBtn     = document.getElementById('startBtn');
const flashEl      = document.getElementById('flash');
const lastEventEl  = document.getElementById('lastEvent');
const speedEl      = document.getElementById('speedReadout');

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function updateScoreboard() {
    scoreEl1.textContent = pad2(state.score[0]);
    scoreEl2.textContent = pad2(state.score[1]);
}
function updateSpeedReadout() {
    const r = (ball.speed / BALL_BASE_SPEED);
    speedEl.textContent = 'BALL.V ' + r.toFixed(2);
}

function showWin() {
    const winner = state.winner;
    winTitleEl.textContent = `PLAYER 0${winner} WINS`;
    winSubEl.textContent   = `FINAL SCORE — ${pad2(state.score[0])} : ${pad2(state.score[1])}`;
    winOverlay.classList.remove('hidden');
    ball.live = false;
    lastEventEl.textContent = `MATCH OVER — P0${winner}`;
}

function hideWin() { winOverlay.classList.add('hidden'); }

function startCountdown() {
    const steps = ['3', '2', '1', 'GO!'];
    let i = 0;
    ball.live = false;
    const tick = () => {
        if (i < steps.length) {
            countdownEl.textContent = steps[i];
            countdownEl.classList.add('show');
            beep(i === steps.length - 1 ? 880 : 520, 0.12, 'sine', 0.05);
            i++;
            setTimeout(() => {
                countdownEl.classList.remove('show');
                setTimeout(tick, 180);
            }, 520);
        } else {
            countdownEl.textContent = '';
            ball.live = true;
            lastEventEl.textContent = 'RALLY';
        }
    };
    tick();
}

function resetMatch() {
    state.score = [0, 0];
    state.winner = 0;
    state.shakeT = 0;
    p1.pos[0] = 0; p1.pos[2] = PADDLE_Z_P1;
    p2.pos[0] = 0; p2.pos[2] = PADDLE_Z_P2;
    updateScoreboard();
    updateSpeedReadout();
    resetBall(Math.random() < 0.5 ? 1 : 2);
    hideWin();
    startCountdown();
}

playAgainBtn.addEventListener('click', () => { ensureAudio(); resetMatch(); });
startBtn.addEventListener('click', () => {
    ensureAudio();
    startOverlay.classList.add('hidden');
    resetMatch();
});


let lastT = performance.now();
function gameLoop(now) {
    const dt = Math.min((now - lastT) / 1000, 1 / 30);
    lastT = now;

    if (!state.winner) {
        updatePaddles(dt);
        updateBall(dt);
    }
    if (state.shakeT > 0) {
        state.shakeT -= dt;
        if (state.shakeT < 0) state.shakeT = 0;
    }

    drawScene();
    requestAnimationFrame(gameLoop);
}


function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function mat3FromMat4(out, m) {
    out[0] = m[0]; out[1] = m[1]; out[2] = m[2];
    out[3] = m[4]; out[4] = m[5]; out[5] = m[6];
    out[6] = m[8]; out[7] = m[9]; out[8] = m[10];
    return out;
}

function mat3InvertTranspose(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2];
    const a10 = m[3], a11 = m[4], a12 = m[5];
    const a20 = m[6], a21 = m[7], a22 = m[8];

    const b01 =  a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 =  a21 * a10 - a11 * a20;

    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) return m;
    det = 1.0 / det;

    const i00 = b01 * det;
    const i01 = (-a22 * a01 + a02 * a21) * det;
    const i02 = ( a12 * a01 - a02 * a11) * det;
    const i10 = b11 * det;
    const i11 = ( a22 * a00 - a02 * a20) * det;
    const i12 = (-a12 * a00 + a02 * a10) * det;
    const i20 = b21 * det;
    const i21 = (-a21 * a00 + a01 * a20) * det;
    const i22 = ( a11 * a00 - a01 * a10) * det;

    m[0] = i00; m[1] = i10; m[2] = i20;
    m[3] = i01; m[4] = i11; m[5] = i21;
    m[6] = i02; m[7] = i12; m[8] = i22;
    return m;
}


async function init() {
    const [litVS, litFS, floorFS] = await Promise.all([
        loadText('shaders/lit.vert'),
        loadText('shaders/lit.frag'),
        loadText('shaders/floor.frag'),
    ]);

    litProgram = link(
        compile(gl.VERTEX_SHADER,   litVS),
        compile(gl.FRAGMENT_SHADER, litFS)
    );
    floorProgram = link(
        compile(gl.VERTEX_SHADER,   litVS),
        compile(gl.FRAGMENT_SHADER, floorFS)
    );

    litLoc = locs(litProgram,
        ['aPosition', 'aNormal'],
        ['uModel', 'uView', 'uProj', 'uNormalMat',
         'uBaseColor', 'uLightDir', 'uLightColor', 'uAmbient',
         'uCameraPos', 'uShininess', 'uEmissive']
    );

    floorLoc = locs(floorProgram,
        ['aPosition', 'aNormal'],
        ['uModel', 'uView', 'uProj', 'uNormalMat',
         'uLightDir', 'uLightColor', 'uAmbient', 'uCameraPos',
         'uColorP1', 'uColorP2', 'uHalfW', 'uHalfL']
    );

    meshBox    = createBox();
    meshSphere = createSphere(20, 28);
    meshPlane  = createPlane();
    meshDisc   = createDisc();

    updateScoreboard();
    updateSpeedReadout();
    resetBall(Math.random() < 0.5 ? 1 : 2);
    lastEventEl.textContent = 'AWAITING START';
    requestAnimationFrame(gameLoop);
}

init().catch(err => showError('Init: ' + err.message));
