import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getOAuthProviderConfig,
  signInWithOAuth,
  type OAuthProvider,
} from "@/lib/oauth-auth";

const STATE_COOKIE = "ney_oauth_flow";
const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthFlowCookie = {
  provider: OAuthProvider;
  state: string;
  nonce: string;
  codeVerifier?: string;
  createdAt: number;
};

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "apple" || value === "discord";
}

function getBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return new URL(configured || new URL(request.url).origin).origin;
}

function redirectToLogin(request: Request, provider: string, error: string) {
  const response = NextResponse.redirect(new URL(`/login?authError=${encodeURIComponent(error)}`, getBaseUrl(request)));
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: provider === "apple" || process.env.NODE_ENV === "production",
    sameSite: provider === "apple" ? "none" : "lax",
    path: `/api/auth/oauth/${provider}`,
    maxAge: 0,
  });
  return response;
}

function parseAppleName(raw: string | null) {
  if (!raw || raw.length > 2048) return undefined;
  try {
    const value = JSON.parse(raw) as { name?: { firstName?: unknown; lastName?: unknown } };
    const first = typeof value.name?.firstName === "string" ? value.name.firstName.trim() : "";
    const last = typeof value.name?.lastName === "string" ? value.name.lastName.trim() : "";
    return `${first} ${last}`.trim().slice(0, 100) || undefined;
  } catch {
    return undefined;
  }
}

async function completeCallback(
  request: Request,
  providerName: string,
  values: URLSearchParams,
) {
  if (!isOAuthProvider(providerName)) return redirectToLogin(request, "unknown", "provider");

  const cookieStore = await cookies();
  const rawFlow = cookieStore.get(STATE_COOKIE)?.value;
  let flow: OAuthFlowCookie | undefined;
  try {
    flow = rawFlow ? JSON.parse(rawFlow) as OAuthFlowCookie : undefined;
  } catch {
    flow = undefined;
  }

  const state = values.get("state");
  if (
    !flow || flow.provider !== providerName || !state || flow.state !== state ||
    !Number.isFinite(flow.createdAt) || Date.now() - flow.createdAt > STATE_TTL_MS
  ) {
    return redirectToLogin(request, providerName, "state");
  }

  if (values.has("error")) {
    return redirectToLogin(request, providerName, values.get("error") === "user_cancelled_authorize" ? "cancelled" : "provider");
  }
  if (!getOAuthProviderConfig(providerName)) return redirectToLogin(request, providerName, "setup");

  const code = values.get("code");
  if (!code) return redirectToLogin(request, providerName, "provider");

  try {
    const user = await signInWithOAuth(
      providerName,
      code,
      `${getBaseUrl(request)}/api/auth/oauth/${providerName}/callback`,
      flow.nonce,
      providerName === "apple" ? parseAppleName(values.get("user")) : undefined,
      flow.codeVerifier,
    );
    const destination = user.role === "ADMIN" ? "/studio" : "/films";
    const response = NextResponse.redirect(new URL(destination, getBaseUrl(request)));
    response.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      secure: providerName === "apple" || process.env.NODE_ENV === "production",
      sameSite: providerName === "apple" ? "none" : "lax",
      path: `/api/auth/oauth/${providerName}`,
      maxAge: 0,
    });
    return response;
  } catch {
    return redirectToLogin(request, providerName, "failed");
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  return completeCallback(request, provider, url.searchParams);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (provider !== "apple") return redirectToLogin(request, provider, "provider");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectToLogin(request, provider, "provider");
  }
  const values = new URLSearchParams();
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && ["state", "code", "error", "user"].includes(key)) values.set(key, value);
  }
  return completeCallback(request, provider, values);
}
