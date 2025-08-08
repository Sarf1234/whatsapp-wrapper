// app/api/message-status/route.js
export async function GET() {
  const state = globalThis._wh_job || { running: false, total: 0, finishedAt: null };
  // We do not keep full results here (they are broadcasted) — but store them on global for easy read
  const results = globalThis._wh_results || [];
  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return new Response(JSON.stringify({
    running: !!state.running,
    total: state.total,
    sent, failed, skipped, results
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}
