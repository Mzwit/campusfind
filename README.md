# CampusFind

**Lost it. Found it. Bring campus together.**

A university lost-and-found service. Students report what they lost, return what
they found, and the system tries to put the two together.

React + Vite + Tailwind on the front, Supabase (Postgres, Auth, Storage) on the
back. The whole thing runs on free tiers.

---

## Run it in two minutes

```bash
npm install
npm run dev
```

That's it. With no environment variables the app runs in **demo mode**: seeded
data held in memory and an account stored in your browser. Nothing needs to be
set up, and this is the mode to use when showing the interface to someone.

Demo mode still uses **real two-step sign-in**. Create an account with any
`.ac` or `.edu` address, scan the QR code with Google Authenticator, and the
codes it shows are checked against a genuine RFC 6238 implementation
(`src/lib/totp.js`, verified against the published test vectors). Nothing about
the authentication is faked — only the storage is.

To make it persist, follow the next section.

---

## Deploying for free

Two accounts, no card, about twenty minutes.

### 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com). Pick a region near
   you; Frankfurt or Cape Town are the closest to Eswatini.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it. That
   creates every table, index, view, policy, the storage bucket and the
   archive functions.
3. Optional: run `supabase/seed.sql` afterwards to fill the app with sample
   reports. Sign in to the app once first so a profile row exists.
4. Under **Authentication → URL Configuration**, add your site URL once you
   have it from step 2 below, so confirmation and password-reset links come
   back to your app rather than to localhost.
5. Copy the project URL and the **anon** key from **Project Settings → API**.

Nothing else to configure: TOTP multi-factor is free and switched on for every
Supabase project by default.

### 2. Hosting — Vercel, Netlify or Cloudflare Pages

Push this folder to GitHub, then import the repo into whichever host you
prefer. All three detect Vite automatically; config files for the first two are
already included.

Set two environment variables in the host's dashboard:

```
VITE_SUPABASE_URL       = https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY  = eyJhbGciOi...
```

Deploy. The anon key is designed to be public — every table is protected by row
level security, so it grants nothing that the policies in `schema.sql` don't
allow.

A note on which host to pick: Vercel's Hobby plan is for non-commercial
projects, which a university assignment is. If CampusFind ever becomes a real
service the campus runs, Cloudflare Pages or Netlify have no such restriction.

### 3. Keep the free database awake

Supabase pauses free projects after **7 days with no requests**, and a paused
project is offline until someone restores it by hand. That is the failure mode
most likely to embarrass you during a demo.

`.github/workflows/maintenance.yml` handles it: every third day it pings the
database and clears out orphaned photos. Add two repository secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role |

The service role key bypasses every security policy. It belongs in GitHub
Secrets and nowhere else — never in a `VITE_` variable, which would ship it to
the browser.

### What free actually buys you

| | Free tier | What it means here |
| --- | --- | --- |
| Database | 500 MB | tens of thousands of reports, given the retention model below |
| File storage | 1 GB | roughly 4,000 photos at 250 KB |
| Bandwidth | 5 GB/month | fine for a single campus |
| Auth | 50,000 monthly users | more than any university has |
| Hosting | unlimited static requests | the frontend is 136 KB gzipped |

The 500 MB database limit is the one worth designing around, which is what the
next section is about.

---

## How deletion works

**A found item can be removed from the database, but the fact that it was found
never disappears.**

A live report is heavy: a description, several photos, a comment thread, claims,
match rows. Roughly 4 KB in the database plus 250 KB to 1 MB in storage. A
recovered report is dead weight — nobody searches for an item that is already
back with its owner — but deleting it outright would quietly corrupt the campus
statistics. Recovery rate is the number the university actually cares about, and
it would fall every time a successful case was cleaned up.

So a purge writes a **recovery record** and then deletes the report:

```
recovery_records
  original_item_id   which report this was
  type               lost or found
  category_id        electronics, keys, cards…
  location_id        Main Library, Cafeteria…
  reported_at        when it was filed
  resolved_at        when it came back
  outcome            recovered / returned / expired / removed
  days_open          how long it took
```

About 120 bytes against 4 KB, and no photos at all. What is kept is exactly what
analytics needs and nothing that identifies an item or a person beyond the
reporter link.

