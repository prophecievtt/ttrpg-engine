#!/usr/bin/env node
/**
 * ttrpg-engine demo server — the API/IPC transport layer.
 *
 * A dependency-free Node HTTP endpoint that frontends (Discord bots, VTT
 * clients, test harnesses) target. It hosts the ember example system: one
 * session ("ember-session-1") is open at start, and intents run through the
 * orchestrator (CAST_SPELL) or straight into the engine (everything else).
 *
 *   GET  /health                 → liveness probe
 *   GET  /                       → service info
 *   GET  /state?session=<id>     → current session state
 *   POST /intent[?session=<id>]  → { response_to, status, delta, meta? }
 *
 * CAST_SPELL payload: { spell_id, at: {x,y,z} | targets: [ids], injected_entropy? }.
 * Dice and saves not injected are rolled by a seeded server RNG (SEED env).
 *
 * Imports the built dist: run `pnpm build` first.
 */

import http from "node:http";

import { buildEmberSession } from "./examples/ember/dist/index.js";
import { createEmberHost, handleIntent } from "./examples/fireball/dist/index.js";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4545);
const DEFAULT_SESSION = "ember-session-1";
const MAX_BODY = 1_000_000; // characters; an intent is a few hundred

const { registry } = createEmberHost({ seed: process.env.SEED ?? "ember" });
registry.open(DEFAULT_SESSION, buildEmberSession());

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "ttrpg-engine",
      sessions: registry.ids(),
      uptime_ms: Math.round(process.uptime() * 1000),
    });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "ttrpg-engine",
      description: "Headless TTRPG engine — demo IPC endpoint (ember example system)",
      endpoints: ["GET /health", "GET /state?session=<id>", "POST /intent?session=<id>"],
      default_session: DEFAULT_SESSION,
    });
  }

  const sessionId = url.searchParams.get("session") ?? DEFAULT_SESSION;

  if (req.method === "GET" && url.pathname === "/state") {
    const pipeline = registry.get(sessionId);
    if (!pipeline) return json(res, 404, { error: "unknown_session", session: sessionId });
    return json(res, 200, pipeline.engine.getState());
  }

  if (req.method === "POST" && url.pathname === "/intent") {
    const intent = await readJson(req).catch(() => null);
    if (!intent || typeof intent.intent_id !== "string" || typeof intent.type !== "string") {
      return json(res, 400, {
        error: "invalid_intent",
        message: "expected { intent_id: string, type: string, source?: string, payload?: object }",
      });
    }
    const response = handleIntent(registry, sessionId, {
      intent_id: intent.intent_id,
      type: intent.type,
      source: typeof intent.source === "string" ? intent.source : "system",
      payload: intent.payload ?? {},
    });
    return json(res, 200, response);
  }

  return json(res, 404, { error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`ttrpg-engine demo server listening on http://${HOST}:${PORT}`);
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2) + "\n");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}