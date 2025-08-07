"use client";

import { useState, useEffect } from 'react';
import Papa from 'papaparse';

export default function HomePage() {
  const [qr, setQr] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [isClientReady, setIsClientReady] = useState(false);

  // Fetch QR on load (initial setup)
  const fetchQr = async () => {
    try {
      const res = await fetch('/api/whatsapp');
      const data = await res.json();
      if (data.qr) {
        setQr(data.qr);
        setStatusMsg("Scan QR Code to connect your WhatsApp");
      } else if (data.message === "Already Initialized") {
        setIsClientReady(true);
        setStatusMsg("WhatsApp already connected. Ready to send messages.");
      } else {
        setStatusMsg("Waiting for QR code. Try again shortly.");
      }
    } catch (error) {
      console.error("Failed to fetch QR:", error);
      setStatusMsg("Error fetching QR. Please refresh the page.");
    }
  };

  useEffect(() => {
    fetchQr();
  }, []);

  const uploadCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          setStatusMsg("CSV is empty or invalid.");
          return;
        }
        setCsvData(results.data);
        setStatusMsg(`${results.data.length} contacts loaded.`);
      },
      error: () => setStatusMsg("Failed to parse CSV.")
    });
  };

  const sendMessages = async () => {
    if (!csvData.length) {
      alert("Please upload a valid CSV first.");
      return;
    }

    setSending(true);
    setStatusMsg("Sending messages...");

    const numbers = csvData.map(r => r.Phone);
    const messages = csvData.map(r => r.Message || `Hi ${r.Name}, welcome!`);

    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers, messages })
      });

      const result = await res.json();
      setStatusMsg(result.status || "Messages sent.");
    } catch (error) {
      console.error("Error sending messages:", error);
      setStatusMsg("Failed to send messages.");
    }

    setSending(false);
  };

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-green-600">WhatsApp Bulk Sender</h1>

        <p className="mb-4 text-sm text-gray-600">Upload CSV with columns: <b>Phone</b>, <b>Name</b>, <b>Message (optional)</b></p>

        {!qr && (
          <button onClick={fetchQr} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded mb-4">
            Show QR Code
          </button>
        )}

        {qr && (
          <div className="flex flex-col items-center mb-4">
            <img src={qr} alt="QR Code" className="w-48 h-48" />
            <p className="text-sm text-gray-700 mt-2">Scan this QR using your WhatsApp</p>
          </div>
        )}

        <input type="file" accept=".csv" onChange={uploadCsv} className="mb-4 w-full" />

        <button onClick={sendMessages} disabled={sending || !qr} className={`w-full py-2 rounded text-white ${sending ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700'}`}>
          {sending ? 'Sending...' : 'Send Messages'}
        </button>

        {statusMsg && <p className="mt-4 text-center text-sm text-gray-800">{statusMsg}</p>}

        {csvData.length > 0 && (
          <div className="mt-6 max-h-64 overflow-y-auto border-t pt-4">
            <h2 className="text-lg font-semibold mb-2">Preview:</h2>
            <ul className="text-sm text-gray-700 space-y-1">
              {csvData.map((row, i) => (
                <li key={i}>{row.Phone} - {row.Message || `Hi ${row.Name}`}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}