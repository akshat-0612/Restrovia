import { useEffect, useState } from 'react';
import {
  pushSupported, needsHomeScreenInstall, permissionState, subscribeBrowser,
} from '@shared/push-client';
import { api } from '../lib/api';

/**
 * "Tell me when it's ready" — offered on the tracker, which is where a diner
 * lands the moment they order and exactly when the question is worth asking.
 *
 * Asking earlier would mean a permission prompt before anyone has decided to
 * order, which is the pattern browsers now penalise and diners refuse.
 *
 * Silent when the server has no push keys, when the browser cannot do it, or
 * once it is already on. The tracker keeps polling regardless, so this only ever
 * adds the ability to look away from the screen.
 */
export default function NotifyMe({ order }) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState('idle');       // idle | working | on | error
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.pushKey(controller.signal)
      .then(({ enabled }) => setAvailable(Boolean(enabled)))
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, []);

  if (!available) return null;

  if (!pushSupported()) {
    // Worth saying on an iPhone, where this is a fixable situation rather than
    // an unsupported browser. Silent everywhere else.
    return needsHomeScreenInstall() ? (
      <p className="notify-note">
        Add this page to your Home Screen to be notified when your order is ready.
      </p>
    ) : null;
  }

  if (state === 'on') {
    return <p className="notify-note on">🔔 We&apos;ll notify you when it&apos;s ready.</p>;
  }
  if (permissionState() === 'denied') return null;

  async function enable() {
    setState('working');
    setError(null);
    try {
      const { publicKey } = await api.pushKey();
      const subscription = await subscribeBrowser(publicKey);
      await api.pushSubscribe({
        subscription: subscription.toJSON(),
        orderNumber: order.orderNumber,
        // The same proof the tracker uses: what the order was placed with.
        token: order.customerPhone || order.customerName,
      });
      setState('on');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  }

  return (
    <div className="notify-row">
      <button className="btn-notify" onClick={enable} disabled={state === 'working'}>
        {state === 'working' ? 'Just a moment…' : '🔔 Notify me when it’s ready'}
      </button>
      {error && <p className="notify-error">{error}</p>}
    </div>
  );
}
