// GLSL for bodies. Lighting is computed from a CPU-side sun direction (float64) instead of three's
// point light, so it stays exact at true scale and the night side stays genuinely dark.
// The logdepthbuf chunks are required because the renderer uses a logarithmic depth buffer.

const worldVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 posW = modelMatrix * vec4(position, 1.0);
    vPosW = posW.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * posW;
    #include <logdepthbuf_vertex>
  }
`

export const surfaceShader = {
  vertex: worldVertex,
  fragment: /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D uMap;
    uniform sampler2D uNight;
    uniform vec3 uSunDir;
    uniform float uAmbient;
    uniform float uSunIntensity;
    uniform float uSoftness;
    uniform float uNightIntensity;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      #include <logdepthbuf_fragment>
      float ndl = dot(normalize(vNormalW), uSunDir);
      float light = uAmbient + uSunIntensity * max(ndl, 0.0);
      vec4 tex = texture2D(uMap, vUv);
      #ifdef CLOUD_LAYER
        // Cloud maps are greyscale: brightness is coverage.
        gl_FragColor = vec4(vec3(light), tex.r);
      #else
        vec3 col = tex.rgb * light;
        #ifdef USE_NIGHT
          float night = 1.0 - smoothstep(-uSoftness, uSoftness, ndl);
          col += texture2D(uNight, vUv).rgb * night * uNightIntensity;
        #endif
        gl_FragColor = vec4(col, 1.0);
      #endif
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}

export const atmosphereShader = {
  vertex: worldVertex,
  fragment: /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uColor;
    uniform vec3 uSunDir;
    uniform float uIntensity;
    uniform float uPower;
    uniform float uSoftness;
    uniform vec3 uForwardColor;
    uniform float uForwardIntensity;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vNormalW);
      vec3 toCam = normalize(cameraPosition - vPosW);
      float rim = 1.0 - max(dot(toCam, n), 0.0);
      float glow = pow(rim, uPower) * uIntensity;
      vec3 col = uColor * glow;
      #ifndef SELF_LIT
        glow *= smoothstep(-uSoftness * 2.0, uSoftness * 3.0, dot(n, uSunDir));
        col = uColor * glow;
        // Backlit limb: sunlight forward-scattered through the atmosphere toward the viewer, reddened by
        // the long path (every sunrise and sunset at once). Visible as a ring during an eclipse.
        float behind = pow(max(dot(-toCam, uSunDir), 0.0), 6.0);
        // Steep rim falloff: only the thin limb, where the sightline crosses the most air, glows.
        float fwd = behind * pow(rim, uPower * 3.0) * uForwardIntensity;
        col += uForwardColor * fwd;
        glow += fwd;
      #endif
      gl_FragColor = vec4(col, glow);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}

/** Seen from inside (BackSide) in the surface POV: sky tint from sun altitude plus a forward-scatter glow. */
export const skyShader = {
  vertex: worldVertex,
  fragment: /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uColor;
    uniform vec3 uSunDir;
    uniform vec3 uCenter;
    uniform float uSoftness;
    varying vec3 vPosW;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 view = normalize(vPosW - cameraPosition);
      vec3 up = normalize(cameraPosition - uCenter);
      float day = smoothstep(-uSoftness, uSoftness * 2.0, dot(up, uSunDir));
      float glow = pow(max(dot(view, uSunDir), 0.0), 32.0);
      float horizon = 1.0 - abs(dot(view, up));
      // Zenith is deeper than the horizon; low sun adds a warm forward-scatter halo.
      vec3 col = uColor * (0.12 + 0.5 * day) * (0.45 + 0.55 * horizon) + vec3(1.0, 0.75, 0.5) * glow * (0.25 + 0.5 * day);
      gl_FragColor = vec4(col, clamp(day * 0.8 + glow * 0.5, 0.0, 0.9));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}

/**
 * Physically based sky from the ground: single Rayleigh + Mie scattering, ray-marched in km around
 * the planet (12 view samples x 6 light samples). Additive over the stars; glare fading is separate.
 */
export const scatterSkyShader = {
  vertex: worldVertex,
  fragment: /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uSunDir;
    uniform vec3 uCenter;
    uniform float uUnitsPerKm;
    uniform float uPlanetR;
    uniform float uAtmR;
    uniform vec3 uRay;
    uniform float uHR;
    uniform vec3 uMie;
    uniform float uHM;
    uniform float uG;
    uniform float uSunI;
    uniform vec3 uSunColor;
    uniform vec3 uFwd;
    varying vec3 vPosW;
    vec2 raySphere(vec3 o, vec3 d, float r) {
      float b = dot(o, d);
      float c = dot(o, o) - r * r;
      float h = b * b - c;
      if (h < 0.0) return vec2(1e9, -1e9);
      h = sqrt(h);
      return vec2(-b - h, -b + h);
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec3 dir = normalize(vPosW - cameraPosition);
      vec3 o = (cameraPosition - uCenter) / uUnitsPerKm;
      vec2 ta = raySphere(o, dir, uAtmR);
      float tEnd = ta.y;
      vec2 tp = raySphere(o, dir, uPlanetR);
      if (tp.x > 0.0) tEnd = min(tEnd, tp.x);
      float tStart = max(ta.x, 0.0);
      if (tEnd <= tStart) discard;
      float seg = (tEnd - tStart) / float(VIEW_STEPS);
      vec3 sumR = vec3(0.0);
      vec3 sumM = vec3(0.0);
      float odR = 0.0;
      float odM = 0.0;
      for (int i = 0; i < VIEW_STEPS; i++) {
        vec3 p = o + dir * (tStart + seg * (float(i) + 0.5));
        float h = length(p) - uPlanetR;
        float dR = exp(-h / uHR) * seg;
        float dM = exp(-h / uHM) * seg;
        odR += dR;
        odM += dM;
        float sl = raySphere(p, uSunDir, uAtmR).y / float(LIGHT_STEPS);
        float lR = 0.0;
        float lM = 0.0;
        bool shadow = false;
        for (int j = 0; j < LIGHT_STEPS; j++) {
          vec3 q = p + uSunDir * (sl * (float(j) + 0.5));
          float hq = length(q) - uPlanetR;
          if (hq < 0.0) { shadow = true; break; }
          lR += exp(-hq / uHR) * sl;
          lM += exp(-hq / uHM) * sl;
        }
        if (!shadow) {
          vec3 att = exp(-(uRay * (odR + lR) + uMie * 1.1 * (odM + lM)));
          sumR += dR * att;
          sumM += dM * att;
        }
      }
      float mu = dot(dir, uSunDir);
      float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
      float g2 = uG * uG;
      float phM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * uG * mu, 1.5));
      // Fine dust scatters blue light forward: Mars's blue sunset halo around the Sun.
      vec3 mieTint = mix(vec3(1.0), uFwd, smoothstep(0.85, 1.0, mu));
      // Starlight colour: white for the Sun, deep orange for a red dwarf.
      vec3 col = uSunI * uSunColor * (sumR * uRay * phR + sumM * uMie * mieTint * phM);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}

export const ringShader = {
  vertex: worldVertex,
  fragment: /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D uMap;
    uniform vec3 uSunDir;
    uniform vec3 uPlanetCenter;
    uniform float uPlanetRadius;
    uniform float uAmbient;
    uniform float uSunIntensity;
    varying vec2 vUv;
    varying vec3 vPosW;
    void main() {
      #include <logdepthbuf_fragment>
      vec4 tex = texture2D(uMap, vec2(vUv.x, 0.5));
      // Planet shadow: does the ray toward the Sun pass through the planet sphere?
      vec3 toP = uPlanetCenter - vPosW;
      float t = dot(toP, uSunDir);
      float d = sqrt(max(dot(toP, toP) - t * t, 0.0));
      float lit = t > 0.0 ? smoothstep(uPlanetRadius * 0.97, uPlanetRadius * 1.03, d) : 1.0;
      gl_FragColor = vec4(tex.rgb * (uAmbient + uSunIntensity * lit), tex.a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}
