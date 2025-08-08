// app/api/events/route.js
import { NextResponse } from "next/server";
import { broadcaster } from "@/lib/broadcast";

export async function GET(req) {
  // In App Router, we don't get direct res object; but we can access Node response via NextResponse's stream replacement.
  // Simpler approach: return a streaming response using the underlying Node res — but App Router abstracts it.
  // Workaround: use unstable_streaming or use a simple long-polling endpoint if App Router serverless prevents SSE.
  // For most self-hosted Next servers this will work if you use `res` from Node. However, to keep compatibility,
  // I'll implement a minimal streaming response using the Web API ReadableStream so EventSource can work.

  // We will create a ReadableStream that never closes and push messages written by broadcaster:
  const encoder = new TextEncoder();

  let push;
  const stream = new ReadableStream({
    start(controller) {
      push = (str) => controller.enqueue(encoder.encode(str));
    },
    cancel() {
      // nothing
    },
  });

  // Save a temporary queue to receive broadcasts and push them into stream
  const onBroadcast = (event) => {
    const payload = JSON.stringify(event);
    push(`event: ${event.type || "message"}\n`);
    push(`data: ${payload}\n\n`);
  };

  // Hook broadcaster: we simply add a one-off listener by wrapping broadcast method (quick hack)
  const originalBroadcast = broadcaster.broadcast;
  broadcaster.broadcast = (ev) => {
    try { onBroadcast(ev); } catch (e) {}
    try { originalBroadcast(ev); } catch (e) {}
  };

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
