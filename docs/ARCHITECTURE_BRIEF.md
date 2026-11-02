# Architecture Design Brief: Headless TTRPG State-Machine Ecosystem

## Executive Summary
This document defines the architecture for a headless, system-agnostic Tabletop Roleplaying Game (TTRPG) engine. Designed for maximum community adoption, open-source contribution, and modularity, the engine employs a **TypeScript-First Hybrid Architecture**.

Game logic, rule parsing, and state management are authored in TypeScript to leverage the world's largest developer ecosystem. Conversely, computationally expensive spatial geometry (including 3D volumetric math) is delegated to Rust and compiled to WebAssembly (Wasm) for near-native performance.

The ecosystem completely isolates data from rendering, exposing a strict Redux-style event loop. It is designed to be fully deterministic and multiplayer-ready out of the box, emitting standardized state deltas rather than monolithic updates. This enables the engine to be consumed by any frontend—whether an asynchronous Discord bot, a 2D web-based character creator, or a highly polished, 3D volumetric Virtual Tabletop (VTT).

To ensure developers only bundle what they need, the architecture is divided into four strictly decoupled packages.

---

## 1. `@ttrpg-engine/rules` (The Static Knowledge Engine)
**Purpose:** Acts as the definitive library and validation layer for a game system. It holds the universe of possibilities (compendiums) and enforces schemas.
*   **Core Stack:** TypeScript.
*   **Datastore & Indexing:** Wraps a fast querying engine (IndexedDB/SQLite) to index static JSON files (spells, classes, NPCs, items).
*   **Schema Enforcement:** Exposes generic JSON schemas to the frontend, allowing UI rendering layers to generate homebrew input forms dynamically without hardcoding data fields.
*   **Sandboxed Validation Scripts:** System creators provide custom validation logic (e.g., `validate_level_up.js`). To prevent malicious code execution, these scripts are executed inside a lightweight, embedded JavaScript sandbox or defined via a JSON-based logic tree.

## 2. `@ttrpg-engine/interactions` (The Live Session Engine)
**Purpose:** Tracks and mutates the active, transient state of a live game session. It operates purely as a mathematical calculator for real-time play, answering: *"What happens when Entity A does X to Entity B?"*
*   **Core Stack:** TypeScript.
*   **Entity-Component Model:** Active elements (players, monsters, persistent effects) are tracked strictly as UUIDs holding arbitrary key-value component data. 
*   **Temporal State (The Flow of Time):** The state machine natively tracks a "Phase" (e.g., `Combat`, `Exploration`) and an "Initiative Roster". Buffs, debuffs, and conditions are assigned expiration timestamps (e.g., `expires_on_round: 14`). Intents like `NEXT_TURN` advance the internal clock, automatically purging expired effects.
*   **Deterministic Randomness:** To ensure multiplayer clients stay perfectly synchronized, the engine *never* generates unseeded entropy. The frontend Orchestrator generates the dice results (via a physics roller or server RNG) and injects them into the Intent payload, allowing the engine to strictly validate and apply the math.

## 3. `@ttrpg-engine/grid` (The Tactical Mathematics Engine)
**Purpose:** Handles the fundamental, lightweight mathematics of playing on a tabletop grid. It is extremely fast and requires no WebAssembly.
*   **Core Stack:** Pure TypeScript.
*   **Features:**
    *   Distance calculations based on specific TTRPG rules (Chebyshev, Manhattan, alternating diagonals).
    *   Grid coordinate to pixel translations (and vice versa) for Square and Hex grids.
    *   Cell-based Area of Effect (AoE) arrays.

