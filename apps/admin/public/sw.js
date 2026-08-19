/**
 * Push service worker.
 *
 * Runs outside the page, which is the whole point: it receives and shows
 * notifications when the tab is in the background, or closed entirely. It holds
 * no app logic and no state — the server sends the finished text.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Update', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Update', {
      body: payload.body || '',
      // The restaurant's own logo when it has one; the browser's default when
      // not. No placeholder file to ship and keep in step.
      ...(payload.icon ? { icon: payload.icon } : {}),
      // Same tag replaces rather than stacks, so five updates to one order do
      // not leave five notifications to dismiss.
      tag: payload.tag || 'restrovia',
      renotify: true,
      data: { url: payload.url || '/' },
    })
  );
});

/** Focus a tab that is already open rather than piling up new ones. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.url.startsWith(self.location.origin) && 'focus' in tab) {
          tab.navigate?.(target);
          return tab.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
