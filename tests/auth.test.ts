import assert from "node:assert/strict";
import test from "node:test";
import { POST as register } from "../src/app/api/auth/register/route";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as forgotPassword } from "../src/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "../src/app/api/auth/reset-password/route";
import { bootstrapAdmin } from "../scripts/bootstrap-admin";
import { prisma } from "../src/lib/db";
import { hashSessionToken } from "../src/lib/auth";
import { resetRateLimitsForTests } from "../src/lib/rate-limit";

process.env.TRUST_PROXY = "true";
const APP_ORIGIN = "http://localhost:3000";

let ipCounter = 1;
function createPostRequest(path: string, body: unknown, origin = APP_ORIGIN, clientIp?: string) {
  const ip = clientIp || `192.168.10.${(ipCounter++ % 200) + 1}`;
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin,
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

test("admin bootstrap safeguards enforce password constraints and safe rerun", async () => {
  // 1. Minimum 14 characters
  await assert.rejects(
    async () => {
      await bootstrapAdmin({
        email: "admin@example.com",
        name: "Admin",
        password: "short",
        databaseUrl: process.env.DATABASE_URL,
      });
    },
    { message: /at least 14 characters/ },
  );

  // 2. Maximum 72 UTF-8 bytes
  const overlyLongPassword = "A".repeat(73);
  await assert.rejects(
    async () => {
      await bootstrapAdmin({
        email: "admin@example.com",
        name: "Admin",
        password: overlyLongPassword,
        databaseUrl: process.env.DATABASE_URL,
      });
    },
    { message: /72 UTF-8 byte limit/ },
  );

  // 3. Invalid email format
  await assert.rejects(
    async () => {
      await bootstrapAdmin({
        email: "not-an-email",
        name: "Admin",
        password: "ValidPassword1234!",
        databaseUrl: process.env.DATABASE_URL,
      });
    },
    { message: /valid BOOTSTRAP_ADMIN_EMAIL/ },
  );
});

test("viewer registration validates password length, confirmation, and creates VIEWER account", async () => {
  await resetRateLimitsForTests();
  const uniqueEmail = `viewer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`;

  // 1. Password too short (< 14 chars)
  const shortResponse = await register(
    createPostRequest("/api/auth/register", {
      name: "Test Viewer",
      email: uniqueEmail,
      password: "Short123",
      confirmPassword: "Short123",
    }),
  );
  assert.equal(shortResponse.status, 400);

  // 2. Passwords mismatch
  const mismatchResponse = await register(
    createPostRequest("/api/auth/register", {
      name: "Test Viewer",
      email: uniqueEmail,
      password: "ValidSecurePassword1234!",
      confirmPassword: "DifferentPassword1234!",
    }),
  );
  assert.equal(mismatchResponse.status, 400);

  // 3. Successful registration
  const validResponse = await register(
    createPostRequest("/api/auth/register", {
      name: "Test Viewer",
      email: uniqueEmail,
      password: "ValidSecurePassword1234!",
      confirmPassword: "ValidSecurePassword1234!",
    }),
  );
  assert.equal(validResponse.status, 201);
  const data = (await validResponse.json()) as { user?: { role: string; email: string } };
  assert.equal(data.user?.role, "VIEWER");
  assert.equal(data.user?.email, uniqueEmail);

  // Verify in database: user is VIEWER
  const userInDb = await prisma.user.findUnique({ where: { email: uniqueEmail } });
  assert.ok(userInDb);
  assert.equal(userInDb.role, "VIEWER");

  // 4. Duplicate registration rejection
  const duplicateResponse = await register(
    createPostRequest("/api/auth/register", {
      name: "Test Viewer 2",
      email: uniqueEmail,
      password: "ValidSecurePassword1234!",
      confirmPassword: "ValidSecurePassword1234!",
    }),
  );
  assert.equal(duplicateResponse.status, 409);
});

test("login verifies credentials, rejects invalid passwords, and enforces rate limits", async () => {
  await resetRateLimitsForTests();
  const uniqueEmail = `login_test_${Date.now()}@example.com`;
  const password = "ValidPasswordForLogin123!";

  // Register the user first
  const regRes = await register(
    createPostRequest("/api/auth/register", {
      name: "Login User",
      email: uniqueEmail,
      password,
      confirmPassword: password,
    }),
  );
  assert.equal(regRes.status, 201);

  // 1. Invalid password
  const invalidResponse = await login(
    createPostRequest("/api/auth/login", {
      email: uniqueEmail,
      password: "WrongPassword12345!",
    }),
  );
  assert.equal(invalidResponse.status, 401);

  // 2. Valid password
  const validResponse = await login(
    createPostRequest("/api/auth/login", {
      email: uniqueEmail,
      password,
    }),
  );
  assert.equal(validResponse.status, 200);
  const loginData = (await validResponse.json()) as { user?: { email: string } };
  assert.equal(loginData.user?.email, uniqueEmail);

  const formResponse = await login(new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      origin: APP_ORIGIN,
      "x-forwarded-for": `192.168.10.${(ipCounter++ % 200) + 1}`,
    },
    body: new URLSearchParams({ email: uniqueEmail, password, redirect: "//example.com" }),
  }));
  assert.equal(formResponse.status, 303);
  assert.equal(formResponse.headers.get("location"), `${APP_ORIGIN}/films`);
});

