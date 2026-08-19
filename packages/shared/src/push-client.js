/**
 * Browser-side Web Push plumbing, shared by both apps.
 *
 * Kept out of index.js on purpose: that file is imported by the API server too,
 * and none of this exists in Node. Import it by path — `@shared/push-client`.
 *
 * What the two apps do with a subscription differs (one is staff, one is a
 * diner), so this stops at handing back the browser's subscription object.
 */

/** VAPID keys travel as base64url text; the subscribe call wants raw bytes. */
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = window.atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Whether this browser can do push at all.
 *
 * False on iOS Safari until the site has been added to the Home Screen, which is
 * Apple's rule rather than a bug — `serviceWorker` is present but `PushManager`
 * is not, so this is also how the app knows to explain that rather than offer a
 * button that cannot work.
 */
export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** True on an iPhone or iPad that is not running the app from the Home Screen. */
export function needsHomeScreenInstall() {
  if (typeof window === 'undefined' || pushSupported()) return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  return ios && !installed;
}

export function permissionState() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;             // 'default' | 'granted' | 'denied'
}

let registration = null;

/** Registers the push service worker once per page load. */
export async function ensureServiceWorker() {
  if (!pushSupported()) return null;
  if (registration) return registration;
  registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registration;
}

/** The subscription this browser already holds, if any. */
export async function currentSubscription() {
  const reg = await ensureServiceWorker();
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Asks permission if it has not been given, then subscribes.
 *
 * Throws with a readable message rather than returning null, so callers have
 * something to show. A denial is permanent until the user changes it in browser
 * settings — there is no way to ask twice.
 */
export async function subscribeBrowser(publicKey) {
  if (!pushSupported()) throw new Error('This browser cannot show notifications');
  if (!publicKey) throw new Error('Notifications are not configured on the server');

  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
  }
  if (permission !== 'granted') throw new Error('Notifications were not allowed');

  const reg = await ensureServiceWorker();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return reg.pushManager.subscribe({
    // Required by every browser: a push message must always be shown to the user.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

export async function unsubscribeBrowser() {
  const sub = await currentSubscription();
  if (!sub) return null;
  const { endpoint } = sub;
  await sub.unsubscribe();
  return endpoint;
}
