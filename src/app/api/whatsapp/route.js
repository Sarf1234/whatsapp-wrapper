import { NextResponse } from 'next/server';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';

let client = globalThis.client || null;
let qrCodeImage = null;
let clientStatus = 'initializing'; // Track current status

if (!client) {
  client = new Client({ authStrategy: new LocalAuth() });

  client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    clientStatus = 'qr';
    console.log('QR Generated');
  });

  client.on('ready', () => {
    clientStatus = 'ready';
    console.log('WhatsApp ready ✅');
  });

  client.on('auth_failure', msg => {
    clientStatus = 'auth_failure';
    console.error('Auth failure ⚠️:', msg);
  });

  client.on('disconnected', reason => {
    clientStatus = 'disconnected';
    console.log('Client disconnected 🛑:', reason);
  });

  client.initialize();
  globalThis.client = client;
}

// ============================
// @desc GET: Return QR code or connection status
// ============================
export async function GET() {
  switch (clientStatus) {
    case 'qr':
      return NextResponse.json({ qr: qrCodeImage, message: 'Scan the QR code' });
    case 'ready':
      return NextResponse.json({ qr: null, message: 'WhatsApp is connected ✅' });
    case 'auth_failure':
      return NextResponse.json({ qr: null, message: 'Authentication failed ❌' });
    case 'disconnected':
      return NextResponse.json({ qr: null, message: 'Client disconnected. Please restart.' });
    default:
      return NextResponse.json({ qr: null, message: 'Initializing...' });
  }
}

// ============================
// @desc POST: Send bulk messages
// ============================
export async function POST(req) {
  const { numbers, messages } = await req.json();

  // Check if client is ready
  if (!client || !client.info || !client.info.wid) {
    return NextResponse.json({ error: 'WhatsApp client not connected yet.' }, { status: 500 });
  }

  // Validate inputs
  if (!Array.isArray(numbers) || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Invalid format: numbers & messages should be arrays.' }, { status: 400 });
  }

  if (numbers.length !== messages.length) {
    return NextResponse.json({ error: 'Mismatch: numbers and messages length must be same.' }, { status: 400 });
  }

  // Send messages with delay & error handling
  const sendWithDelay = (chatId, message, delay) =>
    new Promise((resolve) => {
      setTimeout(async () => {
        try {
          await client.sendMessage(chatId, message);
          resolve({ chatId, status: 'sent' });
        } catch (err) {
          resolve({ chatId, status: 'failed', error: err.message });
        }
      }, delay);
    });

  const results = await Promise.all(
    numbers.map((num, idx) => {
      let cleanNum = num.toString().replace(/[^0-9]/g, '');
      if (cleanNum.length === 10) cleanNum = '91' + cleanNum;
      const chatId = cleanNum + '@c.us';
      return sendWithDelay(chatId, messages[idx], idx * 2500); // 2.5s delay
    })
  );

  return NextResponse.json({ status: 'completed', results });
}
