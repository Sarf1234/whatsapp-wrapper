import { NextResponse } from 'next/server';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';

let client = globalThis.client || null;
let qrCodeImage = null;

if (!client) {
  client = new Client({ authStrategy: new LocalAuth() });

  client.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    console.log('QR Generated');
  });

  client.on('ready', () => {
    console.log('WhatsApp ready ✅');
  });

  client.on('auth_failure', msg => {
    console.error('Auth failure ⚠️:', msg);
  });

  client.on('disconnected', reason => {
    console.log('Client disconnected 🛑:', reason);
  });

  client.initialize();
  globalThis.client = client;  // Save globally
}

// GET → Return QR Code or Status
export async function GET() {
  if (qrCodeImage) {
    return NextResponse.json({ qr: qrCodeImage });
  } else if (client && client.info && client.info.wid) {
    return NextResponse.json({ qr: null, message: "Already Initialized" });
  } else {
    return NextResponse.json({ qr: null, message: "Waiting for QR..." });
  }
}

// POST → Send Messages
export async function POST(req) {
  const { numbers, messages } = await req.json();

  if (!client || !client.info || !client.info.wid) {
    return NextResponse.json({ error: 'Client not ready' }, { status: 500 });
  }

  numbers.forEach((num, idx) => {
    // Sanitize number
    let cleanNum = num.toString().replace(/[^0-9]/g, '');

    // Add country code if needed (e.g., if number length is 10)
    if (cleanNum.length === 10) {
      cleanNum = '91' + cleanNum; // Default to India code
    }

    const chatId = cleanNum + '@c.us';

    setTimeout(() => {
      client.sendMessage(chatId, messages[idx]);
    }, idx * 2000);
  });

  return NextResponse.json({ status: 'Messages Sent' });
}

