# SideraDeck — Master Engineering Specification & AI Assistant Protocol

## 0. Mandatory Coding Assistant Protocol (Read First)

Any AI coding assistant working on this repository **must** obey these rules on every task:

1. **Ask-First, Zero-Assumption Rule:** Never assume missing UX behaviors, asset resolutions, layout priorities, or architectural trade-offs. Before writing code for **any** new phase or feature, output a brief **Design & Clarification Check**:
* Ask 2–4 concise, high-signal questions for anything underspecified.
* Provide your recommended default next to each question so the developer can reply `"use defaults"` or override specific items.
* **Wait for explicit confirmation** before generating implementation code.


2. **Zero Hardcoding:** Never hardcode celestial body components (e.g., no `<MarsMesh/>`), inline system prompts, LLM model IDs, API URLs, or magic numbers. Everything must be driven by Zod-validated config files or environment variables.
3. **Strict $0.00 Budget:** Never introduce paid APIs, paid UI tiers, or services requiring a credit card.
4. **Scoped Phases & Verification:** Implement one phase at a time. At the end of every phase, provide exact terminal commands to verify build, strict typecheck (`tsc --noEmit`), lint, and runtime performance.
5. **Zero UI or AI Slop:** No neon purple gradients, no glassmorphism blur soup, no unrequested decorative animations, and no LLM filler copy.

---

## 1. Product Vision & Core Constraints

**SideraDeck** is an age-adaptive, physically accurate 3D space explorer and AI telemetry guide. It enables users of any age to navigate the Solar System and beyond, inspect real-time planetary positions, view multiple camera POVs, and ask context-aware astronomy questions on the go.

* **Aesthetic Direction:** *NASA Eyes* meets *SpaceX flight telemetry*. Matte deep charcoal (`#06080D`), `1px` hairline borders (`rgba(255,255,255,0.1)`), crisp sans-serif copy, and `tabular-nums` monospace telemetry.
* **Factual Grounding:** The LLM is strictly a **translator of verified NASA/JPL data**, never an encyclopedia. Every numerical claim must originate from verified local JSON or live NASA/JPL APIs.

---

## 2. 100% Free Production Tech Stack

| Layer | Technology / Service | Free-Tier Usage |
| --- | --- | --- |
| **Frontend** | React 19 + TypeScript (Strict) + Vite | Fast local dev, code splitting, strict type safety. |
| **Styling & UI** | Tailwind CSS + **React Bits (Free Tier)** | Strictly free components: `Dock`, `Spotlight Card`, `Chroma Grid`, `Shiny Text`. |
| **3D Engine** | Three.js + `@react-three/fiber` + `@react-three/drei` | PBR WebGL rendering, custom GLSL shaders, KTX2 texture loading. |
| **Orbital Math** | `astronomy-engine` (Open Source, 0 deps) | Real-time heliocentric coordinates for any date/time (enables Time Scrubber). |
| **Planet Textures** | **Solar System Scope** (CC BY 4.0) | 2K/4K Day, Night, Cloud, Normal, and Specular maps converted to `.ktx2`. |
| **Starfield** | **HYG Star Database** | Real 3D galactic coordinates + B-V spectral colors (~5K–10K brightest stars). |
| **Live Space Data** | **NASA Open APIs** (APOD, NeoWs, Mars) + **JPL SBDB** | Free API keys proxied & edge-cached via Cloudflare Workers. |
| **Backend & Hosting** | **Cloudflare Pages + Cloudflare Workers** | Free static hosting + serverless `/api/*` proxy + Cache API. |
| **AI Failover Stack** | 1. **Groq Free** → 2. **Gemini API Free** → 3. **Cloudflare Workers AI** | Environment-driven waterfall failover with SSE streaming. |
| **FDE Eval Harness** | Python 3.11 (`pytest`, `textstat`) | Automated hallucination, reading-grade, slop-density, and latency checks. |

---

## 3. Zero-Hardcoding Configuration Architecture

All domain data, prompts, and infrastructure settings must live in externalized, **Zod-validated** configuration files:

1. **`config/celestial-registry.json`**: Single source of truth for every celestial body (Sun, 8 planets, major moons). Defines verified NASA/JPL telemetry, `.ktx2` texture paths, atmosphere shader colors, ring geometry parameters, axial tilt, and mission tags. Rendered dynamically by a single generic `<CelestialBodyMesh/>` component.
2. **`config/ai-config.json`**: Defines the 4 age tiers, target Flesch-Kincaid reading grades, max sentence lengths, banned slop phrases, and system prompt templates.
3. **`config/ui-tokens.css` & `tailwind.config.ts**`: All colors, spacing, typography scales, and z-index layers defined as design tokens.
4. **Environment Variables (`wrangler.toml` / `.env.example`)**: Defines LLM provider priority order, model IDs, timeout thresholds (`ms`), cache TTLs, and NASA API base URLs. Swapping models or providers requires zero code changes.

