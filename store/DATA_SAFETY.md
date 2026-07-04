# Play Console Data Safety form — answers

Reference for whoever fills in the Play Console "Data safety" section for
Ducks in a Row. Answer literally as written below; update this file first if
a future feature changes the truthful answer, then re-submit the form.

## Does your app collect or share any of the required user data types?

**No.**

The app collects, transmits, or shares **zero** user data with the developer
or any third party. All app data (accounts, transactions, budgets, income,
carryover history, Duck System progress, app-lock PIN hash, notification
preferences) is stored **only** in local, on-device storage
(SQLite + OS-encrypted secure storage for the PIN hash). There is no
backend, no analytics SDK, no crash-reporting SDK, and no advertising SDK in
the app.

Walk through the form's categories as follows:

| Data category | Collected? | Shared? | Notes |
|---|---|---|---|
| Location | No | No | Never requested. |
| Personal info (name, email, address, etc.) | No | No | No account/sign-in exists. |
| Financial info (transactions, account balances) | No* | No | *Entered and stored **only** on-device; never transmitted anywhere. |
| Health & fitness | No | No | N/A. |
| Messages | No | No | N/A. |
| Photos/videos | No | No | N/A — no receipt photo feature in this release. |
| Audio | No | No | N/A. |
| Files/docs | No | No | Backup export/import touches a file the *user* creates/picks locally; the app itself doesn't collect it. |
| Calendar | No | No | N/A. |
| Contacts | No | No | N/A. |
| App activity (in-app actions, search history) | No | No | Not transmitted; nothing leaves the device. |
| App info & performance (crash logs, diagnostics) | No | No | No crash-reporting/analytics SDK is included. |
| Device or other IDs | No | No | Not collected. |

## Is all user data encrypted in transit?

**N/A — the app makes no network requests carrying user data.** There is no
"in transit" for personal data because nothing is transmitted.

## Does your app provide a way for users to request data deletion?

**Yes, trivially: uninstalling the app deletes all local data.** There is no
server-side copy to separately delete. The app also lets users delete
individual transactions/accounts/categories and clear the whole database
locally at any time (Settings).

## Is data collection required or optional?

**Fully optional / not applicable**, since no data is collected. The
optional on-device features (app lock, notifications, backup) are each
opt-in and off by default; none of them transmit data externally.

## Security practices to declare

- Data is encrypted at rest where the OS provides it (app-lock PIN hash is
  stored via Android Keystore–backed secure storage).
- No data is transmitted, so "data is encrypted in transit" and "you can
  request data be deleted" are answered as above (N/A / trivially yes via
  uninstall).
- The app has **not** been independently security-reviewed by a third
  party (note honestly if the form asks).

## Target audience / content rating notes

- Not designed for or targeted at children.
- No user-generated content is shared with other users (single-user, local
  app — there is no social feature).

## One-line summary for the store listing footer

> "Ducks in a Row collects no personal data. Everything you enter stays on
> your device."
