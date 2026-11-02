# DESIGN SYSTEM — Headless TTRPG Engine Ecosystem

## 0. Scope Statement

v1 of this project is a **headless engine library**: it ships no rendered UI. The design system therefore governs the only user-facing surfaces that exist today:

1. Repository documentation (`README.md`, `docs/*`).
2. Demo/CLI output (`examples/fireball` log-style consumer).
3. Future consumer surfaces (a docs site, a reference VTT demo) — direction banked here, not built now.

Visual UI work (a parchment/ember docs site or VTT demo) is **deferred out of v1 scope** and will consume this document when it begins.

## 1. Principles

- **Content yields to nothing.** This is a developer tool: prose, code, and API contracts come first; chrome is minimal and quiet.
- **The engine is neutral.** No package imposes a look on a frontend; deltas are data, rendering is free. The design system applies to *our* surfaces, never to consumers'.
- **Depth over flatness.** When visuals exist (docs site), they must carry layered shadows, paper grain, specular/inner highlights, and an ember glow — flat treatments are rejected by the project owner.

## 2. Direction for Future Visual Surfaces (banked, not built)

Owner-confirmed direction, recorded across prior design sessions:

- **Surface**: parchment base; warm cream; tissue-paper chrome with layered shadows and paper grain.
- **Accent**: "ember-sacred" — warm ember glow for emphasis, specular/inner highlights for material depth.
- **Typography**: scholar's-notebook display faces × Apple-clean modern sans. **Unresolved**: the v2 font specimen round is still underway; candidates — display: Lora, Spectral, Crimson Pro, Cormorant, Bitter, Playfair, EB Garamond, Alegreya; sans: Figtree, Sora, Work Sans, Hanken, Outfit, Urbanist, Schibsted, Familjen, with Apple system fonts as baseline. *No font decision is made; do not lock one here.*
- **Reference through-line** (verified 2026-10-28): Alchemy (VTT to emulate), Kobalt (reading-first calm), Mole (native sharp bento), IINA (native gestures, adaptive controls), Zen Browser (calm compact chrome), Ulysses (paper-calm, content-first).
- **Opener burn deferred**: no splash/animated opener until the product itself exists.

## 3. Design Tokens for Documentation Surfaces

Used by READMEs/docs rendering (e.g. mermaid diagrams, badges, doc images) only when visuals are added. Placeholder tokens, subject to the font decision in §2:

| Token | Value |
|---|---|
| `--paper` | warm cream base (#f5ecd7 family) |
| `--ember` | ember accent (#c3481f family) |
| `--ink` | deep warm charcoal for prose |
| Depth | layered shadows + paper grain texture + inner highlights |

## 4. Demo Output Style (v1, in force)

The `examples/fireball` consumer logs structured, monospace output:

```
[req_88a9f] CAST_SPELL fireball by uuid-wizard-1
  targets: uuid-goblin-1 (hp 6 → 0, dead)
           uuid-goblin-2 (hp 21 → 14)
  roll 8d6 [5,3,1,6,4,2,4,3] = 28
  delta ops: 4 (12 bytes JSON Patch)
  wizard spell_slots_3: 2 → 1
```

Rules: monospace (JetBrains Mono / Apple Menlo baseline), no color in log files, optional ANSI color for terminals (never in saved output), stable field order (deterministic output is a feature).

## 5. When a Frontend Arrives (future phases)

When the docs site or a reference VTT demo is scoped, this document will be extended with: component inventory, spacing/type scale, state styles (hover/focus/selected), and accessibility requirements (WCAG 2.2 AA, full keyboard support) — and the §2 font decision must be resolved first.