import "server-only";

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

export type OAuthProvider = "google" | "apple" | "discord";

type ProviderConfig = {
  clientId: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
};

type ProviderProfile = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
};

type OAuthTokenResponse = {
  access_token?: string;
  id_token?: string;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value || /^(replace-with|your-|change-me|example)/i.test(value)) return undefined;
  return value;
}

export function getOAuthProviderConfig(provider: OAuthProvider): ProviderConfig | null {
  if (provider === "google") {
    const clientId = env("GOOGLE_CLIENT_ID");
    const clientSecret = env("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
    };
  }

  if (provider === "discord") {
    const clientId = env("DISCORD_CLIENT_ID");
    const clientSecret = env("DISCORD_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: "https://discord.com/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
    };
  }

  const clientId = env("APPLE_CLIENT_ID");
  if (!clientId || !env("APPLE_TEAM_ID") || !env("APPLE_KEY_ID") || !env("APPLE_PRIVATE_KEY")) return null;
  return {
    clientId,
    authorizeUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
  };
}

export function isTwilioVerifyConfigured() {
  return Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_VERIFY_SERVICE_SID"));
}

export function createOAuthClientSecret(clientId: string, now = Math.floor(Date.now() / 1000)) {
  const teamId = env("APPLE_TEAM_ID");
  const keyId = env("APPLE_KEY_ID");
  const privateKeyPem = env("APPLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!teamId || !keyId || !privateKeyPem) throw new Error("Apple sign-in is not configured.");

  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({
    iss: teamId,
    iat: now,
    exp: now + 5 * 60,
    aud: "https://appleid.apple.com",
    sub: clientId,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${signature.toString("base64url")}`;
}

function oauthEndpoints(provider: OAuthProvider) {
  if (provider === "google") {
    return {
      token: "https://oauth2.googleapis.com/token",
      profile: "https://openidconnect.googleapis.com/v1/userinfo",
    };
  }
  if (provider === "discord") {
    return {
      token: "https://discord.com/api/oauth2/token",
      profile: "https://discord.com/api/users/@me",
    };
  }
  return { token: "https://appleid.apple.com/auth/token", profile: "" };
}

export function createOAuthAuthorizationUrl(
  provider: OAuthProvider,
  callbackUrl: string,
  state: string,
  nonce: string,
  codeChallenge?: string,
) {
  const config = getOAuthProviderConfig(provider);
  if (!config) throw new Error("This sign-in provider is not configured.");

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (codeChallenge && provider !== "apple") {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  if (provider === "google") {
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("prompt", "select_account");
  } else if (provider === "discord") {
    url.searchParams.set("scope", "identify email");
  } else {
    url.searchParams.set("scope", "name email");
    url.searchParams.set("response_mode", "form_post");
    url.searchParams.set("nonce", nonce);
  }
  return url;
}

async function exchangeCode(provider: OAuthProvider, code: string, callbackUrl: string, codeVerifier?: string) {
  const config = getOAuthProviderConfig(provider);
  if (!config) throw new Error("This sign-in provider is not configured.");
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: callbackUrl,
  });

  if (provider === "apple") body.set("client_secret", createOAuthClientSecret(config.clientId));
  else if (config.clientSecret) body.set("client_secret", config.clientSecret);
  if (codeVerifier && provider !== "apple") body.set("code_verifier", codeVerifier);

  const response = await fetch(oauthEndpoints(provider).token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("OAuth authorization code exchange failed.");
  return await response.json() as OAuthTokenResponse;
}

type AppleJwk = { kid?: string; kty?: string; crv?: string } & Record<string, string | undefined>;
let appleJwksCache: { keys: AppleJwk[]; expiresAt: number } | undefined;
type GoogleJwk = { kid?: string; kty?: string } & Record<string, string | undefined>;
let googleJwksCache: { keys: GoogleJwk[]; expiresAt: number } | undefined;

async function verifyGoogleIdentityToken(token: string, clientId: string, expectedNonce: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Google identity token.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid Google identity token header.");

  if (!googleJwksCache || googleJwksCache.expiresAt <= Date.now()) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not retrieve Google public keys.");
    const result = await response.json() as { keys?: GoogleJwk[] };
    if (!Array.isArray(result.keys)) throw new Error("Invalid Google public key response.");
    googleJwksCache = { keys: result.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  }

  const jwk = googleJwksCache.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Google signing key was not found.");
  const publicKey = createPublicKey({ key: jwk as unknown as import("node:crypto").JsonWebKey, format: "jwk" });
  const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (!verify("RSA-SHA256", signedContent, publicKey, Buffer.from(parts[2], "base64url"))) {
    throw new Error("Google identity token signature is invalid.");
  }

  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string | string[];
    sub?: string;
    azp?: string;
    exp?: number;
    iat?: number;
    nonce?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  const audienceMatches = typeof claims.aud === "string" ? claims.aud === clientId : claims.aud?.includes(clientId);
  const now = Math.floor(Date.now() / 1000);
  if (
    (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") ||
    !audienceMatches || (Array.isArray(claims.aud) && claims.azp !== clientId) ||
    !claims.sub || !claims.exp || claims.exp <= now || !claims.iat || claims.iat > now + 60 ||
    claims.nonce !== expectedNonce || !claims.email || claims.email_verified !== true
  ) {
    throw new Error("Google identity token claims are invalid.");
  }
  return {
    id: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: true,
    name: claims.name?.trim().slice(0, 100) || claims.email.split("@")[0],
  };
}

async function verifyAppleIdentityToken(token: string, clientId: string, expectedNonce: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid Apple identity token.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "ES256" || !header.kid) throw new Error("Invalid Apple identity token header.");

  if (!appleJwksCache || appleJwksCache.expiresAt <= Date.now()) {
    const response = await fetch("https://appleid.apple.com/auth/keys", {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not retrieve Apple public keys.");
    const result = await response.json() as { keys?: AppleJwk[] };
    if (!Array.isArray(result.keys)) throw new Error("Invalid Apple public key response.");
    appleJwksCache = { keys: result.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  }

  const jwk = appleJwksCache.keys.find((key) => key.kid === header.kid && key.kty === "EC" && key.crv === "P-256");
  if (!jwk) throw new Error("Apple signing key was not found.");
  const publicKey = createPublicKey({ key: jwk as unknown as import("node:crypto").JsonWebKey, format: "jwk" });
  const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`);
  const validSignature = verify("sha256", signedContent, { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"));
  if (!validSignature) throw new Error("Apple identity token signature is invalid.");

  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string | string[];
    azp?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    nonce?: string;
    email?: string;
    email_verified?: string | boolean;
  };
  const audienceMatches = typeof claims.aud === "string" ? claims.aud === clientId : claims.aud?.includes(clientId);
  const now = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== "https://appleid.apple.com" || !audienceMatches ||
    (Array.isArray(claims.aud) && claims.azp !== clientId) || !claims.sub ||
    !claims.exp || claims.exp <= now || !claims.iat || claims.iat > now + 60 ||
    claims.nonce !== expectedNonce
  ) {
    throw new Error("Apple identity token claims are invalid.");
  }
  return {
    id: claims.sub,
    email: claims.email?.trim().toLowerCase() || null,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
  };
}

async function getProviderProfile(
  provider: OAuthProvider,
  token: OAuthTokenResponse,
  expectedNonce: string,
  appleName?: string,
): Promise<ProviderProfile> {
  if (provider === "apple") {
    const config = getOAuthProviderConfig(provider);
    if (!config || !token.id_token) throw new Error("Apple did not return an identity token.");
    const claims = await verifyAppleIdentityToken(token.id_token, config.clientId, expectedNonce);
    let name = appleName?.trim();
    if (name) name = name.slice(0, 100);
    return {
      ...claims,
      name: name || claims.email?.split("@")[0] || "Apple user",
    };
  }

  if (provider === "google") {
    const config = getOAuthProviderConfig(provider);
    if (!config || !token.id_token) throw new Error("Google did not return an identity token.");
    return await verifyGoogleIdentityToken(token.id_token, config.clientId, expectedNonce);
  }

  if (!token.access_token) throw new Error("OAuth provider did not return an access token.");
  const response = await fetch(oauthEndpoints(provider).profile, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not retrieve OAuth profile.");

  const profile = await response.json() as {
    id?: string;
    email?: string;
    verified?: boolean;
    global_name?: string;
    username?: string;
  };
  if (!profile.id || !profile.email || profile.verified !== true) {
    throw new Error("Discord did not return a verified email address.");
  }
  return {
    id: profile.id,
    email: profile.email.toLowerCase(),
    emailVerified: true,
    name: profile.global_name?.trim().slice(0, 100) || profile.username?.trim().slice(0, 100) || profile.email.split("@")[0],
  };
}

export async function signInWithOAuth(
  provider: OAuthProvider,
  code: string,
  callbackUrl: string,
  nonce: string,
  appleName?: string,
  codeVerifier?: string,
) {
  if (!/^[\x21-\x7e]{1,2048}$/.test(code)) throw new Error("Invalid authorization code.");
  const tokens = await exchangeCode(provider, code, callbackUrl, codeVerifier);
  const profile = await getProviderProfile(provider, tokens, nonce, appleName);
  if (profile.email && !profile.emailVerified) throw new Error("Provider email is not verified.");

  const whereIdentity = { provider_providerAccountId: { provider, providerAccountId: profile.id } };
  let user = await prisma.user.findFirst({ where: { authIdentities: { some: { provider, providerAccountId: profile.id } } } });
  if (user && user.status !== "ACTIVE") throw new Error("This account is unavailable.");

  if (!user) {
    const matchingEmail = profile.email
      ? await prisma.user.findUnique({ where: { email: profile.email } })
      : null;
    if (matchingEmail?.status === "DISABLED") throw new Error("This account is unavailable.");

    try {
      user = await prisma.$transaction(async (tx) => {
        const accountUser = matchingEmail
          ? await tx.user.update({
              where: { id: matchingEmail.id },
              data: { emailVerifiedAt: matchingEmail.emailVerifiedAt ?? new Date() },
            })
          : await tx.user.create({
              data: {
                email: profile.email,
                emailVerifiedAt: profile.email ? new Date() : null,
                name: profile.name || profile.email?.split("@")[0] || `${provider} user`,
                role: "VIEWER",
                status: "ACTIVE",
              },
            });
        await tx.authIdentity.create({
          data: { provider, providerAccountId: profile.id, userId: accountUser.id },
        });
        await tx.auditLog.create({
          data: {
            actorId: accountUser.id,
            action: matchingEmail ? "user.identity_linked" : "user.registered_oauth",
            resourceType: "User",
            resourceId: accountUser.id,
            metadata: { provider },
          },
        });
        return accountUser;
      });
    } catch {
      // Handle a repeated callback or simultaneous first sign-in without exposing database details.
      const linkedIdentity = await prisma.authIdentity.findUnique({
        where: whereIdentity,
        include: { user: true },
      });
      if (!linkedIdentity || linkedIdentity.user.status !== "ACTIVE") throw new Error("Could not create the account.");
      user = linkedIdentity.user;
    }
  }

  await createSession(user.id);
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "user.login_oauth",
      resourceType: "User",
      resourceId: user.id,
      metadata: { provider },
    },
  }).catch(() => null);

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function newOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function newOAuthCodeVerifier() {
  return randomBytes(32).toString("base64url");
}

export function createOAuthCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
