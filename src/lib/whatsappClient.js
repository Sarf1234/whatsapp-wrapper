import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';

let clientInstance = null;
let qrCodeImage = null;

export const getClient = () => {
  if (clientInstance) return { client: clientInstance, qrCodeImage };

  clientInstance = new Client({
    authStrategy: new LocalAuth({
      clientId: "my-wa-session", // important for saving session in a stable path
    }),
  });

  clientInstance.on('qr', async (qr) => {
    qrCodeImage = await qrcode.toDataURL(qr);
    console.log('📸 QR code generated');
  });

  clientInstance.on('ready', () => {
    console.log('✅ WhatsApp is ready!');
  });

  clientInstance.on('auth_failure', msg => {
    console.error('❌ Authentication failure:', msg);
  });

  clientInstance.on('disconnected', reason => {
    console.warn('⚠️ Disconnected:', reason);
  });

  clientInstance.initialize();

  return { client: clientInstance, qrCodeImage };
};