---

## 4. Functional Requirements

### 4.1 Physically Accurate 3D Engine

* **Multi-Layer PBR Planets:** Albedo (`SRGBColorSpace`), Normal/Roughness (linear), rotating cloud layers (Earth/Venus), and a day/night terminator shader revealing Earth's city lights on the night side.
* **Harsh Space Lighting:** Single Sun light source at `[0, 0, 0]` with `ambientLight <= 0.05` so night sides are genuinely dark.
* **Atmospheric Fresnel Shader:** Custom GLSL rim-glow shader driven by `atmosphereColor` in the registry.
* **Real Starfield:** HYG catalog parsed in a **Web Worker** and rendered as a single `THREE.Points` BufferGeometry with true B-V spectral colors.
* **Real-Time Orbits & Time Scrubber:** Powered by `astronomy-engine` so planets sit at their true real-world positions for today's date, with a Time Scrubber to fast-forward/rewind.
* **Scale Mode Toggle:** Instant switch between **Navigable Scale** (compressed distances/radii for exploration) and **True Scale** (accurate distance-to-radius ratios).

### 4.2 Multi-POV Camera Navigation (`CameraRig.tsx`)

Smooth, damped transitions (respecting `prefers-reduced-motion`):

1. **Orbital POV (Default):** Smooth orbit around the selected body at `2.5x` radius.
2. **Surface POV:** Drops camera just above the planet's horizon looking toward the Sun with atmospheric sky tinting.
3. **Scale-Jump POV:** Logarithmic zoom-out across **Planetary System** → **Solar System** → **Milky Way Context**.

### 4.3 Age-Adaptive Explanation Engine (4 Tiers)

| Tier | Ages | Target Reading Grade | Hard Constraints |
| --- | --- | --- | --- |
| **Explorer** | 5–8 | Grade 1–3 | Max 12 words/sentence. Everyday size comparisons. Zero equations. |
| **Cadet** | 9–13 | Grade 4–7 | Clear cause-and-effect, concrete scale facts, physical traits. |
| **Scholar** | 14–18 | Grade 8–12 | Core astrophysics terms (albedo, escape velocity, tidal locking) + approachable formulas. |
| **Astrophysicist** | 18+ | College+ | Orbital mechanics, spectroscopy, mission citations (Cassini, Juno, JWST), exact SI units. |

### 4.4 Context-Aware Streaming Q&A & Curiosity Engine

* **Scene-State Injection:** Every `POST /api/ask` request automatically attaches `selectedBodyId`, `activePov`, `ageTier`, and the exact verified telemetry JSON for the focused body.
* **SSE Streaming:** Responses stream token-by-token via Server-Sent Events for sub-second Time-to-First-Token (TTFT).
* **Curiosity "Rabbit Hole" Chips:** Every planet selection and AI answer surfaces 3 clickable, age-calibrated follow-up questions.
* **Static-First Caching:** Baseline overviews (`Bodies × 4 Age Tiers`) are pre-generated in `src/data/overviews.json` so zero LLM tokens are spent on initial planet clicks.

### 4.5 Restrained UI Layout & FDE Telemetry Overlay

* **Full-Bleed 3D Canvas (`z-0`)**
* **Top Bar (`z-10`):** `SideraDeck` wordmark | Age Tier Switcher | Navigable vs. True Scale Toggle | **FDE Inspector Toggle** (off by default).
* **Left Telemetry Panel (`z-10`):** React Bits `Spotlight Card` (subtle hairline border) with `tabular-nums` live metrics.
* **Bottom Toolbar (`z-10`):** React Bits `Dock` for POV switching, Time Scrubber, NASA Mission Gallery (`Chroma Grid`), and AI Guide Drawer.
* **Built-In FDE Telemetry Overlay (Optional Toggle):** Shows live FPS, WebGL draw calls, active LLM provider, TTFT latency, cache hit/miss status, and the exact verified JSON injected into the last prompt.

---

## 5. Industry-Grade Performance, Resilience & Accessibility

