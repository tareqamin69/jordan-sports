/**
 * Sends one test SMS through Releans to check the API key, the approved sender ID and the number
 * format before switching OTP_CHANNEL to releans:
 *   RELEANS_API_KEY=... RELEANS_SENDER_ID=Jorena node dist/cli/sms-test.js +9627XXXXXXXX
 */
import { BRAND_NAME } from '@jordan-sports/brand';
import { normalizePhone } from '../modules/identity/index.js';
import { ReleansClient } from '../platform/sms/releans.js';

const phone = normalizePhone(process.argv[2] ?? '');
const apiKey = process.env.RELEANS_API_KEY;
if (!phone || !apiKey) {
  console.error('Usage: RELEANS_API_KEY=... [RELEANS_SENDER_ID=Jorena] sms-test.js +9627XXXXXXXX');
  process.exit(2);
}
const client = new ReleansClient({
  apiKey,
  senderId: process.env.RELEANS_SENDER_ID ?? 'Jorena',
  baseUrl: process.env.RELEANS_BASE_URL ?? 'https://api.releans.com/v2',
});
try {
  await client.send(phone, `${BRAND_NAME.en}: test message / رسالة تجريبية`);
  console.log(`Accepted by the gateway for ${phone.slice(0, 5)}…. Check the phone received it.`);
} catch (error) {
  console.error(`Failed: ${String(error)}`);
  process.exit(1);
}
