/**
 * Shared Microsoft token encryption/decryption and refresh utilities.
 *
 * Uses AES-256-GCM via the Web Crypto API for token encryption at rest.
 * Each encrypted value includes a random 12-byte IV prepended to the
 * ciphertext, so identical plaintexts produce different ciphertexts.
 */

const SALT = new TextEncoder().encode('sourceco-outlook-token-encryption');

async function deriveKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  if (!secret) {
    throw new Error(
      'MICROSOFT_CLIENT_SECRET is required for token encryption — refusing to use fallback key',
    );
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a token using AES-256-GCM with a random 12-byte IV.
 * Output format: base64(iv || ciphertext || authTag)
 */
export async function encryptToken(token: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token),
  );
  // Prepend IV to ciphertext (GCM auth tag is appended by the API)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a token encrypted with encryptToken().
 * Supports both new AES-256-GCM format and legacy XOR format for migration.
 */
export async function decryptToken(encrypted: string): Promise<string> {
  const raw = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  // AES-GCM: IV (12 bytes) + ciphertext (>= 16 bytes for auth tag alone)
  if (raw.length >= 28) {
    try {
      const key = await deriveKey();
      const iv = raw.slice(0, 12);
      const ciphertext = raw.slice(12);
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return new TextDecoder().decode(plaintext);
    } catch {
      // Fall through to legacy XOR decryption for tokens encrypted before migration
    }
  }

  // Legacy XOR decryption (for tokens encrypted before AES-GCM migration)
  console.warn(
    'Legacy XOR decryption used — token will be re-encrypted with AES-GCM on next refresh',
  );
  const secret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  if (!secret) {
    throw new Error('MICROSOFT_CLIENT_SECRET is required for token decryption');
  }
  const keyBytes = new TextEncoder().encode(secret);
  const decrypted = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    decrypted[i] = raw[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}

/**
 * Refresh a Microsoft OAuth access token using a refresh token.
 * Returns the new access token, optionally rotated refresh token, and expiry.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; newRefreshToken: string; expiresIn: number } | null> {
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')!;
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
  const tenantId = Deno.env.get('MICROSOFT_TENANT_ID') || 'common';

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'Mail.Read Mail.ReadWrite Mail.Send User.Read offline_access',
    }).toString(),
  });

  if (!resp.ok) {
    console.error('Token refresh failed:', resp.status);
    return null;
  }

  const data = await resp.json();
  return {
    accessToken: data.access_token,
    newRefreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}
