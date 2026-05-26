// Five distinct shader sources. Each prepended with SHADER_COMMON at runtime.
// Tuned for dark, atmospheric "ember in the dark" feel — most pixels are deep
// near-black with warm undertones, orange shows up as ember highlights and
// glow around the cursor, not as a saturated wash.

window.SHADERS = {
  // 1. Volumetric Smoke — fbm domain-warped smoke pulled toward cursor
  smoke: `
    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv;
      vec2 m = u_mouse;

      vec2 toMouse = m - p;
      float d = length(toMouse);
      vec2 pull = toMouse * exp(-d * 3.0) * 0.22;

      vec2 q = (p + pull) * 2.6;
      q.y -= u_time * 0.07;

      float n = fbmWarp(q, u_time * 0.5);

      // Cursor glow — only this and clicks brighten significantly
      float glow = exp(-d * 4.0) * 0.55;

      float burst = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= u_clickCount) break;
        vec3 c = u_clicks[i];
        vec2 cp = vec2(c.x, c.y);
        float age = c.z;
        float r = length(p - cp);
        float ring = exp(-pow((r - age * 0.3) * 7.0, 2.0)) * exp(-age * 0.7);
        float core = exp(-r * 5.0) * exp(-age * 1.4) * 0.5;
        burst += ring + core;
      }

      // Base intensity stays low; cursor + clicks add ember
      float intensity = pow(n, 1.6) * 0.55 + glow * n + burst * 0.7;
      intensity = clamp(intensity, 0.0, 1.0);

      vec3 col = orangePalette(intensity);
      col += gridOverlay(uv) * vec3(0.6, 0.25, 0.1);
      // Vignette toward edges — emphasize center glow
      col *= 1.0 - 0.55 * pow(length(p - 0.5), 1.5);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 2. Liquid Embers — flowing lava with hot core under cursor
  embers: `
    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      float aspect = u_res.x / u_res.y;
      vec2 p = uv * vec2(aspect, 1.0);
      vec2 m = u_mouse * vec2(aspect, 1.0);

      float dm = length(p - m);
      float heat = exp(-dm * 4.5) * 0.65;

      vec2 q = p * 3.2;
      q += vec2(sin(u_time * 0.3 + q.y * 1.5), cos(u_time * 0.2 + q.x * 1.5)) * 0.25;
      float n = fbmWarp(q, u_time * 0.35);

      float drop = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= u_clickCount) break;
        vec3 c = u_clicks[i];
        vec2 cp = vec2(c.x, c.y) * vec2(aspect, 1.0);
        float age = c.z;
        float r = length(p - cp);
        float wave = sin(r * 28.0 - age * 7.0) * exp(-r * 2.2) * exp(-age * 1.1);
        drop += wave * 0.35;
      }

      // Mostly dark base; n contributes only modestly without cursor heat
      float v = n * 0.45 + heat * (0.4 + n * 0.5) + drop;
      v = pow(clamp(v, 0.0, 1.1), 1.4);

      vec3 col = orangePalette(v);
      col += vec3(0.35, 0.16, 0.04) * heat * 0.5;
      col += gridOverlay(uv) * vec3(0.5, 0.22, 0.08);
      col *= 1.0 - 0.5 * pow(length(uv - 0.5), 1.5);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 3. Aurora Plasma — layered ribbons, very dark base
  aurora: `
    float ribbon(vec2 p, float t, float offset, float freq) {
      float y = sin(p.x * freq + t * 0.6 + offset) * 0.15
              + sin(p.x * freq * 2.3 + t * 0.4 + offset) * 0.08
              + cos(p.x * freq * 0.5 + t * 0.3) * 0.12;
      return exp(-pow((p.y - 0.5 - y) * 9.0, 2.0));
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv;
      vec2 m = u_mouse;

      vec2 toMouse = p - m;
      float d = length(toMouse);
      vec2 bend = normalize(toMouse + 0.001) * exp(-d * 5.0) * 0.16;
      p += bend;

      float t = u_time;
      float r1 = ribbon(p, t, 0.0, 4.0) * 0.85;
      float r2 = ribbon(p + vec2(0.0, 0.16), t, 1.7, 5.5) * 0.6;
      float r3 = ribbon(p - vec2(0.0, 0.18), t, 3.4, 3.0) * 0.5;
      float r4 = ribbon(p + vec2(0.0, 0.32), t, 5.1, 7.0) * 0.35;

      vec2 q = p * 2.0;
      float haze = fbm(q + vec2(0.0, t * 0.05)) * 0.22;

      float glow = exp(-d * 3.5) * 0.4;

      float shock = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= u_clickCount) break;
        vec3 c = u_clicks[i];
        float age = c.z;
        float r = length(p - vec2(c.x, c.y));
        shock += exp(-pow((r - age * 0.4) * 9.0, 2.0)) * exp(-age * 0.8);
      }

      float intensity = (r1 + r2 + r3 + r4) * 0.55 + haze + shock * 0.65 + glow * 0.5;
      vec3 col = orangePalette(intensity);
      col += gridOverlay(uv) * vec3(0.5, 0.22, 0.08);
      col *= 1.0 - 0.55 * pow(length(uv - 0.5), 1.5);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 4. Particle Field — dim motes that brighten near cursor
  particles: `
    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv;
      float aspect = u_res.x / u_res.y;
      vec2 pa = p * vec2(aspect, 1.0);
      vec2 ma = u_mouse * vec2(aspect, 1.0);
      float dm = length(pa - ma);
      float glow = exp(-dm * 3.5) * 0.6;

      vec2 q = p * 2.5;
      q.y -= u_time * 0.04;
      float haze = fbm(q + fbm(q + u_time * 0.1)) * 0.3;

      float scale = 60.0;
      vec2 gp = pa * scale;
      vec2 cell = floor(gp);
      vec2 frac = fract(gp) - 0.5;

      float particle = 0.0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 nb = vec2(float(i), float(j));
          vec2 c = cell + nb;
          float h1 = hash(c);
          float h2 = hash(c + 17.0);
          vec2 offset = vec2(h1, h2) - 0.5;
          offset += 0.3 * vec2(sin(u_time * (0.3 + h1) + h2 * 6.28),
                               cos(u_time * (0.3 + h2) + h1 * 6.28));

          vec2 worldPos = (c + 0.5 + offset) / scale;
          vec2 toMouse = worldPos - ma;
          float md = length(toMouse);
          vec2 push = normalize(toMouse + 0.0001) * exp(-md * 6.0) * 0.015 * scale;
          offset += push;

          // Particles brighter when close to cursor
          float prox = exp(-md * 2.5);

          vec2 dp = frac - nb - offset;
          float r = length(dp);
          float sz = 0.05 + h1 * 0.10;
          particle += smoothstep(sz, sz * 0.3, r) * (0.25 + h2 * 0.4 + prox * 0.6);
        }
      }

      float burst = 0.0;
      for (int i = 0; i < 8; i++) {
        if (i >= u_clickCount) break;
        vec3 c = u_clicks[i];
        float age = c.z;
        float r = length(p - vec2(c.x, c.y));
        burst += exp(-pow((r - age * 0.4) * 11.0, 2.0)) * exp(-age * 0.7);
      }

      float intensity = haze * 0.35 + particle * 0.55 + burst * 0.55 + glow * 0.4;
      vec3 col = orangePalette(intensity);
      col += gridOverlay(uv) * vec3(0.5, 0.22, 0.08);
      col *= 1.0 - 0.5 * pow(length(uv - 0.5), 1.5);
      gl_FragColor = vec4(col, 1.0);
    }
  `,

  // 5. Voronoi Cells — molten cellular pattern, cursor warps + ignites
  voronoi: `
    vec2 voronoi(vec2 p, float t) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float d1 = 8.0;
      float d2 = 8.0;
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y));
          vec2 cc = i + g;
          vec2 o = vec2(hash(cc), hash(cc + 13.0));
          o = 0.5 + 0.5 * sin(t * 0.8 + 6.28 * o);
          vec2 r = g + o - f;
          float d = dot(r, r);
          if (d < d1) { d2 = d1; d1 = d; }
          else if (d < d2) { d2 = d; }
        }
      }
      return vec2(sqrt(d1), sqrt(d2));
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv;
      float aspect = u_res.x / u_res.y;
      vec2 pa = p * vec2(aspect, 1.0);
      vec2 ma = u_mouse * vec2(aspect, 1.0);

      vec2 toMouse = pa - ma;
      float dm = length(toMouse);
      vec2 warp = normalize(toMouse + 0.0001) * exp(-dm * 4.0) * 0.10;
      pa += warp;
      float glow = exp(-dm * 3.5) * 0.55;

      for (int i = 0; i < 8; i++) {
        if (i >= u_clickCount) break;
        vec3 c = u_clicks[i];
        float age = c.z;
        vec2 cp = vec2(c.x, c.y) * vec2(aspect, 1.0);
        vec2 dir = pa - cp;
        float r = length(dir);
        float pulse = sin(r * 18.0 - age * 7.0) * exp(-r * 2.5) * exp(-age * 1.0);
        pa += normalize(dir + 0.0001) * pulse * 0.04;
      }

      vec2 v = voronoi(pa * 5.0, u_time);
      float edge = smoothstep(0.0, 0.08, v.y - v.x);
      float core = 1.0 - smoothstep(0.0, 0.4, v.x);

      vec2 sq = pa * 1.8;
      float smoke = fbm(sq + u_time * 0.08) * 0.25;

      float intensity = core * 0.35 + (1.0 - edge) * 0.3 + smoke + glow * 0.55;
      vec3 col = orangePalette(intensity);
      col += vec3(0.7, 0.32, 0.10) * (1.0 - edge) * 0.18 * (0.4 + glow);
      col += gridOverlay(uv) * vec3(0.5, 0.22, 0.08);
      col *= 1.0 - 0.55 * pow(length(uv - 0.5), 1.5);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
