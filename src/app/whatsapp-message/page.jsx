"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";

export default function HomePage() {
  const [qr, setQr] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [results, setResults] = useState([]);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [isClientReady, setIsClientReady] = useState(false);
  const intervalRef = useRef(null);

  const fetchQr = async () => {
    try {
      const res = await fetch("/api/whatsapp");
      const data = await res.json();

      if (data.qr) {
        setQr(data.qr);
        setStatusMsg("📷 Scan QR Code to connect your WhatsApp");
        setIsClientReady(false);
      } else if (
        data.message?.includes("connected") ||
        data.message === "Already Initialized"
      ) {
        setIsClientReady(true);
        setQr(null);
        setStatusMsg("✅ WhatsApp is connected. Ready to send messages.");
        if (intervalRef.current) clearInterval(intervalRef.current); // stop polling
      } else {
        setQr(null);
        setIsClientReady(false);
        setStatusMsg(data.message || "⌛ Waiting for QR...");
      }
    } catch (error) {
      console.error("Failed to fetch QR:", error);
      setStatusMsg("❌ Error fetching QR. Please refresh.");
    }
  };

  useEffect(() => {
    fetchQr();
    intervalRef.current = setInterval(fetchQr, 5000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const uploadCsv = (e) => {
    const file = e.target.files[0];
    if (!file || !file.name.endsWith(".csv")) {
      setStatusMsg("⚠️ Please upload a valid .csv file.");
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          setStatusMsg("⚠️ CSV is empty or invalid.");
          return;
        }
        setCsvData(results.data);
        setStatusMsg(`✅ ${results.data.length} contacts loaded.`);
      },
      error: () => setStatusMsg("❌ Failed to parse CSV."),
    });
  };

  const sendMessages = async () => {
    if (!csvData.length) {
      alert("Please upload a CSV first.");
      return;
    }

    setSending(true);
    setStatusMsg("🚀 Sending messages...");
    setResults([]);

    const numbers = csvData.map((r) => r.Phone);
    const messages = csvData.map((r) => r.Message || `Hi ${r.Name}, welcome!`);

    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers, messages }),
      });

      const result = await res.json();
      setStatusMsg(result.status || "✅ Messages processed.");
      if (Array.isArray(result.results)) {
        setResults(result.results);
      }
    } catch (error) {
      console.error("Error sending messages:", error);
      setStatusMsg("❌ Failed to send messages.");
    }

    setSending(false);
  };

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-green-600">
          WhatsApp Bulk Sender
        </h1>

        <p className="mb-4 text-sm text-gray-600 text-center">
          Upload CSV with columns: <b>Phone</b>, <b>Name</b>,{" "}
          <b>Message (optional)</b>
        </p>

        {/* QR code */}
        {!isClientReady && qr && (
          <div className="flex flex-col items-center mb-4">
            <img src={qr} alt="QR Code" className="w-48 h-48" />
            <p className="text-sm text-gray-700 mt-2">
              Scan this QR using your WhatsApp
            </p>
          </div>
        )}

        {/* Loading state */}
        {!isClientReady && !qr && (
          <div className="text-center my-4 text-yellow-600">
            <p className="text-sm animate-pulse">
              🕐 Waiting for WhatsApp to be ready...
            </p>
          </div>
        )}

        {/* File upload */}
        <input
          type="file"
          accept=".csv"
          onChange={uploadCsv}
          className="mb-4 w-full border border-gray-300 p-2 rounded"
        />

        {/* Send Button */}
        <button
          onClick={sendMessages}
          disabled={sending || !isClientReady}
          className={`w-full py-2 rounded text-white transition ${
            sending || !isClientReady
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {sending ? "Sending..." : "Send Messages"}
        </button>

        {/* Status Message */}
        {statusMsg && (
          <p className="mt-4 text-center text-sm text-gray-800">{statusMsg}</p>
        )}

        {/* CSV Preview */}
        {csvData.length > 0 && (
          <div className="mt-6 max-h-64 overflow-y-auto border-t pt-4">
            <h2 className="text-lg font-semibold mb-2">CSV Preview:</h2>
            <ul className="text-sm text-gray-700 space-y-1">
              {csvData.map((row, i) => (
                <li key={i}>
                  {row.Phone} - {row.Message || `Hi ${row.Name}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Delivery Report */}
        {results.length > 0 && (
          <div className="mt-6 max-h-64 overflow-y-auto border-t pt-4">
            <h2 className="text-lg font-semibold mb-2">Delivery Report:</h2>
            <ul className="text-sm space-y-1">
              {results.map((res, i) => (
                <li
                  key={i}
                  className={
                    res.status === "failed"
                      ? "text-red-600"
                      : "text-green-700"
                  }
                >
                  {res.chatId} — {res.status}{" "}
                  {res.error && `(${res.error})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
