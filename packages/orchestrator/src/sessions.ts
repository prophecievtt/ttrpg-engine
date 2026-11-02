/**
 * A thin session registry for hosts (a websocket server, a Discord bot):
 * one engine + pipeline per session id, all sharing one ruleset and content.
 */
import { createEngine, type Intent, type Response, type Ruleset, type SessionState } from "@ttrpg-engine/interactions";
import type { SpatialBackend } from "@ttrpg-engine/spatial";

import { createPipeline, type EntropyProvider, type Pipeline, type SpellSource } from "./pipeline.js";

export interface RegistryOptions {
  readonly ruleset: Ruleset;
  readonly spells: SpellSource;
  readonly spatial?: SpatialBackend;
  /** Called once per opened session, so each gets its own entropy stream. */
  readonly entropy?: (sessionId: string) => EntropyProvider;
}

export interface SessionRegistry {
  open(sessionId: string, initial: SessionState): Pipeline;
  get(sessionId: string): Pipeline | undefined;
  close(sessionId: string): boolean;
  ids(): string[];
  /** Dispatch a raw intent to a session; unknown sessions are rejected. */
  dispatch(sessionId: string, intent: Intent): Response;
}

export function createSessionRegistry(options: RegistryOptions): SessionRegistry {
  const sessions = new Map<string, Pipeline>();
  return {
    open(sessionId, initial) {
      if (sessions.has(sessionId)) throw new Error(`session already open: ${sessionId}`);
      const pipeline = createPipeline({
        engine: createEngine({ ruleset: options.ruleset, session: initial }),
        spells: options.spells,
        spatial: options.spatial,
        entropy: options.entropy?.(sessionId),
      });
      sessions.set(sessionId, pipeline);
      return pipeline;
    },
    get: (sessionId) => sessions.get(sessionId),
    close: (sessionId) => sessions.delete(sessionId),
    ids: () => [...sessions.keys()],
    dispatch(sessionId, intent) {
      const pipeline = sessions.get(sessionId);
      if (!pipeline) {
        const id = intent && typeof intent.intent_id === "string" ? intent.intent_id : "";
        return { response_to: id, status: "rejected", delta: [], meta: { code: "unknown_session" } };
      }
      return pipeline.engine.dispatch(intent);
    },
  };
}
