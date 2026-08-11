# Product Brief — Open Generative AI Accounts & Billing

## Problem and audience
The current private Seedance Studio has one shared access token and no durable record of generations. The operator needs to offer it to registered users while controlling upstream generation costs.

## Desired user outcome
A user can register, sign in, see their credit balance and their own completed/failed generations. An administrator can control user credits and model prices.

## V1 scope
1. Email/password registration, login, logout, and role-gated administrator access.
2. Credit balance with per-model/per-duration pricing and atomic reservation/refund behavior.
3. Per-user task history with prompt, settings, status, cost, and playable result.
4. Admin dashboard for users, credit adjustments, model price settings, and task audit.
5. Durable Cloudflare storage: D1 for relational data and R2 for completed video copies.

## Primary journey
A new user registers with zero credits. An administrator grants credits; then the user chooses a video model and settings, and the app prices and reserves credits before submitting. The result is stored in their history. An administrator changes a price or adjusts balance from the admin dashboard.

## Acceptance criteria
- A user cannot view another user's task or media history.
- A task is only submitted when the account has enough credits; failed submissions refund a reservation.
- Completed video records are visible after a new login and have a durable R2-backed playback URL.
- Admin-only views can list users, adjust credits, and update model prices.
- Existing provider credentials remain server-side.

## Non-goals
Payment processing, subscriptions, social login, email verification/recovery, and migration of anonymous historical tasks.

## Constraints and assumptions
- Public email/password registration is enabled.
- Credits are an internal unit; no payment gateway in V1.
- New users receive a small default free-credit balance.
- The current Cloudflare account is authorized for creating/binding D1 and R2 resources.
- Existing media upload security remains intact; task history is a new account-scoped data path.

## Success signal
A non-admin user can complete a paid generation and replay it from history, while an admin can adjust that user’s balance and the next task price.
