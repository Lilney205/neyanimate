import "server-only";

function twilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

async function requestTwilioVerify(path: "Verifications" | "VerificationCheck", values: Record<string, string>) {
  const config = twilioConfig();
  if (!config) throw new Error("Phone verification is not configured.");

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const body = new URLSearchParams(values);
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.serviceSid)}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  return await response.json() as { status?: string };
}

export async function sendPhoneVerification(phone: string) {
  return requestTwilioVerify("Verifications", { To: phone, Channel: "sms" });
}

export async function checkPhoneVerification(phone: string, code: string) {
  return requestTwilioVerify("VerificationCheck", { To: phone, Code: code });
}
