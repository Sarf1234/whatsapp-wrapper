// app/api/whatsapp/route.js
import { NextResponse } from "next/server";
import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode";
import { broadcaster } from "@/lib/broadcast"; // see file below

let client = globalThis.client || null;
let qrCodeImage = null;
let clientStatus = "initializing";

// Job lock & state
globalThis._wh_job = globalThis._wh_job || { running: false, total: 0 };

if (!client) {
  client = new Client({
    authStrategy: new LocalAuth({ clientId: "my-whatsapp", dataPath: ".wwebjs_auth" }),
    puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] },
  });

  client.on("qr", async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    clientStatus = "qr";
    broadcaster.broadcast({ type: "status", status: "qr", qr: qrCodeImage });
    console.log("QR Generated");
  });

  client.on("ready", () => {
    clientStatus = "ready";
    qrCodeImage = null;
    broadcaster.broadcast({ type: "status", status: "ready" });
    console.log("WhatsApp is ready ✅");
  });

  client.on("authenticated", () => {
    clientStatus = "authenticated";
    broadcaster.broadcast({ type: "status", status: "authenticated" });
  });

  client.on("auth_failure", (msg) => {
    clientStatus = "auth_failure";
    broadcaster.broadcast({ type: "status", status: "auth_failure", message: msg });
    console.error("Auth failure:", msg);
  });

  client.on("disconnected", (reason) => {
    clientStatus = "disconnected";
    broadcaster.broadcast({ type: "status", status: "disconnected", message: reason });
    console.log("Client disconnected:", reason);
  });

  client.initialize().catch((e) => {
    clientStatus = "error";
    broadcaster.broadcast({ type: "status", status: "error", message: String(e) });
    console.error("Client init err", e);
  });

  globalThis.client = client;
}

// Helper delay
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function GET() {
  switch (clientStatus) {
    case "qr":
      return NextResponse.json({ status: "qr", qr: qrCodeImage, message: "Scan the QR code" });
    case "ready":
      return NextResponse.json({ status: "ready", message: "WhatsApp is connected ✅" });
    case "auth_failure":
      return NextResponse.json({ status: "auth_failure", message: "Authentication failed ❌" });
    case "disconnected":
      return NextResponse.json({ status: "disconnected", message: "Client disconnected 🛑" });
    default:
      return NextResponse.json({ status: "initializing", message: "Initializing WhatsApp connection..." });
  }
}

export async function POST(req) {
  const { numbers, messages } = await req.json();

  // Basic validation
  if (!Array.isArray(numbers) || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Numbers & messages must be arrays." }, { status: 400 });
  }
  if (numbers.length !== messages.length) {
    return NextResponse.json({ error: "Numbers & messages length must match." }, { status: 400 });
  }

  // Check client
  if (!client || !client.info?.wid) {
    return NextResponse.json({ error: "WhatsApp not connected yet." }, { status: 500 });
  }

  // Prevent concurrent jobs
  if (globalThis._wh_job.running) {
    return NextResponse.json({ error: "A sending job is already running. Please wait." }, { status: 409 });
  }

  // Initialize job
  globalThis._wh_job.running = true;
  globalThis._wh_job.total = numbers.length;
  broadcaster.broadcast({ type: "job_start", total: numbers.length });

  // Send sequentially in background (don't block request)
  (async () => {
    const results = [];
    for (let i = 0; i < numbers.length; i++) {
      const rawNum = (numbers[i] ?? "").toString();
      const rawMsg = (messages[i] ?? "").toString();
      const index = i;

      // Prepare result object (will be broadcast)
      const result = { index, rawNum, status: "queued", reason: null, timestamp: Date.now() };
      broadcaster.broadcast({ type: "progress", payload: result });

      // Validate
      const clean = rawNum.replace(/[^0-9]/g, "");
      if (!clean) {
        result.status = "skipped"; result.reason = "No phone"; result.timestamp = Date.now();
        results.push(result);
        broadcaster.broadcast({ type: "progress", payload: result });
        continue;
      }
      if (!rawMsg || !rawMsg.trim()) {
        result.status = "skipped"; result.reason = "No message"; result.timestamp = Date.now();
        results.push(result);
        broadcaster.broadcast({ type: "progress", payload: result });
        continue;
      }

      // Normalize (assume 10-digit -> India). You can change this behavior.
      let normalized = clean;
      if (normalized.length === 10) normalized = "91" + normalized;
      const chatId = `${normalized}@c.us`;

      // Mark sending
      result.chatId = chatId;
      result.status = "sending"; result.timestamp = Date.now();
      broadcaster.broadcast({ type: "progress", payload: result });

      // Validate registration
      let isRegistered = false;
      try {
        // client.isRegisteredUser accepts ID or number. Use normalized number (without @c.us)
        isRegistered = await client.isRegisteredUser(normalized).catch(() => false);
        if (!isRegistered) {
          result.status = "failed"; result.reason = "Not on WhatsApp"; result.timestamp = Date.now();
          results.push(result);
          broadcaster.broadcast({ type: "progress", payload: result });
          // wait 6 seconds before next as well (to keep rhythm)
          if (i < numbers.length - 1) await delay(6000);
          continue;
        }
      } catch (err) {
        result.status = "failed"; result.reason = "Validation error"; result.timestamp = Date.now();
        results.push(result);
        broadcaster.broadcast({ type: "progress", payload: result });
        if (i < numbers.length - 1) await delay(6000);
        continue;
      }

      // Send message
      try {
        await client.sendMessage(chatId, rawMsg);
        result.status = "sent"; result.timestamp = Date.now();
        results.push(result);
        broadcaster.broadcast({ type: "progress", payload: result });
      } catch (err) {
        result.status = "failed"; result.reason = err?.message || "Send error"; result.timestamp = Date.now();
        results.push(result);
        broadcaster.broadcast({ type: "progress", payload: result });
      }

      // wait 6s before next (skip after last)
      if (i < numbers.length - 1) await delay(6000);
    }

    // done
    globalThis._wh_job.running = false;
    globalThis._wh_job.finishedAt = Date.now();
    broadcaster.broadcast({ type: "job_done", results });
  })();

  // Return accepted immediately
  return NextResponse.json({ accepted: true, total: numbers.length });
}
