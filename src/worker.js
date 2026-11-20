// Elf Gift Dash: tiny game-room server.
// The page at /public is served as static files; /ws is the live game connection.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      const name = (url.searchParams.get("room") || "party").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "party";
      return env.ROOM.get(env.ROOM.idFromName(name)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

const MAX_PEERS = 60;

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.hostWs = null;   // the screen currently running the game
    this.hostLast = 0;
  }

  async fetch() {
    if (this.ctx.getWebSockets().length >= MAX_PEERS) return new Response("Room is full", { status: 503 });
    const [client, server] = Object.values(new WebSocketPair());
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, p: {} });
    const peers = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === server) continue;
      const a = ws.deserializeAttachment();
      if (a) peers.push({ peer: a.id, p: { n: a.p.n, j: a.p.j } });
    }
    server.send(JSON.stringify({ t: "welcome", peer: id, peers }));
    this.broadcast({ t: "pres", peer: id, p: {} }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 16000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment();
    if (!a || !m || typeof m !== "object") return;

    if (m.t === "pres" && m.p && typeof m.p === "object") {
      const old = a.p || {};
      const np = { ...old, ...m.p };
      a.p = np;
      ws.serializeAttachment(a);
      if (old.n !== np.n || old.j !== np.j) {
        // name / joined changed: everyone needs it for the lobby list
        this.broadcast({ t: "pres", peer: a.id, p: np }, ws);
      } else if (this.hostWs && this.hostWs !== ws) {
        // positions only matter to the host screen that runs the game
        try { this.hostWs.send(JSON.stringify({ t: "pres", peer: a.id, p: m.p })); } catch {}
      }
      return;
    }

    if (m.t === "emit" && typeof m.topic === "string" && /^[a-z][a-z0-9_.-]{0,47}$/.test(m.topic)) {
      if (m.topic === "st" || m.topic === "ro") {
        const now = Date.now();
        const hostAlive = this.hostWs && this.hostWs !== ws && now - this.hostLast < 6000 &&
          this.ctx.getWebSockets().includes(this.hostWs);
        if (hostAlive) return; // someone else is already hosting
        if (this.hostWs !== ws) {
          this.hostWs = ws;
          // give the new host everyone's latest positions
          for (const o of this.ctx.getWebSockets()) {
            if (o === ws) continue;
            const oa = o.deserializeAttachment();
            if (oa) try { ws.send(JSON.stringify({ t: "pres", peer: oa.id, p: oa.p })); } catch {}
          }
        }
        this.hostLast = now;
      }
      this.broadcast({ t: "msg", peer: a.id, topic: m.topic, data: m.data }, ws);
    }
  }

  webSocketClose(ws) { this.leave(ws); }
  webSocketError(ws) { this.leave(ws); }

  leave(ws) {
    const a = ws.deserializeAttachment();
    if (this.hostWs === ws) this.hostWs = null;
    try { ws.close(1000, "bye"); } catch {}
    if (a) this.broadcast({ t: "left", peer: a.id }, ws);
  }

  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(s); } catch {}
    }
  }
}
