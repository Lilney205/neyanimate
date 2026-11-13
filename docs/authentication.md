# Account sign-in and registration

The app keeps its existing email-and-password flow and adds Google, Apple, Discord, and SMS phone verification. All successful sign-ins create the app's regular seven-day, HttpOnly session. Google, Apple, and Discord use authorization-code callbacks handled on the server. Google and Discord authorization requests use state validation and PKCE; Apple uses state, a one-time nonce, a signed client secret, and server-side identity-token signature and claim validation. Provider access tokens are used to read the profile and are not stored.

Phone sign-in uses Twilio Verify to send and check one-time SMS codes. Phone numbers must be entered in E.164 format, including `+` and the country code (for example, `+14155552671`). Twilio manages code expiration and delivery. The app applies its own per-IP and per-number rate limits as well. A verified phone number can create a viewer account without an email address. The name entered in the phone flow is used only when creating a new account.

## Configure environment variables

Copy the placeholders from `.env.example` into `.env` and replace them with credentials from each provider you want to enable. Do not put secrets in source code, commit `.env`, or paste provider keys into issues or chat. Keep the same values in your deployment's secret manager. Restart the app after changing `.env`.

Set `NEXT_PUBLIC_APP_URL` to the exact site origin. For local Google and Discord development, use `http://localhost:3000`. In production, use the canonical HTTPS origin, such as `https://neyanimate.example`.

### Google

1. Create a project and OAuth consent configuration in Google Cloud Console.
2. Create a **Web application** OAuth client.
3. Add this authorized redirect URI (replace the host with your exact `NEXT_PUBLIC_APP_URL`):

   `http://localhost:3000/api/auth/oauth/google/callback`

4. Put its client ID and client secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. The app requests `openid`, `email`, and `profile`. A Google email must be marked verified before it can be used for an account.

### Discord

1. Create an application in the Discord Developer Portal and open its OAuth2 settings.
2. Add this redirect URI (replace the host with your exact `NEXT_PUBLIC_APP_URL`):

   `http://localhost:3000/api/auth/oauth/discord/callback`

3. Put the application's client ID and client secret in `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
4. The app requests only `identify` and `email`. The Discord email must be verified.

### Apple

1. In the Apple Developer account, enable Sign in with Apple for a primary App ID.
2. Create and configure a **Services ID** for the website. Register and verify the site's domain, then add this exact return URL:

   `https://neyanimate.example/api/auth/oauth/apple/callback`

3. Create a Sign in with Apple private key. Set the Services ID as `APPLE_CLIENT_ID`, the team ID as `APPLE_TEAM_ID`, and the key ID as `APPLE_KEY_ID`.
4. Put the `.p8` key contents in `APPLE_PRIVATE_KEY`. For a single-line `.env` value, encode line breaks as `\n`. Never commit or share the key.
5. Apple web sign-in requires a registered HTTPS domain; `localhost` and IP addresses are not accepted. For local development, use a verified HTTPS development domain or tunnel configured in the Apple Services ID and set `NEXT_PUBLIC_APP_URL` to that HTTPS origin.
6. The callback uses Apple's `form_post` response mode because the app requests the user's name and email. The `ney_oauth_flow` cookie is restricted to that callback path and uses `SameSite=None; Secure` for this cross-site POST.

### Phone sign-in with Twilio Verify

1. Create a Twilio account and a **Verify Service**. Enable SMS for the countries where you expect users to register.
2. Set the account SID, auth token, and Verify Service SID in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`.
3. For a Twilio trial, verify recipient phone numbers in the Twilio console before testing. Trial restrictions can prevent delivery to unverified numbers.
4. The user requests a code, enters the received code, and is signed in only after Verify reports it as approved. Codes are checked server-to-server and never stored by the app.

## Database migration

The migration adds linked OAuth identities, makes email optional for phone-only users, and adds phone and email verification timestamps. Apply it to the configured development database and regenerate Prisma Client:

```powershell
npm run prisma:migrate
npm run prisma:generate
```

Review and apply the migration separately for production using the deployment's reviewed migration process; do not point local development commands at a production database.

## Account behavior

- The existing email-and-password registration remains available. Passwords continue to be bcrypt-hashed and must be at least 14 characters.
- Social sign-in creates viewer accounts. If a provider returns a verified email that already belongs to a local account, the provider identity is linked to that account. If no email is returned, the provider's stable account ID is used as the identity.
- Phone sign-in creates or finds an account by its verified phone number. It does not merge that account with another account by name or email.
- Existing OAuth identities continue to work if the provider stops returning the email after the first authorization. Apple may return a private relay address; use its stable subject ID as the identity.
- Social and phone accounts receive normal viewer permissions. They cannot become editors or administrators through registration.
- Email password recovery is available only for accounts with an email address and requires the existing SMTP configuration.
- OAuth and SMS buttons are disabled until their full provider configuration is present. If a provider is not configured, the email-and-password flow remains available.

## Create the initial administrator

Set `DATABASE_URL` to the intended database and fill in `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` in the local `.env` file. Use a password with at least 14 characters and no more than 72 UTF-8 bytes. The bootstrap command loads the local Next.js environment files, then creates the first active `ADMIN` account:

```powershell
npm.cmd run auth:bootstrap-admin
```

Verify the target database before running the command: it changes that database and refuses to run if an administrator already exists or the email is already in use. Do not use a production database for local testing. After successful creation, remove the bootstrap password from the environment, then sign in at `/login`; administrators can reach `/studio`.

## Manual smoke check

After applying the migration and configuring one provider, restart `npm run dev`, open `/register`, and test both a new account and a returning account. Confirm a successful sign-in lands on `/films`, the browser receives the `ney_session` HttpOnly cookie, and `/api/auth/me` returns the signed-in viewer. Repeat with `/login`. For phone, use a number permitted by the Twilio account, request one code, verify it, and confirm that an incorrect or expired code does not create a session. Review the provider console callback logs if a callback URI mismatch occurs.

Do not use real children's personal information while testing. This project still needs a separate privacy, consent, and jurisdiction review before launching any child-directed account features.