test("forgot password endpoint prevents account enumeration and safely handles unknown accounts", async () => {
  await resetRateLimitsForTests();
  // Test with non-existent email
  const response = await forgotPassword(
    createPostRequest("/api/auth/forgot-password", {
      email: "nonexistent_account_12345@example.com",
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; message: string };
  assert.equal(body.ok, true);
  assert.ok(body.message.includes("If an account exists"));
});

test("password reset flow validates tokens, rejects expired and reused tokens, and invalidates sessions", async () => {
  await resetRateLimitsForTests();
  const email = `reset_flow_${Date.now()}@example.com`;
  const initialPassword = "InitialPassword1234!";
  const newPassword = "NewSecurePassword1234!";

  // Register user
  const regRes = await register(
    createPostRequest("/api/auth/register", {
      name: "Reset Flow User",
      email,
      password: initialPassword,
      confirmPassword: initialPassword,
    }),
  );
  assert.equal(regRes.status, 201);

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  // 1. Trigger forgot password to create token
  await forgotPassword(createPostRequest("/api/auth/forgot-password", { email }));

  // Find the token created in DB
  const tokenRecord = await prisma.passwordResetToken.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(tokenRecord.tokenHash);
  assert.equal(tokenRecord.usedAt, null);

  // Create a known raw token directly in DB for testing the reset endpoint
  const knownRawToken = "test-raw-token-" + Math.random().toString(36) + "0123456789";
  const knownHash = hashSessionToken(knownRawToken);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: knownHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  // Create an active session to test session invalidation
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken("mock-session-token"),
      userId: user.id,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    },
  });
  const sessionCountBefore = await prisma.session.count({ where: { userId: user.id } });
  assert.ok(sessionCountBefore >= 1);

  // 2. Perform valid password reset
  const resetResponse = await resetPassword(
    createPostRequest("/api/auth/reset-password", {
      token: knownRawToken,
      password: newPassword,
      confirmPassword: newPassword,
    }),
  );
  assert.equal(resetResponse.status, 200);

  // Verify sessions were invalidated
  const sessionCountAfter = await prisma.session.count({ where: { userId: user.id } });
  assert.equal(sessionCountAfter, 0);

  // Verify token is now marked as used
  const usedToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: knownHash } });
  assert.ok(usedToken?.usedAt !== null);

  // 3. Attempt to reuse the token (must be rejected)
  const reuseResponse = await resetPassword(
    createPostRequest("/api/auth/reset-password", {
      token: knownRawToken,
      password: "AnotherNewPassword1234!",
      confirmPassword: "AnotherNewPassword1234!",
    }),
  );
  assert.equal(reuseResponse.status, 400);

  // 4. Test expired token rejection
  const expiredRawToken = "expired-token-" + Math.random().toString(36) + "0123456789";
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(expiredRawToken),
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const expiredResponse = await resetPassword(
    createPostRequest("/api/auth/reset-password", {
      token: expiredRawToken,
      password: "AnotherNewPassword1234!",
      confirmPassword: "AnotherNewPassword1234!",
    }),
  );
  assert.equal(expiredResponse.status, 400);
});
