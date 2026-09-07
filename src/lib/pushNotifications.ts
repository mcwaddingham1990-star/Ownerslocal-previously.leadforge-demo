import { doc, setDoc } from "firebase/firestore";
import { app, db } from "../firebase";

// True push notifications (delivered even when this tab/app is closed) need
// a VAPID key from the Firebase Console -> Project Settings -> Cloud
// Messaging -> Web Push certificates -> Generate key pair. Until
// FIREBASE_VAPID_KEY is set at build time, registerForPushNotifications()
// is a clean no-op -- the real-time in-app notification (App.tsx's Alert
// Center) already works fully without it.
const VAPID_KEY = process.env.FIREBASE_VAPID_KEY || "";

export function isPushConfigured(): boolean {
  return !!VAPID_KEY;
}

/**
 * Requests notification permission and registers this device's push token
 * against the signed-in user, so server-side pushes (server/pushNotifications.ts)
 * can reach them. Safe to call unconditionally on login -- every step is
 * guarded and this never throws or blocks the caller.
 */
export async function registerForPushNotifications(params: { email: string; businessId: string }): Promise<boolean> {
  if (!VAPID_KEY) return false;
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) return false;

  try {
    const { isSupported, getMessaging, getToken, onMessage } = await import("firebase/messaging");
    if (!(await isSupported())) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.register("/sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return false;

    await setDoc(doc(db, "push_subscriptions", `${params.email}__${token.slice(0, 24)}`), {
      email: params.email,
      businessId: params.businessId,
      token,
      userAgent: navigator.userAgent,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Background messages are handled by public/sw.js's onBackgroundMessage;
    // this covers the case where the tab is open and focused, where FCM
    // delivers to onMessage instead of the service worker.
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title;
      if (title && Notification.permission === "granted") {
        new Notification(title, {
          body: payload.notification?.body || payload.data?.body || "",
          icon: "/branding/icon-192.png",
        });
      }
    });

    return true;
  } catch (err) {
    console.warn("Push notification registration failed:", err);
    return false;
  }
}
