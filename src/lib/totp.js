/**
 * TOTP (RFC 6238) — the six-digit codes Google Authenticator generates.
 *
 * In live mode Supabase handles all of this server-side. This module exists so
 * demo mode is the real thing too: it produces a genuine otpauth:// secret you
 * can scan with Google Authenticator, and validates the codes the app shows.
 * Nothing here is a stub.
 *
 * Uses Web Crypto's HMAC-SHA1, which needs a secure context — https or
 * localhost. That covers every deployment target in the README.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP = 30;
export const DIGITS = 6;

function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("That secret isn't valid base32.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 160-bit secret, the size Google Authenticator expects. */
export function randomSecret(bytes = 20) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return base32Encode(b);
}

async function hmac(secret, counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    "raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
}

/** The code for a given moment. Defaults to now. */
export async function codeAt(secret, atMs = Date.now()) {
  const sig = await hmac(secret, Math.floor(atMs / 1000 / STEP));
  const offset = sig[sig.length - 1] & 0x0f;
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    (sig[offset + 1] << 16) |
    (sig[offset + 2] << 8) |
    sig[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Accepts the current code plus one step either side, which absorbs the clock
 * drift between a phone and a laptop. Comparison is constant-time so a wrong
 * code leaks nothing about how wrong it was.
 */
export async function verifyCode(secret, token, window = 1) {
  const entered = String(token || "").replace(/\D/g, "");
  if (entered.length !== DIGITS) return false;
  let ok = false;
  for (let i = -window; i <= window; i++) {
    const expected = await codeAt(secret, Date.now() + i * STEP * 1000);
    let diff = 0;
    for (let j = 0; j < DIGITS; j++) diff |= expected.charCodeAt(j) ^ entered.charCodeAt(j);
    if (diff === 0) ok = true;
  }
  return ok;
}

/** The otpauth:// URI that goes into the QR code. */
export function otpauthURI({ secret, account, issuer = "CampusFind" }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Seconds until the current code rolls over. */
export function secondsLeft() {
  return STEP - (Math.floor(Date.now() / 1000) % STEP);
}

/** Secrets are shown in groups of four so they can be typed by hand. */
export function formatSecret(secret) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * SVG QR code, loaded on demand so it stays out of the main bundle.
 * The browser entry is imported by path: the package's default entry pulls in
 * Node's fs for PNG rendering, which bundlers shouldn't have to shake out.
 */
export async function qrSvg(uri) {
  const QR = await import("qrcode/lib/browser.js");
  const render = QR.toString || QR.default?.toString;
  return render(uri, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" });
}