Everything attached to the report — images, comments, claims, matches, flags —
disappears through `ON DELETE CASCADE`. The photo files are removed from storage
before the row is deleted, and any that slip through are queued in `storage_gc`
for the cleanup script.

Three ways a report gets purged:

1. **The student chooses to.** After marking something recovered, the app offers
   to clear the details straight away, and says plainly what is kept.
2. **Automatically, 30 days after recovery.** `purge_resolved_items()` runs
   nightly via `pg_cron`, or from the GitHub Action if `pg_cron` isn't enabled.
   Lost reports nobody ever resolved are closed out at 120 days.
3. **On delete.** The delete dialog offers two outcomes: remove the details and
   keep the record, or erase completely — the second for reports that were a
   mistake and shouldn't count towards anything.

Analytics read from the `reports_all` view, which unions live items with
archived marks, so the admin console shows the same recovery rate before and
after a purge.

```sql
-- purge one report by hand
select archive_item('<item-uuid>', 'recovered');

-- run the retention sweep now instead of waiting for 03:00
select purge_resolved_items();
```

---

## Authentication

Two factors, and the second one is not decoration.

**Factor one — university email and password.** Signing up requires a `.ac` or
`.edu` address. Supabase emails a confirmation link, and a trigger sets
`is_verified` from the domain. This gets a session to **AAL1**.

**Factor two — a six-digit code.** On first sign-in the app shows a QR code.
Scanning it with Google Authenticator (or Authy, 1Password, Microsoft
Authenticator — it's the standard TOTP protocol, not a Google-specific one)
adds a CampusFind entry that generates a fresh code every 30 seconds. Entering
a correct code upgrades the session to **AAL2**. Every later sign-in asks for a
code, and the setup screen doesn't come back.

The part worth defending in a write-up is that **the interface is not what
enforces this**. The assurance level lands in the JWT, and the database reads
it:

```sql
create function is_aal2() returns boolean as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$ language sql stable;

create function can_post(uid uuid) returns boolean as $$
  select coalesce((select is_verified and not is_blocked from profiles where id = uid), false)
     and is_aal2();
$$ language sql stable security definer;
```

`can_post()` guards every insert policy, and `is_aal2()` guards updates,
deletes, photo uploads and `archive_item()`. So a stolen password on its own
buys someone a read-only view of the board. It cannot post a report, claim an
item, upload a photo, moderate anything, or purge a record — the API rejects
those writes no matter what the client sends.

A code is accepted one 30-second step either side of the current one, which
absorbs clock drift between a phone and a laptop, and the comparison is
constant-time.

**If a student loses their phone**, the factor has to be reset by staff from
the Supabase dashboard under **Authentication → Users**. There are deliberately
no backup codes: a code that grants access without the authenticator would
undo most of what the second factor is for, and on a campus service an
in-person reset at the IT desk is both easy and stronger.

## Privacy

The parts worth defending in a write-up:

- **`private_marks` and `verify_question` never leave the database.** The app
  reads items through the `items_public` view, which simply doesn't contain
  those columns, so no query from a browser can return them.
- **Claims are visible to two people.** Row level security limits a claim row to
  its author and the person holding the item. That is what makes "describe one
  identifying feature that isn't in the listing" a real check rather than
  theatre.
- **Only university domains can post.** A trigger on signup sets `is_verified`
  from the email domain, and the insert policies require it alongside a
  two-step session. A personal address can read the board but cannot file a
  report or claim anything.
- **No contact details are published.** Students talk through the app.

---

## Project layout

```
src/
  App.jsx              every screen and shared component
  Charts.jsx           recharts, split into its own chunk so phones don't load it
  lib/api.js           the data layer and auth — one interface, two adapters
  lib/totp.js          RFC 6238 codes, for demo mode and the QR
  lib/supabase.js      client; returns null when env vars are absent
  lib/mock.js          seed data for demo mode
supabase/
  schema.sql           tables, indexes, RLS, views, archive + purge functions
  seed.sql             optional sample reports
scripts/gc.mjs         storage cleanup + retention sweep
.github/workflows/     keepalive and maintenance
```

`src/lib/api.js` is the seam. Every screen calls it, and it decides whether the
answer comes from Postgres or from memory. Adding a different backend means
writing a third adapter and changing nothing else.

## Commands

| | |
| --- | --- |
| `npm run dev` | local dev server |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the built output |
| `npm run gc` | run the retention sweep and clear orphaned photos |
