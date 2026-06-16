// Shared WebGL shader runner
// Each shader exposes: fragmentSource, optional onClick(state, x, y)
// State: { mouse: [x,y], time, clicks: [{x,y,t,strength}] }

window.ShaderRunner = class ShaderRunner {
  constructor(canvas, fragmentSource) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true });
    if (!this.gl) {
      canvas.style.background = '#1a0a05';
      return;
    }
    this.mouse = [0.5, 0.5];
    this.targetMouse = [0.5, 0.5];
    this.clicks = []; // {x, y, t}
    this.startTime = performance.now();
    this.running = true;

    this._buildProgram(fragmentSource);
    this._bindEvents();
    this._resize();
    this._loop();
  }

  _buildProgram(fragmentSource) {
    const gl = this.gl;
    const vsSrc = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('shader compile', gl.getShaderInfoLog(s), src);
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('link', gl.getProgramInfoLog(prog));
    }
    this.program = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.uTime = gl.getUniformLocation(prog, 'u_time');
    this.uRes = gl.getUniformLocation(prog, 'u_res');
    this.uMouse = gl.getUniformLocation(prog, 'u_mouse');
    this.uClicks = gl.getUniformLocation(prog, 'u_clicks'); // vec3[8] x,y,age
    this.uClickCount = gl.getUniformLocation(prog, 'u_clickCount');
  }

  _bindEvents() {
    const onMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      this.targetMouse[0] = (t.clientX - r.left) / r.width;
      this.targetMouse[1] = 1 - (t.clientY - r.top) / r.height;
    };
    const onClick = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      const x = (t.clientX - r.left) / r.width;
      const y = 1 - (t.clientY - r.top) / r.height;
      this.clicks.push({ x, y, t: (performance.now() - this.startTime) / 1000 });
      if (this.clicks.length > 8) this.clicks.shift();
    };
    this.canvas.addEventListener('mousemove', onMove);
    this.canvas.addEventListener('touchmove', onMove, { passive: true });
    this.canvas.addEventListener('mousedown', onClick);
    this.canvas.addEventListener('touchstart', onClick, { passive: true });

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.canvas);
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  _loop() {
    if (!this.running) return;
    const gl = this.gl;
    const now = (performance.now() - this.startTime) / 1000;

    // Smooth mouse
    this.mouse[0] += (this.targetMouse[0] - this.mouse[0]) * 0.08;
    this.mouse[1] += (this.targetMouse[1] - this.mouse[1]) * 0.08;

    gl.useProgram(this.program);
    gl.uniform1f(this.uTime, now);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uMouse, this.mouse[0], this.mouse[1]);

    // Clicks: pack as vec3 (x, y, age)
    const clickData = new Float32Array(8 * 3);
    let count = 0;
    for (let i = 0; i < this.clicks.length; i++) {
      const c = this.clicks[i];
      const age = now - c.t;
      if (age < 4.0) {
        clickData[count * 3] = c.x;
        clickData[count * 3 + 1] = c.y;
        clickData[count * 3 + 2] = age;
        count++;
      }
    }
    if (this.uClicks) gl.uniform3fv(this.uClicks, clickData);
    if (this.uClickCount) gl.uniform1i(this.uClickCount, count);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(() => this._loop());
  }

  destroy() {
    this.running = false;
    if (this._ro) this._ro.disconnect();
  }
};

// Common GLSL helpers (prepended to each shader)
window.SHADER_COMMON = `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform vec3 u_clicks[8];
uniform int u_clickCount;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}
// Domain-warp fbm
float fbmWarp(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t*0.1)), fbm(p + vec2(5.2, 1.3) + t*0.1));
  vec2 r = vec2(fbm(p + 4.0*q + vec2(1.7, 9.2) + t*0.15),
                fbm(p + 4.0*q + vec2(8.3, 2.8) + t*0.12));
  return fbm(p + 4.0*r);
}

// Brand orange palette — deep, atmospheric. Mostly dark with hot accents.
vec3 orangePalette(float t) {
  vec3 a = vec3(0.018, 0.010, 0.010); // near-black, warm tint
  vec3 b = vec3(0.18, 0.06, 0.03);    // dark ember
  vec3 c = vec3(0.65, 0.22, 0.08);    // brand orange muted
  vec3 d = vec3(1.00, 0.55, 0.22);    // hot ember highlight
  vec3 e = vec3(1.00, 0.85, 0.55);    // bright core
  t = clamp(t, 0.0, 1.0);
  if (t < 0.35) return mix(a, b, t / 0.35);
  if (t < 0.65) return mix(b, c, (t - 0.35) / 0.30);
  if (t < 0.88) return mix(c, d, (t - 0.65) / 0.23);
  return mix(d, e, (t - 0.88) / 0.12);
}

// Subtle grid overlay (matches reference)
float gridOverlay(vec2 uv) {
  vec2 g = abs(fract(uv * 28.0) - 0.5);
  float l = min(g.x, g.y);
  return smoothstep(0.48, 0.5, 1.0 - l) * 0.06;
}
`;