* **GPU Texture Compression:** Convert textures to `.ktx2` (Basis Universal) and load via `KTX2Loader` (~70% lower VRAM).
* **Off-Main-Thread Compute:** Run HYG star parsing and orbital calculations in Web Workers to keep the main thread at 60 FPS.
* **Instancing & LOD:** Use `THREE.InstancedMesh` for asteroid belts/ring particles and LOD for distant bodies.
* **Memory & Context Safety:** Explicitly `.dispose()` geometries/materials/textures on unmount; handle `webglcontextlost` gracefully.
* **Fault Isolation:** Wrap `<Canvas>`, Telemetry Panel, and AI Drawer in independent React Error Boundaries.
* **Code Splitting & PWA:** Lazy-load modals/drawers (`React.lazy` + `Suspense`) for `< 1.5s` FCP. Add a Vite PWA service worker to cache `.ktx2` textures, `hyg_stars_5k.json`, and `overviews.json` offline.
* **Strict TypeScript:** Enable `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`. Use granular Zustand selectors.
* **Edge Caching:** Cache NASA API responses (6h TTL) and normalized Q&A queries (24h TTL) using Cloudflare Workers Cache API.
* **Accessibility:** Full keyboard navigation (`Tab`/Arrow keys to cycle planets, `Esc` to close drawers), screen-reader telemetry tables, and `prefers-reduced-motion` support.

---

## 6. Project Folder Structure

```text
sideradeck/
├── AGENTS.md                        # Copy Section 0 here for coding assistants
├── config/
│   ├── celestial-registry.json      # Zod-validated planetary & rendering config
│   └── ai-config.json               # Age tiers, banned slop phrases, prompt templates
├── public/
│   ├── textures/                    # Compressed .ktx2 PBR planet maps
│   └── data/hyg_stars_5k.json       # Real HYG star catalog
├── src/
│   ├── components/
│   │   ├── canvas/                  # SpaceScene, CelestialBodyMesh, AtmosphereShader, RealStarfield, CameraRig
│   │   ├── ui/                      # TopBar, TelemetryPanel, BottomDock, AiGuideDrawer, NasaGalleryModal, FdeInspector
│   │   └── reactbits/               # Copy-pasted free React Bits components
│   ├── workers/                     # Web Workers (starfield parser, astronomy-engine ephemeris)
│   ├── schemas/                     # Zod validation schemas (config, API requests/responses)
│   ├── store/useSpaceStore.ts       # Zustand state store
│   └── data/overviews.json          # Pre-generated static overviews (Bodies x 4 Tiers)
├── functions/api/
│   ├── ask.ts                       # SSE streaming + env-driven Groq -> Gemini -> Workers AI failover
│   └── nasa.ts                      # Edge-cached NASA Open API proxy
├── evals/
│   ├── dataset.json                 # 30+ test cases across all 4 age tiers
│   ├── run_evals.py                 # Hallucination, Flesch-Kincaid, slop density & latency harness
│   └── report.md                    # Auto-generated benchmark table for README
├── wrangler.toml
├── package.json
└── README.md

```

---

## 7. AI FDE Evaluation Harness (`evals/run_evals.py`)

Must run automatically against `/api/ask` across 30+ test prompts and output a pass/fail scorecard:

1. **Numeric Hallucination Check:** Regex-extract numbers from LLM answers and verify against `config/celestial-registry.json`.
2. **Reading-Level Calibration (`textstat`):** Verify Flesch-Kincaid Grade Level stays within each age tier's configured bounds.
3. **Slop Density Check:** Fail any response containing banned phrases from `config/ai-config.json` or `> 0` emojis.
4. **Failover & Latency Benchmark:** Log p50/p95 TTFT and verify automatic failover when the primary provider is intentionally disabled.

---

## 8. Phased Implementation Roadmap

1. **Phase 1 — Config Layer & Core 3D Engine:** Scaffold Vite + TS + Tailwind + Zod + R3F + `astronomy-engine`. Build Web Worker starfield, dynamic `<CelestialBodyMesh/>` with `.ktx2` PBR maps, Fresnel atmosphere, and Orbital POV. *Gate: 60 FPS, `tsc --noEmit` passes, zero hardcoded planets.*
2. **Phase 2 — Restrained Telemetry HUD & Multi-POV:** Add React Bits `Dock` and `Spotlight Card`, Age Tier switcher, Navigable/True Scale toggle, Time Scrubber, Surface POV, and Scale-Jump POV. *Gate: Zero layout jank, full keyboard nav, Error Boundaries active.*
3. **Phase 3 — Streaming AI Guide & NASA Proxy:** Build `functions/api/ask.ts` (SSE + failover + Cache API), `functions/api/nasa.ts`, `AiGuideDrawer` with Curiosity Chips, `NasaGalleryModal`, and the `FdeInspector` overlay. *Gate: Sub-second TTFT, zero exposed API keys, verified failover.*
4. **Phase 4 — FDE Evals, PWA & Deployment:** Run `evals/run_evals.py` until pass rate `>= 95%`, enable offline PWA caching, publish the eval table + annotated trace in `README.md`, and deploy to Cloudflare Pages (`$0/month`).
