const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 8000;

const isMailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

const clientOrigin = () =>
  (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");

const buildResetUrl = (token) =>
  `${clientOrigin()}/reset-password?token=${encodeURIComponent(token)}`;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const resetText = (name, url) =>
  `Hi ${name},\n\n` +
  `Someone asked to reset the password for your ThumbCraft account.\n` +
  `Open this link to choose a new one:\n\n${url}\n\n` +
  `The link expires in 30 minutes and can only be used once.\n` +
  `If this wasn't you, nothing has changed and you can ignore this email.\n\n` +
  `ThumbCraft`;

const resetHtml = (name, url) => {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1f">
  <p>Hi ${safeName},</p>
  <p>Someone asked to reset the password for your ThumbCraft account.</p>
  <p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#1a1a1f;color:#ffffff;border-radius:8px;text-decoration:none">Choose a new password</a></p>
  <p style="color:#737380;font-size:13px">Or paste this into your browser:<br>${safeUrl}</p>
  <p style="color:#737380;font-size:13px">The link expires in 30 minutes and can only be used once. If this wasn't you, nothing has changed and you can ignore this email.</p>
  <p style="color:#737380;font-size:13px">ThumbCraft</p>
</div>`;
};

async function sendPasswordReset(to, name, token) {
  const url = buildResetUrl(token);

  if (!isMailConfigured()) {
    console.log(`Password reset link for ${to}: ${url}`);
    return;
  }

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject: "Reset your ThumbCraft password",
      text: resetText(name, url),
      html: resetHtml(name, url),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend responded ${response.status} ${detail}`);
  }
}

module.exports = { isMailConfigured, buildResetUrl, sendPasswordReset };
