// Premium AI-agent ambient background shader.
//
// Composition layers, back-to-front:
//   1. Deep navy → near-black radial gradient base
//   2. Slow-drifting volumetric glow blobs (cyan / deep blue)
//   3. Fine neural grid (two scales) with edge-fade
//   4. Floating particles (tiny silver/cyan twinkles)
//   5. Vertical data streams (thin lines with bright heads)
//   6. Subtle top-down wash + soft breathing pulse
//   7. Vignette + fine grain
//
// Exposes window.setupAIAgentBg(canvas) → { destroy, setUniforms({ ... }) }

window.setupAIAgentBg = function (canvas) {
  const gl = canvas.getContext('webgl', {
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) {
    canvas.style.background =
      'radial-gradient(ellipse at center, #0d1422, #060810 65%, #04060c)';
    return { destroy(){}, setUniforms(){} };
  }

  const vsSrc = `attribute vec2 a_pos;
    void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const fsSrc = `
    precision highp float;
    uniform vec2  u_res;
    uniform float u_time;
    uniform vec2  u_mouse;       // -0.5..0.5
    uniform float u_parallax;
    uniform float u_gridAmt;
    uniform float u_particlesAmt;
    uniform float u_streamsAmt;
    uniform float u_pulseAmt;
    uniform float u_glowAmt;
    uniform float u_grainAmt;
    uniform vec3  u_accent;      // cyan accent

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

    // ─── Volumetric glow: 3 large soft blobs drifting very slowly ────
    float glowField(vec2 p, float aspect) {
      float g = 0.0;
      for (int i = 0; i < 2; i++) {
        float fi = float(i);
        vec2 c = vec2(
          0.32 + 0.36 * fi + sin(u_time * 0.025 + fi * 1.7) * 0.10,
          0.45 + sin(u_time * 0.022 + fi * 2.3) * 0.14
        );
        c.x *= aspect;
        float d = length(p - c);
        // Wider, more present pools — navy depth that you can feel
        float scale = 2.0 + fi * 0.4;
        g += exp(-d * d * scale) * (0.50 + 0.15 * fi);
      }
      return g;
    }

    // ─── Neural grid: two scales, perspective-y faded ────────────────
    float gridLines(vec2 p) {
      // Drift ultra-slowly (cloud pace)
      p += vec2(u_time * 0.004, -u_time * 0.006);

      // Fine grid
      vec2 g1 = vec2(0.5) - abs(fract(p * 14.0) - 0.5);
      float fine = min(g1.x, g1.y);
      float line1 = exp(-fine * 95.0) * 0.55;

      // Major grid (every ~5 fine cells)
      vec2 g2 = vec2(0.5) - abs(fract(p * 2.8) - 0.5);
      float major = min(g2.x, g2.y);
      float line2 = exp(-major * 70.0) * 0.45;

      // Slight intersection brighten on major grid
      float xsec = exp(-(g2.x + g2.y) * 90.0) * 0.6;

      return line1 + line2 + xsec;
    }

    // ─── Particles: tiny twinkling motes drifting slowly ─────────────
    float particles(vec2 p, float aspect) {
      float total = 0.0;
      for (int i = 0; i < 28; i++) {
        float fi = float(i);
        float seed = hash11(fi);
        vec2 base = vec2(hash11(fi * 1.31), hash11(fi * 2.77));
        base.x *= aspect;
        vec2 pos = base + vec2(
          sin(u_time * 0.05 + seed * 6.283) * 0.05,
          cos(u_time * 0.06 + seed * 3.141) * 0.04
        );
        float d = length(p - pos);
        float twinkle = 0.55 + 0.45 * sin(u_time * 0.6 + seed * 28.0);
        // Tight gaussian — keep particles small and crisp
        total += exp(-d * d * 18000.0) * twinkle;
      }
      return total;
    }

    // ─── Data streams: thin vertical streaks with bright heads ───────
    float dataStreams(vec2 uv, float aspect) {
      float total = 0.0;
      float headTotal = 0.0;
      for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float lane = hash11(fi * 3.71);
        float speed = 0.04 + hash11(fi * 1.93) * 0.035;
        float offset = hash11(fi * 5.13);
        float y = mod(1.25 + offset - u_time * speed, 1.4) - 0.2;

        float dx = abs(uv.x - lane);
        // Thin vertical trail above the head
        float trailAbove = exp(-dx * 2400.0)
          * smoothstep(0.0, 0.02, uv.y - y)
          * smoothstep(0.35, 0.04, uv.y - y);
        // Tight head
        vec2 hd = (uv - vec2(lane, y)) * vec2(140.0, 28.0);
        float head = exp(-dot(hd, hd));

        total    += trailAbove * 0.55;
        headTotal += head;
      }
      return total + headTotal * 1.0;
    }

    void main() {
      vec2 frag = gl_FragCoord.xy / u_res.xy;
      float aspect = u_res.x / u_res.y;
      vec2 uv = frag;
      vec2 pa = vec2(uv.x * aspect, uv.y);

      // Parallax shift (subtle)
      vec2 par = vec2(-u_mouse.x, u_mouse.y) * u_parallax;
      vec2 uvP = uv + par;
      vec2 paP = vec2(uvP.x * aspect, uvP.y);

      // ─── Base gradient (richer, deeper navy/cobalt) ────────────
      vec2 vc = uv - vec2(0.5, 0.42);
      float vd = length(vc * vec2(aspect / max(aspect, 1.0), 1.0));
      vec3 col = mix(
        vec3(0.045, 0.110, 0.245),     // center: saturated cobalt-navy
        vec3(0.022, 0.055, 0.140),     // mid: deep saturated navy
        smoothstep(0.0, 0.55, vd)
      );
      col = mix(col, vec3(0.010, 0.020, 0.055), smoothstep(0.55, 1.10, vd));

      // ─── Soft breathing pulse (very slow, restrained) ──────────
      float pulse = 1.0 + 0.18 * sin(u_time * 0.32) * u_pulseAmt;

      // ─── Volumetric glow blobs ──────────────────────────────────
      // Heavily restrained — these should hint at light, not flood it.
      float g = glowField(paP, aspect) * u_glowAmt * pulse;
      // Saturated cobalt body + cyan-teal rim — rich color depth
      col += vec3(0.14, 0.32, 0.78) * g * 1.15;
      col += u_accent * g * 0.28;

      // ─── Neural grid ────────────────────────────────────────────
      float gr = gridLines(paP) * u_gridAmt;
      // Edge fade so grid breathes out into darkness
      vec2 edge = abs(uv - 0.5) * 2.0;
      float edgeFade = 1.0 - smoothstep(0.55, 1.10, max(edge.x, edge.y));
      edgeFade = pow(edgeFade, 1.8);
      gr *= edgeFade;
      col += u_accent * gr * 0.22;
      col += vec3(0.55, 0.75, 1.0) * gr * 0.08;

      // ─── Particles ──────────────────────────────────────────────
      float pt = particles(paP, aspect) * u_particlesAmt;
      col += vec3(0.80, 0.90, 1.0) * pt * 0.70;
      col += u_accent * pt * 0.25;

      // ─── Data streams ───────────────────────────────────────────
      float ds = dataStreams(uvP, aspect) * u_streamsAmt;
      col += u_accent * ds * 0.40;
      col += vec3(1.0, 1.0, 1.0) * ds * 0.10;

      // ─── Top-down soft volumetric wash — adds richness to upper field ──
      float topLight = smoothstep(1.15, 0.15, uv.y) * 0.075;
      col += vec3(0.20, 0.55, 1.0) * topLight;

      // ─── Vignette ───────────────────────────────────────────────
      float vig = 1.0 - smoothstep(0.40, 1.05, vd) * 0.85;
      col *= vig;

      // ─── Fine grain (helps avoid banding on dark gradients) ────
      float gn = hash21(gl_FragCoord.xy + vec2(u_time * 31.0, u_time * 17.0)) - 0.5;
      col += vec3(gn) * u_grainAmt;

      // No tone-curve gain — keep blacks black. Stronger compression to cap any highlight pile-ups.
      col = col / (1.0 + col * 0.55);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]),
    gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {
    res:          gl.getUniformLocation(prog, 'u_res'),
    time:         gl.getUniformLocation(prog, 'u_time'),
    mouse:        gl.getUniformLocation(prog, 'u_mouse'),
    parallax:     gl.getUniformLocation(prog, 'u_parallax'),
    gridAmt:      gl.getUniformLocation(prog, 'u_gridAmt'),
    particlesAmt: gl.getUniformLocation(prog, 'u_particlesAmt'),
    streamsAmt:   gl.getUniformLocation(prog, 'u_streamsAmt'),
    pulseAmt:     gl.getUniformLocation(prog, 'u_pulseAmt'),
    glowAmt:      gl.getUniformLocation(prog, 'u_glowAmt'),
    grainAmt:     gl.getUniformLocation(prog, 'u_grainAmt'),
    accent:       gl.getUniformLocation(prog, 'u_accent'),
  };

  // Hex → linear-ish 0..1 (gamma is irrelevant for the accent color here)
  function hex3(h) {
    h = (h || '#6fc3ff').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }

  // Mutable uniform state (driven by tweaks)
  const state = {
    parallax: 0.018,
    gridAmt: 0.55,
    particlesAmt: 0.9,
    streamsAmt: 0.7,
    pulseAmt: 0.6,
    glowAmt: 0.85,
    grainAmt: 0.025,
    accent: hex3('#6fc3ff'),
  };

  // ─── Sizing ─────────────────────────────────────────────────────
  function resize() {
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  window.addEventListener('resize', resize);
  resize();

  // ─── Mouse parallax (eased, window-scoped) ─────────────────────
  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
  function onMove(e) {
    const t = e.touches ? e.touches[0] : e;
    mouse.tx = (t.clientX / window.innerWidth)  - 0.5;
    mouse.ty = (t.clientY / window.innerHeight) - 0.5;
  }
  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: true });

  // ─── Loop ───────────────────────────────────────────────────────
  const start = performance.now();
  let running = true;
  function frame() {
    if (!running) return;
    const t = (performance.now() - start) / 1000;
    // Slow ease — calm, never jittery
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;

    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.time, t);
    gl.uniform2f(U.mouse, mouse.x, mouse.y);
    gl.uniform1f(U.parallax,     state.parallax);
    gl.uniform1f(U.gridAmt,      state.gridAmt);
    gl.uniform1f(U.particlesAmt, state.particlesAmt);
    gl.uniform1f(U.streamsAmt,   state.streamsAmt);
    gl.uniform1f(U.pulseAmt,     state.pulseAmt);
    gl.uniform1f(U.glowAmt,      state.glowAmt);
    gl.uniform1f(U.grainAmt,     state.grainAmt);
    gl.uniform3f(U.accent, state.accent[0], state.accent[1], state.accent[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setUniforms(patch) {
      if (!patch) return;
      for (const k of [
        'parallaxAmt', 'gridAmt', 'particlesAmt', 'streamsAmt',
        'pulseAmt', 'glowAmt', 'grainAmt'
      ]) {
        const srcKey = k === 'parallaxAmt' ? 'parallaxAmt' : k;
        if (patch[srcKey] != null) {
          const tgt = k === 'parallaxAmt' ? 'parallax' : k;
          state[tgt] = patch[srcKey];
        }
      }
      if (patch.accent != null) state.accent = hex3(patch.accent);
    },
    destroy() {
      running = false;
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
    },
  };
};
