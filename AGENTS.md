# SideraDeck - AI Coding Assistant Protocol

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


Full specification: SPEC.md. Phase status and deviations: docs/DECISIONS.md.
