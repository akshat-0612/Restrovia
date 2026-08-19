import { useCallback, useEffect, useState } from 'react';
import {
  pushSupported, needsHomeScreenInstall, permissionState,
  currentSubscription, subscribeBrowser, unsubscribeBrowser,
} from '@shared/push-client';
import { api } from '../lib/api';
import { useToast } from './toast-context';

/**
 * Turns browser notifications on for this device.
 *
 * Per-device rather than per-account, because that is what a push subscription
 * is: saying yes on the counter tablet says nothing about the owner's phone.
 * Both can be subscribed, and both will be told.
 *
 * Renders nothing at all when the server has no VAPID keys configured — an
 * inert switch would be worse than no switch.
 */
export default function PushToggle() {
  const toast = useToast();
  const [available, setAvailable] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const supported = pushSupported();

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const { enabled } = await api.pushKey(controller.signal);
        if (!enabled) return;
        setAvailable(true);

        if (!supported || permissionState() !== 'granted') return;
        const sub = await currentSubscription();
        if (!sub) return;
        // The browser can hold a subscription this server has never heard of —
        // after a database reset, or a different account on the same machine.
        const { subscribed } = await api.pushStatus(sub.endpoint, controller.signal);
        setOn(subscribed);
      } catch { /* leave the switch off; polling still runs the board */ }
    })();

    return () => controller.abort();
  }, [supported]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const { publicKey } = await api.pushKey();
      const sub = await subscribeBrowser(publicKey);
      await api.pushSubscribe(sub.toJSON());
      setOn(true);
      toast.success('Notifications on for this device');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeBrowser();
      if (endpoint) await api.pushUnsubscribe(endpoint);
      setOn(false);
      toast.info('Notifications off for this device');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }, [toast]);

  if (!available) return null;

  if (!supported) {
    return (
      <span className="field-hint push-note">
        {needsHomeScreenInstall()
          ? 'Add this page to your Home Screen to get order notifications.'
          : 'This browser cannot show notifications.'}
      </span>
    );
  }

  if (permissionState() === 'denied') {
    return <span className="field-hint push-note">Notifications are blocked in your browser settings.</span>;
  }

  return (
    <button
      className={`btn btn-ghost ${on ? '' : 'muted'}`}
      disabled={busy}
      onClick={on ? disable : enable}
      title={on ? 'Stop notifying this device' : 'Get notified when an order comes in'}
    >
      {busy ? '…' : on ? '🔔 Notifications on' : '🔕 Notifications off'}
    </button>
  );
}
