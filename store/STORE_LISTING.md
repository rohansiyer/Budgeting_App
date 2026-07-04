# Google Play Store Listing — Ducks in a Row

## App title

**Ducks in a Row**

(30 character limit on Play — "Ducks in a Row" is 15, leaves room for a
short suffix later if needed, e.g. "Ducks in a Row: Budget & Envelopes"
would be 34 and too long; keep the bare title.)

## Short description (80 characters max)

> Envelope budgeting with a payoff: keep your ducks in a row, one month at a time.

(82 chars incl. the leading arrow markdown isn't part of the count — actual
string below is 81 characters, trim one word if Play's counter disagrees:)

**Play-ready version (≤80 chars):**
> Envelope budgeting with a payoff — keep your ducks in a row each month.

## Full description (4000 characters max)

```
Ducks in a Row is envelope budgeting with a reason to open the app every
day — and a reward for doing it right every month.

HOW IT WORKS
Every dollar gets a home. Set up your accounts, your income schedule, and
envelopes for the spending that varies (food, gas, fun) — the app tracks
what's safe to spend today, this week, and this month, with one big number
on the Home screen so you never have to do the math yourself.

Fixed bills (rent, subscriptions, insurance) are tracked separately from
day-to-day envelopes, so a variable week doesn't get confused with a bill
you already know is coming.

CARRYOVER, DONE HONESTLY
Money that's left in an envelope at the end of the week doesn't vanish —
roll it forward, sweep it to savings, or let it go, your call. Run short?
Borrow a little from next week's envelope (capped, so you can't dig a hole)
and pay it back automatically. Every dollar is accounted for; nothing is
ever invented or lost.

MEET YOUR DUCKS
At the end of each month, Ducks in a Row checks three things: did your
fixed bills get paid, did your variable spending stay in its envelopes, and
did you hit your savings goal? Do well and your flock grows — up to 12
ducks, with accessories to earn along the way. Have an off month and a duck
takes the week off. It's a small, honest way to feel your progress instead
of just reading a spreadsheet.

BUILT AROUND YOUR LIFE, NOT A TEMPLATE
Nothing is hardcoded. Add your own accounts, income sources (weekly,
biweekly, semi-monthly, or monthly — with splits across accounts), and
envelopes during setup. When life changes — new job, new city, new
paycheck — start a "new chapter": your history and your flock carry over,
and you re-run the wizard for the new normal.

PRIVATE BY DESIGN
Ducks in a Row works completely offline. There's no account to create, no
server, and nothing about your finances is ever collected, transmitted, or
sold — because there's no mechanism for any of that to happen. Your data
lives on your device. Back it up to a file whenever you want (your choice
where it goes), and lock the app with a PIN or your fingerprint/face if you
share your phone.

FEATURES
• One-glance "safe to spend" number, updated in real time
• Weekly envelope budgets with carryover, borrowing, and sweep-to-savings
• Fixed-bill tracking separate from variable spending
• Calendar heatmap of daily spending, with payday and bill markers
• The Pond: plan-vs-actual for the month, with early warnings before an
  envelope goes over
• The Duck System: a monthly report card that's actually fun to open
• Optional local reminders — bill due, envelope running low, payday
• Optional PIN/biometric app lock
• Full backup/restore to a file you control
• No ads. No accounts. No tracking. No internet connection required.
```

## Category & tags

- **Category:** Finance
- **Tags/keywords:** budget, envelope budgeting, personal finance, expense
  tracker, savings, offline budget app

## Content rating

- No user-generated content, no social features, no ads, no in-app
  purchases in this release. Expect "Everyone" once the rating
  questionnaire is completed in Play Console.

## Contact / support

- **Support email:** rohansiyer@gmail.com
- **Privacy policy URL:** host `PRIVACY_POLICY.md` (this directory) at a
  public URL before submitting — Play requires a live link, not a bundled
  file.

## Asset checklist (dimensions per Play's current requirements)

| Asset | Spec | Status |
|---|---|---|
| App icon | 512 × 512 px, 32-bit PNG, no alpha channel required by Play (but adaptive icon foreground *does* need transparency) | **TODO** — current `assets/icon.png` is the placeholder v1 icon; needs a midnight-theme redesign per §3 of the design doc before submission. |
| Adaptive icon (Android) | Foreground layer 512 × 512 px PNG with safe zone (inner 66%); background color or image | **TODO** — `assets/adaptive-icon.png` also needs the redesign; background should be the midnight palette, not white. |
| Feature graphic | 1024 × 500 px, JPG or 24-bit PNG (no alpha) | **TODO** — not yet created. This is the banner shown at the top of the store listing. |
| Phone screenshots | Min 2, max 8. Each: 16:9 or 9:16 aspect ratio, min dimension 320 px, max dimension 3840 px | **TODO** — capture from Home, Calendar, The Pond, and Results (duck evaluation) screens once the v2 redesign lands. |
| 7" tablet screenshots | Optional but recommended if `supportsTablet`/tablet layout is claimed | **Deferred** — app is phone-first; skip unless a tablet layout is validated. |
| 10" tablet screenshots | Optional | **Deferred**, same reasoning. |
| Promo video | Optional, YouTube URL | **Deferred** — nice-to-have, not a blocker. |
| Short description | ≤ 80 characters | **Done** — see above. |
| Full description | ≤ 4000 characters | **Done** — see above. |

## Release track plan

1. **Internal testing** — first signed AAB upload, small tester list
   (self + a couple of trusted testers), sanity-check the store listing
   renders correctly and the app installs/launches from Play.
2. **Closed testing** (optional) — wider group if you want feedback before
   going public.
3. **Production** — once Data Safety form + Privacy Policy URL + all
   required assets above are in place.

## Known blockers before submission (not this team's scope to fix, flagging for tracking)

- App icon / adaptive icon / feature graphic / screenshots all need the
  midnight visual redesign (§3 of the design doc) — currently placeholder
  assets from v1.
- Privacy policy needs to be hosted at a public URL (a Markdown file in the
  repo isn't sufficient for the Play Console form).
