# Internal identity configuration

AI Office permits only invited internal members after account creation. Passwords are delegated to Better Auth and persisted only through its account model; the application never stores a plaintext password.

## Local configuration

- `APP_ORIGIN=http://localhost:3000`
- `API_ORIGIN=http://localhost:3001`
- Google redirect: `http://localhost:3001/api/auth/callback/google`
- GitHub callback: `http://localhost:3001/api/auth/callback/github`
- Use an HTTPS tunnel for provider testing when the provider refuses a localhost callback.

## Production checklist

- Set a unique, high-entropy `BETTER_AUTH_SECRET` in the secret manager, never in source control.
- Set `APP_ORIGIN` and `API_ORIGIN` to their exact HTTPS public origins; do not use wildcard CORS.
- Register the same provider callback paths above under the production API origin.
- Add masked `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` only in deployment secrets.
- Verify each provider returns a verified email before account linking; link only Google and GitHub identities trusted by the configured adapter.
- Send workspace invitations only from owner/admin accounts, and validate acceptance against the invited email.
