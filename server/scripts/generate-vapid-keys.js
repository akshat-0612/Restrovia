/**
 * Generates the key pair the server signs push messages with.
 *
 * This is the whole of the setup. There is no service to register with, no
 * project to create and nothing to pay — VAPID is just a key pair you keep, and
 * the browser makers' push services accept it because the standard says to.
 *
 *   npm run push:keys -w server
 *
 * Put the output in server/.env. Changing the pair later invalidates every
 * existing subscription, so browsers would have to opt in again.
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to server/.env:

VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
VAPID_SUBJECT=mailto:you@your-domain.com

The public key is sent to browsers. Keep the private key secret — anyone holding
it can send notifications to everyone who has subscribed to you.
`);
