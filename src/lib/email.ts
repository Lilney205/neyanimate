import nodemailer from "nodemailer";

export type SendEmailOptions = {
  to: string;
  resetUrl: string;
};

export type EmailDeliveryResult = {
  delivered: boolean;
  reason?: "SMTP_NOT_CONFIGURED" | "SEND_FAILED" | "SUCCESS";
  error?: string;
};

export function isEmailConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  return Boolean(host && port && user && pass);
}

/**
 * Sends a password reset email using configured SMTP settings.
 * If credentials are not configured, does not simulate delivery or throw,
 * but safely logs the missing configuration and returns delivered: false.
 * Never logs credentials or recovery tokens in production.
 */
export async function sendPasswordResetEmail({ to, resetUrl }: SendEmailOptions): Promise<EmailDeliveryResult> {
  const host = process.env.SMTP_HOST?.trim();
  const portStr = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "noreply@neyanimate.com";

  if (!host || !portStr || !user || !pass) {
    console.warn(
      "[EmailService] Password reset requested, but SMTP credentials are not configured. " +
      "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in production environment.",
    );
    return { delivered: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const port = parseInt(portStr, 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #060b16; color: #f8fafc; padding: 24px;">
  <div style="max-width: 540px; margin: 0 auto; background: #0c162c; border: 1px solid #1e293b; border-radius: 16px; padding: 32px;">
    <h2 style="color: #38bdf8; margin-top: 0;">NEY ANIMATE</h2>
    <h3 style="color: #ffffff; font-size: 20px;">Reset your password</h3>
    <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
      We received a request to reset the password for your NEY ANIMATE account. Click the button below to choose a new password:
    </p>
    <div style="margin: 28px 0;">
      <a href="${resetUrl}" style="background-color: #38bdf8; color: #020817; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 9999px; display: inline-block;">
        Reset Password
      </a>
    </div>
    <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
      This link is valid for 15 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from,
      to,
      subject: "Reset your NEY ANIMATE password",
      text: `Reset your NEY ANIMATE password by visiting this link (valid for 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html,
    });

    return { delivered: true, reason: "SUCCESS" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[EmailService] Failed to deliver password reset email:", message);
    return { delivered: false, reason: "SEND_FAILED", error: message };
  }
}
