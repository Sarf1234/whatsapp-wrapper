// lib/broadcast.js
// Lightweight broadcaster: SSE + optional WebSocket support
const SSE_CLIENTS = [];
const WS_CLIENTS = new Set();

export const broadcaster = {
  // register SSE response (res is Node/Next response object):
  registerSSE(res) {
    // set headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flush?.();

    const client = { res };
    SSE_CLIENTS.push(client);

    // send a hello event
    res.write(`event: hello\n`);
    res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);

    // cleanup on close
    reqOnClose(res, () => {
      const idx = SSE_CLIENTS.indexOf(client);
      if (idx !== -1) SSE_CLIENTS.splice(idx, 1);
    });

    return client;
  },

  // Broadcast to all connected SSE & WS clients
  broadcast(event) {
    try {
      const payload = JSON.stringify(event);
      // SSE
      for (const c of SSE_CLIENTS) {
        try {
          c.res.write(`event: ${event.type || "message"}\n`);
          c.res.write(`data: ${payload}\n\n`);
        } catch (e) {
          // ignore
        }
      }
      // WS
      for (const ws of WS_CLIENTS) {
        try {
          ws.send(payload);
        } catch (e) {}
      }
    } catch (e) {
      console.error("broadcast error", e);
    }
  },

  // Optional: register a websocket (if you create a ws server)
  registerWsSocket(ws) {
    WS_CLIENTS.add(ws);
    ws.on("close", () => WS_CLIENTS.delete(ws));
  }
};

// helper: detect when response closed (works in Node)
function reqOnClose(res, cb) {
  try {
    res.socket?.on("close", cb);
  } catch (e) {}
}
