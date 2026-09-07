// Hands composing an email or text, or placing a call, off to the device's
// own default app -- mailto:/sms:/tel: links, which every phone and desktop
// browser routes to the user's actual configured mail/messaging/phone app.
// This is the real mechanism (there is no browser API to "minimize the app
// and open the OS mail client" other than triggering these link schemes).

export function composeEmail(opts: { to?: string; bcc?: string[]; subject?: string; body?: string }) {
  const params = new URLSearchParams();
  if (opts.subject) params.set("subject", opts.subject);
  if (opts.body) params.set("body", opts.body);
  if (opts.bcc?.length) params.set("bcc", opts.bcc.join(","));
  const query = params.toString();
  const href = `mailto:${opts.to || ""}${query ? `?${query}` : ""}`;
  window.location.href = href;
}

export function composeSms(opts: { to?: string; body?: string }) {
  const to = (opts.to || "").replace(/[^\d+]/g, "");
  const body = opts.body ? `?body=${encodeURIComponent(opts.body)}` : "";
  window.location.href = `sms:${to}${body}`;
}

export function callNumber(phone: string) {
  const to = (phone || "").replace(/[^\d+]/g, "");
  if (!to) return;
  window.location.href = `tel:${to}`;
}