## 4. `@ttrpg-engine/spatial` (The Physics & Geometry Engine)
**Purpose:** Handles the computationally expensive physics, vector math, and geometry required for a cinematic, immersive virtual tabletop. It operates entirely on raw vector math and is fully grid-agnostic.
*   **Core Stack:** Rust (compiled to `wasm32-unknown-unknown`), wrapped in a strongly-typed TypeScript API.
*   **Z-Axis & Volumetric Space:** The engine calculates all geometry using 3D vector math (X, Y, Z) by default. A 20-foot sphere is calculated as a true volumetric globe, not a flat circle. (For 2D VTTs, the developer simply locks the Z-axis to `0`).
*   **Features:**
    *   **Dynamic Raycasting:** Instantly calculates precise 2D or 3D Line of Sight (LoS) and lighting boundaries.
    *   **Vector Collisions:** Handles complex token-to-wall collisions and sliding math across X, Y, and Z planes.
    *   **Geometric Intersections:** Calculates intersections for gridless play (e.g., tape-measure distances, cone/sphere template overlaps).

---

## Multiplayer Synchronization & State Diffing

In a multiplayer VTT, transmitting the entire megabyte-sized session state every time a goblin takes 2 damage will cause massive latency and race conditions. The `@ttrpg-engine/interactions` module solves this by emitting standard **JSON Patch (RFC 6902)** deltas.

### 1. The Intent Payload (Client to Server/Engine)
When a user takes an action, the frontend dispatches a strict Intent. Note how the entropy (the dice roll) is injected by the authoritative server or 3D dice roller to maintain determinism.

```json
{
  "intent_id": "req_88a9f",
  "type": "CAST_SPELL",
  "source": "uuid-wizard-1",
  "payload": {
    "spell_id": "fireball",
    "targets": ["uuid-goblin-1", "uuid-goblin-2"],
    "injected_entropy": {
      "damage_roll": 28,
      "target_saves": { "uuid-goblin-1": 12, "uuid-goblin-2": 19 }
    }
  }
}
```

### 2. The Patch Payload (Engine to All Clients)
The engine processes the Intent against its sandboxed rules and outputs a tiny delta array. The server broadcasts this array to all connected WebSockets, ensuring every client stays perfectly synced with minimal bandwidth.

```json
{
  "response_to": "req_88a9f",
  "status": "success",
  "delta": [
    { "op": "replace", "path": "/entities/uuid-goblin-1/hp", "value": 0 },
    { "op": "add", "path": "/entities/uuid-goblin-1/conditions/-", "value": "dead" },
    { "op": "replace", "path": "/entities/uuid-goblin-2/hp", "value": 14 },
    { "op": "replace", "path": "/entities/uuid-wizard-1/resources/spell_slots_3", "value": 1 }
  ]
}
```

---

## The Orchestration Pipeline

**Vertical Slice Example (AoE Attack on a Grid):**
1.  **Rules Query:** The Orchestrator queries `@ttrpg-engine/rules` to retrieve the schema for "Fireball" (Radius: 20ft sphere, Damage: 8d6).
2.  **Tactical Evaluation:** The Orchestrator passes the target coordinates to `@ttrpg-engine/spatial`. The engine uses 3D volumetric intersection to find all UUIDs within the sphere's blast radius, accounting for elevation (Z-axis) and cover (Line of Sight).
3.  **Interaction Dispatch:** The Orchestrator rolls the 3D dice, bundles the spell schema, targeted UUIDs, and dice results into an Intent, and dispatches it to `@ttrpg-engine/interactions`.
4.  **State Delta:** The Interactions module computes the damage via sandboxed math and returns the immutable JSON Patch delta.
5.  **UI Render:** The frontend UI consumes the delta, triggering cinematic particle effects and updating health bars simultaneously for all connected players.

## System Agnosticism & Flexibility
This decoupled structure ensures absolute flexibility for all types of TTRPGs:
*   **Grid-Based Combat (D&D, Pathfinder):** Orchestrator uses all four packages.
*   **Gridless 3D VTT (TaleSpire):** Orchestrator drops `grid` and uses `spatial` with unlocked Z-axis data for volumetric measurement.
*   **Theater of the Mind (Vampire, PbtA):** Orchestrator drops `grid` and `spatial` entirely, running a highly lightweight app utilizing only `rules` and `interactions`.