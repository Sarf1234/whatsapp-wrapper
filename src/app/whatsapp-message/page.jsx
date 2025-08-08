"use client";

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";

export default function WhatsAppPage() {
  const [status, setStatus] = useState("initializing");
  const [qr, setQr] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState([]);
  const [useWs, setUseWs] = useState(false);

  const esRef = useRef(null);
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const qrPollRef = useRef(null);

  // ✅ Poll for QR/status only when needed
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const r = await fetch("/api/whatsapp");
        const d = await r.json();
        setStatus(d.status || "initializing");
        setQr(d.qr || null);

        if (d.status === "ready" && qrPollRef.current) {
          clearInterval(qrPollRef.current);
          qrPollRef.current = null;
          console.log("✅ QR polling stopped (connected)");
        }

        if (
          (d.status === "initializing" || d.status === "qr") &&
          !qrPollRef.current
        ) {
          qrPollRef.current = setInterval(fetchStatus, 3000);
          console.log("🔄 QR polling restarted");
        }
      } catch (e) {
        setStatus("error");
      }
    };

    fetchStatus();
    qrPollRef.current = setInterval(fetchStatus, 3000);

    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, []);

  // Start SSE (preferred) or WebSocket
  useEffect(() => {
    try {
      const es = new EventSource("/api/events");
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          handleEvent(data);
        } catch {}
      };
      es.addEventListener("status", (ev) => {
        try {
          const d = JSON.parse(ev.data);
          setStatus(d.status || status);
          if (d.qr) setQr(d.qr);

          // ✅ Stop QR polling if connected via SSE
          if (d.status === "ready" && qrPollRef.current) {
            clearInterval(qrPollRef.current);
            qrPollRef.current = null;
          }
        } catch {}
      });
      es.addEventListener("progress", (ev) => {
        try {
          const d = JSON.parse(ev.data);
          handleEvent({ type: "progress", payload: d });
        } catch {}
      });
      es.addEventListener("job_start", (ev) => {
        try {
          const d = JSON.parse(ev.data);
          handleEvent({ type: "job_start", payload: d });
        } catch {}
      });
      es.addEventListener("job_done", (ev) => {
        try {
          const d = JSON.parse(ev.data);
          handleEvent({ type: "job_done", payload: d });
        } catch {}
      });
      esRef.current = es;
      console.log("SSE connected");
    } catch (e) {
      console.warn("SSE not available, will fall back to polling");
      startPolling();
    }

    return () => {
      if (esRef.current) esRef.current.close();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEvent(event) {
    const { type, payload } = event;
    if (type === "progress") {
      setLogs((p) => {
        const copy = [...p];
        const idx = copy.findIndex((x) => x.index === payload.index);
        if (idx >= 0) copy[idx] = payload;
        else copy.push(payload);
        return copy.sort((a, b) => a.index - b.index);
      });
    } else if (type === "job_start") {
      setLogs([]);
    } else if (type === "job_done") {
      setSending(false);
      if (payload?.results) setLogs(payload.results);
    } else if (type === "status") {
      setStatus(payload?.status || status);
      if (payload?.qr) setQr(payload.qr);
    }
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/api/message-status");
        const d = await r.json();
        if (Array.isArray(d.results)) setLogs(d.results);
        if (!d.running) setSending(false);
      } catch (e) {}
    }, 2000);
  }
  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // CSV upload
  const onUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete(res) {
        setCsvRows(res.data || []);
      },
    });
  };

  // Start sending
  const startSend = async () => {
    if (!csvRows.length) return alert("Upload CSV first.");
    if (status !== "ready") return alert("Connect WhatsApp first.");
    setSending(true);
    setLogs([]);

    const numbers = csvRows.map(
      (r) => r.Phone || r.phone || r.Number || ""
    );
    const messages = csvRows.map(
      (r) =>
        r.Message || r.message || (r.Name ? `Hi ${r.Name}` : "")
    );

    const res = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numbers, messages }),
    });
    if (res.status !== 200 && res.status !== 202) {
      const err = await res.json().catch(() => ({}));
      alert(err?.error || "Failed to start job");
      setSending(false);
      return;
    }

    startPolling();
  };

  return (
    <main className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">WhatsApp Bulk Sender</h1>

        <div className="mb-4">
          <div className="text-sm text-gray-600">
            Connection status: <strong>{status}</strong>
          </div>
          {qr && (
            <img src={qr} alt="qr" className="w-48 h-48 my-3" />
          )}
        </div>

        <div className="mb-3">
          <input
            type="file"
            accept=".csv"
            onChange={onUpload}
            className="border p-2 rounded w-full"
          />
        </div>

        <div className="mb-3">
          <button
            onClick={startSend}
            disabled={sending || status !== "ready"}
            className={`w-full py-2 rounded ${
              sending || status !== "ready"
                ? "bg-gray-400"
                : "bg-green-600 text-white"
            }`}
          >
            {sending ? "Sending..." : "Start Sending (6s gap)"}
          </button>
        </div>

        <div className="mt-4">
          <h3 className="font-medium mb-2">Live Log</h3>
          <div className="max-h-72 overflow-y-auto border rounded p-2">
            {logs.length === 0 && (
              <div className="text-sm text-gray-500">
                No activity yet
              </div>
            )}
            {logs.map((l) => (
              <div
                key={l.index}
                className={`py-1 ${
                  l.status === "sent"
                    ? "text-green-700"
                    : l.status === "skipped"
                    ? "text-yellow-700"
                    : "text-red-700"
                }`}
              >
                {l.index + 1}. {l.chatId || l.rawNum} — {l.status}{" "}
                {l.reason ? `(${l.reason})` : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
