import webpush from 'web-push';
import { prisma } from './prisma.js';

/**
 * Web Push, the browser standard — deliberately not Firebase.
 *
 * A browser hands the page a subscription pointing at whichever push service it
 * uses (Google's for Chrome, Mozilla's for Firefox, Apple's for Safari). Sending
 * is a signed HTTP POST to that endpoint. The signature is made with a VAPID key
 * pair this server generates for itself, so there is no vendor project to create,
 * no SDK to embed and nothing to pay: the browser makers run these services free
 * as part of supporting the standard.
 *
 * Push is an extra, never a dependency. Both apps already poll, so an order still
 * appears on the board and a diner still sees "Ready" with notifications refused,
 * blocked, or unsupported — which matters, because on iPhones Safari only allows
 * push once a site has been added to the Home Screen.
 */

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

/**
 * Contact address for the push service, required by the VAPID spec so an
 * operator can reach whoever is sending. Any mailto: or https: URL you own.
 */
const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@restrovia.app';

export const pushEnabled = Boolean(publicKey && privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn(
    '[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set — notifications are off.\n' +
    '       Generate a pair with:  npm run push:keys -w server'
  );
}

export function vapidPublicKey() {
  return pushEnabled ? publicKey : null;
}

/**
 * Sends one notification, and forgets the subscription if the push service says
 * it is gone.
 *
 * 404 and 410 are the push services' way of reporting a browser that has been
 * uninstalled, cleared, or had permission revoked. Those rows would otherwise
 * accumulate for the life of the restaurant and be retried on every order.
 */
async function sendOne(row, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: row.id } }).catch(() => {});
    } else {
      console.error(`[push] send failed (${err.statusCode || err.code || 'unknown'}):`, err.message);
    }
    return false;
  }
}

/**
 * Fans a notification out to many browsers at once.
 *
 * Never rejects and is never awaited by a request handler: a diner's order must
 * not fail to be placed because a push service was slow, and the kitchen must not
 * wait on one either.
 */
export async function sendToAll(rows, payload) {
  if (!pushEnabled || rows.length === 0) return 0;
  const results = await Promise.all(rows.map((row) => sendOne(row, payload)));
  return results.filter(Boolean).length;
}
