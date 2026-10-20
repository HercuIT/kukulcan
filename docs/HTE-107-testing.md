# HTE-107 Testing Documentation

## Issue
"User to confirm email when registered; also improve registration form." New accounts must open an emailed link before they can sign in, and registration moves from a second button on the login box to its own `/register` form with validation. Spec: [HTE-107: Email confirmation and registration form](https://claude.ai/code/artifact/6b732d1e-e3b8-461c-8c72-2d61864a50d0).

Decisions taken here: UI strings are in English (the spec drafted them in Spanish; the repo now supports English only), and the spec's open questions use its defaults: email and password only, any email domain, "already registered" is not revealed, English email, 24-hour links.

## Automated tests

| Area (file) | Positive | Negative | Edge |
| --- | --- | --- | --- |
| Profiles trigger (`supabase/tests/hte_107.test.mjs`, PGlite) | Unconfirmed sign-up has no profile until confirmed, then one with no roles; an account inserted already confirmed gets its profile on insert; once confirmed it can be added as a designer | `authenticated`/`anon` can't call the trigger functions (`42501`); an unconfirmed email passed to `add_designer` gives `P0002`; unconfirmed users aren't readable in `profiles`; the migration guard refuses to run when a user is unconfirmed and has no profile | Confirming again keeps one profile and its roles; a profile that already exists causes no error or duplicate; updating other columns doesn't create a profile |
| Password and email rules (`src/constants/passwordRules.test.js`) | `Planta2026` passes; emails are trimmed and lowercased | Missing digit, missing letter, 7 characters; empty, `ana@`, no TLD, spaces | 72 accepted / 73 rejected; non-ASCII letters don't count (as in Supabase); 254-character email limit; null/undefined |
| Register (`src/pages/Register/Register.test.js`) | Valid form → one `signUp` with the lowercased email → "Check your email" naming it; checklist ticks each rule; Enter submits; Resend after 60 s, "Use a different email" goes back; show/hide toggle | Empty / `ana@` email (error under the field, `aria-describedby`, focus, no request); `abcdefgh`, `1234567`; mismatch; errors on blur and cleared on fix; `rate-limited` / network errors keep the email; Supabase `weak-password` lands on the password field | 72/73-character passwords; double click sends one request and shows "Creating account…"; an already registered address gets the same screen |
| Confirm page (`src/pages/AuthConfirm/AuthConfirm.test.js`) | Valid link → `confirmEmail(token_hash)` once → "Email confirmed"; StrictMode doesn't spend the token twice; Resend from the expired screen | Expired/used link → expired message + way back to sign in; missing or garbage `token_hash` → no Supabase call; network error → Retry works; invalid email not sent; rate-limited resend | Resend disabled for 60 s; `readConfirmLink` accepts `email`/`signup`, rejects other types, short and over-long hashes |
| Login (`src/pages/Login/Login.test.js`) | Link to `/register` instead of a Register button; sign in; Enter submits; unconfirmed account → message + Resend (sent to the normalized email) | Wrong password → "incorrect" message, no Resend; generic failure; rate-limited resend | Empty fields; Resend disabled 60 s then enabled; dev shortcut |
| Auth API and errors (`src/backend/authApi.test.js`) | `signUp` sends `emailRedirectTo = <origin>/auth/confirm`; `resendConfirmation` (type `signup`); `confirmEmail` (`verifyOtp`, type `email`) | `email_not_confirmed` → `email-not-confirmed`, `over_email_send_rate_limit` → `rate-limited`, `otp_expired` → `link-expired` | — |
| Routing (`src/App.test.js`) | Signed out: `/register` → Register, `/auth/confirm` → Confirm; a link that fell back to the Site URL (`/?token_hash=…&type=email`) is forwarded to `/auth/confirm` with its parameters | Signed out, any other path → Login | Signed in at `/auth/confirm` → Home (the link already did its job); signed in at `/register` → Home; other query strings on `/` still show Login |
| Set password (`src/pages/SetPassword/SetPassword.test.js`) | Saves a valid password | Letters-only or digits-only rejected without calling Supabase; Supabase `weak-password` shown | Minimum is now 8: 7 rejected, exactly 8 accepted |
| Cooldown (`src/hooks/useCooldown.test.js`) | Counts down 60 → 0 | Nothing counts without `start()` | Restart mid-countdown; custom length |

## Rollout checklist (live project)

`supabase/config.toml` only configures the local stack; the live project is set by hand. Do these in order and tick them off:

- [ ] Custom SMTP set up and a test email received (the built-in sender only reaches team members).
- [ ] Redirect URLs: `https://kukulcan.ramirezgjennyg.workers.dev/auth/confirm` added (keep `/set-password`); Site URL is the production URL. No preview wildcards.
- [ ] Email Templates → Confirm signup: `supabase/templates/confirmation.html` pasted (its link uses `{{ .RedirectTo }}`), subject "Confirm your Kukulcan account".
- [ ] Preflight, read-only: `select count(*) from auth.users u where email_confirmed_at is null and not exists (select 1 from public.profiles p where p.id = u.id);` returns 0 (it did on 2026-10-20). If not, the migration's guard stops the deploy.
- [ ] PR merged; `deploy_supabase.yaml` applied `hte_107_profile_on_confirm`.
- [ ] Only then: Confirm email on, email OTP expiration 86400 s, minimum password length 8, password requirements "letters and digits".
- [ ] TC-10 passed with a throwaway account, which was then deleted.

Why the migration goes before Confirm email: until it runs, the old trigger creates a profile at sign-up for every account, so accounts that register in that window would get a profile while still unconfirmed and show up in the share dialog early. (Confirmed accounts never miss a profile in either order.)

Rollback: turn Confirm email off. Accounts created meanwhile stay unconfirmed until they open their link.

## Test Cases (manual, local stack with Inbucket, then production)

### TC-01: Register and confirm
**Steps:**
1. `npx supabase start` (confirmations on via `config.toml`), `npm start`.
2. Open `/`, click "Create account", enter a new email, `Planta2026` twice, submit.
3. Open Inbucket (`http://localhost:54324`), open the email, click "Confirm my email".

**Expected:** "Check your email" names the address; no session before the link. The link opens `/auth/confirm`, the account is confirmed and Home opens signed in.

### TC-02: Link on another device
**Steps:**
1. Register; open the email link in a different browser.

**Expected:** Same result in that browser.

### TC-03: Sign in before confirming (negative)
**Steps:**
1. Register but don't open the link. Sign in with the right password.

**Expected:** "Confirm your email before signing in." and a Resend button; with a wrong password, the usual "Incorrect email or password".

### TC-04: Resend
**Steps:**
1. On "Check your email" (or the login Resend), click Resend; click again immediately.

**Expected:** A new email arrives; the button counts down 60 s and ignores clicks meanwhile. Only the newest link works.

### TC-05: Expired or reused link (negative)
**Steps:**
1. Open a confirmation link twice; open one older than 24 h; open `/auth/confirm` with no parameters.

**Expected:** "The link has expired or was already used…" with an email field and Resend (or Home if already signed in).

### TC-06: Form validation (negative and edge)
**Steps:**
1. On `/register`, try an empty email, `ana@`, `abcdefgh`, `1234567`, mismatched confirmation, and a 73-character password; then double-click submit with valid data.

**Expected:** Each error appears under its field, the first invalid field gets focus, no request is sent; the double click sends one request and the button reads "Creating account…".

### TC-07: Already registered address (edge)
**Steps:**
1. Register with an email that already has a confirmed account.

**Expected:** The same "Check your email" screen; no email is sent; nothing reveals the account exists.

### TC-08: Existing users unaffected
**Steps:**
1. After release, sign in with an existing (and an imported) account.

**Expected:** Sign-in works as before; no email needed. `/set-password` still works for imported users (now requiring 8 characters with a letter and a digit).

### TC-09: Profiles
**Steps:**
1. With an unconfirmed account pending, open a workflow's Share dialog as a designer and try to add that email.

**Expected:** The unconfirmed user isn't listed and can't be added ("not found"); after they confirm, they can.

### TC-10: Production rollout
**Steps:**
1. Follow README → "Sign-up and email confirmation" (SMTP, redirect URL, template, merge, Confirm email on), then register a test account end to end and delete it.

**Expected:** The email arrives from the custom sender and the link signs the user in on production.

## Result
Automated: lint, Prettier, typecheck, Jest (245 tests) and `npm run test:node` (138) pass; `npm run build` compiles. Manual TC-01 to TC-10: pending (TC-10 after the live-project settings in README → "Sign-up and email confirmation").
