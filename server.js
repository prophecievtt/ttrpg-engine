#!/usr/bin/env node
/**
 * ttrpg-engine scaffold server — the API/IPC transport layer.
 *
 * A dependency-free Node HTTP endpoint that frontends (Discord bots, VTT
 * clients, test harnesses) will target. In this scaffold slice the engine is
 * not yet wired: POST /intent deterministically echoes a `rejected` response.
 * The real dispatch pipeline plugs in during the fireball slice.
 *
 *   GET  /health   → liveness probe
 *   GET  /         → service info
 *   POST /intent   → RFC 6902-shaped response envelope (scaffold echo)
 *
 * Requires no build: core packages import from their source entry points via
 * workspace resolution once they ship real APIs.
 */

import http from "node:http";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4545);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "ttrpg-engine",
      mode: "scaffold",
      uptime_ms: Math.round(process.uptime() * 1000),
    });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "ttrpg-engine",
      description: "Headless TTRPG engine — scaffold IPC endpoint",
      endpoints: ["GET /health", "POST /intent"],
    });
  }

  if (req.method === "POST" && url.pathname === "/intent") {
    const intent = await readJson(req).catch(() => null);
    if (!intent || typeof intent.intent_id !== "string" || typeof intent.type !== "string") {
      return json(res, 400, {
        error: "invalid_intent",
        message: "expected { intent_id: string, type: string, payload?: object }",
      });
    }
    // Scaffold response: the interaction engine (fireball slice) replaces this echo.
    return json(res, 200, {
      response_to: intent.intent_id,
      status: "rejected",
      delta: [],
      meta: { scaffold: true, reason: "engine slice not yet wired" },
    });
  }

  return json(res, 404, { error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`ttrpg-engine scaffold server listening on http://${HOST}:${PORT}`);
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2) + "\n");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
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