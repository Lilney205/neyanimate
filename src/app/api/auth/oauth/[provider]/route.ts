import { NextResponse } from "next/server";
import {
  createOAuthAuthorizationUrl,
  createOAuthCodeChallenge,
  getOAuthProviderConfig,
  newOAuthCodeVerifier,
  newOAuthState,
  type OAuthProvider,
} from "@/lib/oauth-auth";

const STATE_COOKIE = "ney_oauth_flow";
const STATE_TTL_SECONDS = 10 * 60;

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "apple" || value === "discord";
}

function getBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return new URL(configured || new URL(request.url).origin).origin;
}

function loginError(request: Request, error: string) {
  const url = new URL("/login", getBaseUrl(request));
  url.searchParams.set("authError", error);
  return NextResponse.redirect(url);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: value } = await context.params;
  if (!isOAuthProvider(value)) return loginError(request, "provider");
  if (!getOAuthProviderConfig(value)) return loginError(request, "setup");

  const state = newOAuthState();
  const nonce = newOAuthState();
  const codeVerifier = value === "apple" ? undefined : newOAuthCodeVerifier();
  const callbackUrl = `${getBaseUrl(request)}/api/auth/oauth/${value}/callback`;
  const challenge = codeVerifier ? createOAuthCodeChallenge(codeVerifier) : undefined;
  const authorizationUrl = createOAuthAuthorizationUrl(value, callbackUrl, state, nonce, challenge);
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, JSON.stringify({ provider: value, state, nonce, codeVerifier, createdAt: Date.now() }), {
    httpOnly: true,
    secure: value === "apple" || process.env.NODE_ENV === "production",
    sameSite: value === "apple" ? "none" : "lax",
    path: `/api/auth/oauth/${value}`,
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
