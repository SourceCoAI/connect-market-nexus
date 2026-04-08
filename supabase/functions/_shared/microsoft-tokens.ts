/**
 * Shared Microsoft token encryption/decryption and refresh utilities.
 *
 * Used across all outlook-* edge functions to avoid duplicating crypto logic.
 * In production, replace XOR encryption with Supabase Vault or a proper KMS.
 */

function getEncryptionKey(): string {
  const key = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  if (!key) {
    throw new Error('MICROSOFT_CLIENT_SECRET is required for token encryption — refusing to use fallback key');
  }
  return key;
}

/**
 * Encrypt a token using XOR with the Microsoft client secret as key.
 * This is a baseline implementation — use Supabase Vault or AES-256 in production.
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const encoded = new TextEncoder().encode(token);
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) {
    encrypted[i] = encoded[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...encrypted));
}

/**
 * Decrypt a token encrypted with encryptToken().
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const decoded = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const decrypted = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    decrypted[i] = decoded[i] ^ keyBytes[i % keyBytes.length];
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

  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'Mail.Read Mail.ReadWrite Mail.Send User.Read offline_access',
      }).toString(),
    },
  );

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
