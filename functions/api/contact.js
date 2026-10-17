/**
 * Cloudflare Pages Function — POST /api/contact
 *
 * Receives the booking form JSON from src/components/ContactForm.astro and
 * delivers it to support@roamsocial.in via Resend (https://resend.com).
 *
 * Setup (one time):
 *   1. Verify the roamsocial.in domain in the Resend dashboard (adds the
 *      DKIM/SPF DNS records Resend gives you).
 *   2. Create an API key and store it as an encrypted Pages secret:
 *        wrangler pages secret put RESEND_API_KEY
 *      (or: Cloudflare dashboard → Pages project → Settings → Variables).
 *   3. Optionally override the sender with a RESEND_FROM variable, e.g.
 *        RESEND_FROM="ROAM SOCIAL Website <no-reply@roamsocial.in>"
 *
 * Runs only on Cloudflare Pages (functions/ directory). Local `astro dev`
 * will 404 this route — use `npx wrangler pages dev dist` to test it, with
 * RESEND_API_KEY set in a local .dev.vars file (see .dev.vars.example).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FORM_TIME_MS = 1500;
const lastByIp = new Map();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function clean(value, max = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toBool(value) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Unsupported Media Type. Use application/json." }, 415);
  }

  // Anti-bot timing: the page must have been rendered at least ~1.5s ago
  const renderedAt = Number(request.headers.get("x-rendered-at") || 0);
  if (renderedAt > 0 && Date.now() - renderedAt < MIN_FORM_TIME_MS) {
    return json({ ok: false, error: "Form was submitted too quickly. Please try again." }, 400);
  }

  // Lightweight per-IP cooldown (per isolate; best-effort abuse control)
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  if (now - (lastByIp.get(ip) || 0) < 20000) {
    return json({ ok: false, error: "Please wait a few seconds before submitting another inquiry." }, 429);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON payload." }, 400);
  }

  // Honeypot: bots fill it, humans never see it. Pretend success.
  if (payload._gotcha && String(payload._gotcha).trim() !== "") {
    lastByIp.set(ip, now);
    return json({ ok: true, message: "Thanks! Your inquiry has been received." });
  }

  const name = clean(payload.name, 80);
  const email = clean(payload.email, 100);
  const phone = clean(payload.phone, 20);
  const eventDate = clean(payload.eventDate, 50);
  const eventType = clean(payload.eventType, 80);
  const guests = clean(payload.guests, 80);
  const message = clean(payload.message, 800);

  if (name.length < 2) return json({ ok: false, error: "Please enter your full name." }, 400);
  if (!EMAIL_REGEX.test(email)) return json({ ok: false, error: "Please provide a valid email address." }, 400);
  if (phone.length < 7) return json({ ok: false, error: "Please provide a phone or WhatsApp number." }, 400);

  // Consent is mandatory: the checkbox must have been ticked server-side too.
  if (!toBool(payload.consent)) {
    return json(
      { ok: false, error: "Please agree to the Privacy Policy & Terms and Conditions before sending your enquiry." },
      400,
    );
  }
  const consent = toBool(payload.consent);

  const subject = `ROAM SOCIAL Booking Inquiry — ${name} (${eventType || "General"})`;
  const textBody = [
    "Hello ROAM SOCIAL Team,",
    "",
    "You have received a new inquiry from the roamsocial.in contact form:",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone / WhatsApp: ${phone}`,
    `Event Date: ${eventDate || "To be decided"}`,
    `Event Type: ${eventType || "Not specified"}`,
    `Estimated Guests: ${guests || "Not specified"}`,
    `Privacy Policy & T&C Consent: ${consent ? "YES" : "NO"}`,
    "",
    "Cocktail Wishlist & Notes:",
    message || "(No notes provided.)",
    "",
    "---",
    `Submitted: ${new Date().toISOString()}`,
    `Origin IP: ${ip}`,
  ].join("\n");

  const htmlBody = `
    <table cellpadding="0" cellspacing="0" border="0" style="font-family: Inter, Helvetica, Arial, sans-serif; max-width: 600px; color: #1a1a1a;">
      <tr><td style="padding: 24px 0 12px; font-size: 22px; font-weight: 600;">New ROAM SOCIAL Inquiry</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Name:</strong> ${escapeHtml(name)}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Email:</strong> ${escapeHtml(email)}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Phone / WhatsApp:</strong> ${escapeHtml(phone)}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Event Date:</strong> ${escapeHtml(eventDate || "To be decided")}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Event Type:</strong> ${escapeHtml(eventType || "Not specified")}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Estimated Guests:</strong> ${escapeHtml(guests || "Not specified")}</td></tr>
      <tr><td style="padding: 6px 0;"><strong>Privacy Policy &amp; T&amp;C Consent:</strong> ${consent ? "YES" : "NO"}</td></tr>
      <tr><td style="padding: 14px 0 6px;"><strong>Cocktail Wishlist &amp; Notes:</strong></td></tr>
      <tr><td style="padding: 6px 0; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(message || "(No notes provided.)")}</td></tr>
      <tr><td style="padding: 24px 0 0; font-size: 12px; color: #888;">Submitted ${new Date().toISOString()} from ${escapeHtml(ip)}</td></tr>
    </table>
  `;

  const apiKey = env && env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured.");
    return json(
      { ok: false, error: "Email service is not configured yet. Please email support@roamsocial.in directly." },
      500,
    );
  }

  const from = (env && env.RESEND_FROM) || "ROAM SOCIAL Website <no-reply@roamsocial.in>";
  const to = (env && env.CONTACT_TO) || "support@roamsocial.in";

  const mailPayload = {
    from,
    to: [to],
    reply_to: `${name} <${email}>`,
    subject,
    text: textBody,
    html: htmlBody,
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mailPayload),
    });

    if (!res.ok) {
      console.error("Resend error:", res.status, await res.text());
      return json(
        { ok: false, error: "We could not deliver your message right now. Please email support@roamsocial.in directly." },
        502,
      );
    }

    lastByIp.set(ip, now);
    return json({
      ok: true,
      message: "Thank you! Your inquiry has been delivered to support@roamsocial.in. We will review availability and send our customized bar deck shortly.",
    });
  } catch (err) {
    console.error("Resend request failed:", err);
    return json(
      { ok: false, error: "We could not deliver your message right now. Please email support@roamsocial.in directly." },
      502,
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://roamsocial.in",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Rendered-At",
      "Access-Control-Max-Age": "86400",
    },
  });
}
