-- ============================================================================
--  CampusFind — PostgreSQL schema (Supabase)
--  Run this whole file once in the Supabase SQL editor.
--
--  Storage philosophy: live reports carry the heavy columns (description,
--  photos, comments, claims). The moment a report is resolved and purged,
--  everything heavy is deleted and a ~120-byte row in recovery_records is
--  left behind as the permanent mark that the item existed and came back.
--  Analytics read from a view that unions live rows with those marks, so
--  the recovery rate and category stats survive the purge.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums ----
do $$ begin
  create type item_type   as enum ('lost', 'found');
  create type item_status as enum ('active', 'matched', 'recovered', 'closed');
  create type claim_state as enum ('pending', 'approved', 'rejected');
  create type outcome_t   as enum ('recovered', 'returned', 'expired', 'removed');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- profiles ----
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null,
  email       text not null,
  is_verified boolean not null default false,   -- true once a university domain is confirmed
  is_staff    boolean not null default false,   -- admin console access
  is_blocked  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- A profile row is created automatically for every new auth user. The email
-- domain decides verification, so a gmail address can read but never post.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, is_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.email ~* '\.(ac|edu)(\.[a-z]{2,})?$'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_user();

create or replace function is_staff(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_staff from profiles where id = uid), false);
$$;

-- True only when the caller passed both factors. Supabase puts the
-- authenticator assurance level in the JWT: aal1 after a password, aal2 after
-- a six-digit code from an authenticator app.
create or replace function is_aal2()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- The write gate. Three conditions, all required: a confirmed university
-- address, an account in good standing, and a session that cleared two-step
-- sign-in. Enforcing it here rather than in the interface means a stolen
-- password alone can read the board but cannot post, claim or moderate.
create or replace function can_post(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_verified and not is_blocked from profiles where id = uid), false)
     and is_aal2();
$$;

-- ------------------------------------------------------- reference data ----
create table if not exists categories (
  id    text primary key,
  label text not null,
  emoji text not null,
  sort  int  not null default 0
);

create table if not exists locations (
  id       serial primary key,
  name     text not null unique,
  building text,
  sort     int not null default 0
);

insert into categories (id, label, emoji, sort) values
  ('electronics','Electronics','🎧',1), ('cards','Student Cards','💳',2),
  ('keys','Keys','🔑',3),               ('bags','Bags','🎒',4),
  ('clothing','Clothing','🧥',5),       ('books','Books','📚',6),
  ('jewellery','Jewellery','💍',7),     ('accessories','Accessories','👓',8),
  ('documents','Documents','📄',9),     ('sports','Sports Equipment','🏀',10),
  ('bottles','Water Bottles','🥤',11),  ('other','Other','📦',12)
on conflict (id) do nothing;

insert into locations (name, sort) values
  ('Main Library',1), ('Cafeteria',2), ('Lecture Hall B',3), ('Residence',4),
  ('Sports Centre',5), ('Parking',6), ('ICT Lab',7), ('Science Block',8),
  ('Student Centre',9), ('Administration',10), ('Other',11)
on conflict (name) do nothing;

-- ------------------------------------------------------------- items -------
create table if not exists items (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references profiles(id) on delete cascade,
  type            item_type not null,
  status          item_status not null default 'active',
  name            text not null check (length(name) between 3 and 120),
  category_id     text not null references categories(id),
  location_id     int  not null references locations(id),
  spot            text,
  room            text,
  description     text not null check (length(description) <= 2000),
  brand           text,
  color           text,
  occurred_at     timestamptz not null default now(),
  is_urgent       boolean not null default false,
  views           int not null default 0,

  -- never exposed publicly: the answer only the true owner would know,
  -- and the question a finder wants claimants to answer
  private_marks   text,
  verify_question text,
  holding         text,          -- found items: where the item is being kept

  search_vector tsvector generated always as (
    to_tsvector('english',
      coalesce(name,'') || ' ' || coalesce(description,'') || ' ' ||
      coalesce(brand,'') || ' ' || coalesce(color,''))
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_search_idx   on items using gin (search_vector);
create index if not exists items_type_status  on items (type, status);
create index if not exists items_created_idx  on items (created_at desc);
create index if not exists items_reporter_idx on items (reporter_id);
create index if not exists items_category_idx on items (category_id);
create index if not exists items_location_idx on items (location_id);

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists items_touch on items;
create trigger items_touch before update on items
  for each row execute function touch_updated_at();

-- Cheap view counter that does not need an UPDATE policy on items.
create or replace function increment_views(p_item uuid)
returns void language sql security definer set search_path = public as $$
  update items set views = views + 1 where id = p_item;
$$;

-- ------------------------------------------------------- item children -----
create table if not exists item_images (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id) on delete cascade,
  storage_path text not null,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists item_images_item_idx on item_images (item_id);

create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_item_idx on comments (item_id, created_at);

create table if not exists matches (
  id            uuid primary key default gen_random_uuid(),
  lost_item_id  uuid not null references items(id) on delete cascade,
  found_item_id uuid not null references items(id) on delete cascade,
  score         int not null check (score between 0 and 100),
  dismissed     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (lost_item_id, found_item_id)
);
create index if not exists matches_lost_idx  on matches (lost_item_id, score desc);
create index if not exists matches_found_idx on matches (found_item_id, score desc);

create table if not exists claims (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  claimant_id uuid not null references profiles(id) on delete cascade,
  answer      text not null,
  state       claim_state not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (item_id, claimant_id)
);
create index if not exists claims_item_idx on claims (item_id, state);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null check (kind in ('match','reply','recovered','claim')),
  title      text not null,
  body       text not null,
  item_id    uuid references items(id) on delete set null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read, created_at desc);

create table if not exists flags (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason      text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists flags_open_idx on flags (resolved, created_at desc);

-- -------------------------------------------------------- help requests -----
create table if not exists help_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references profiles(id) on delete cascade,
  title       text not null,
  item_label  text not null,
  location_id int references locations(id),
  time_hint   text,
  detail      text,
  created_at  timestamptz not null default now()
);

create table if not exists help_replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references help_posts(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists help_replies_post_idx on help_replies (post_id, created_at);

-- ============================================================================
--  RECOVERY RECORDS — the mark that outlives the report
--  Deliberately narrow. No name, no description, no photos, no free text.
--  Roughly 120 bytes per row against ~4 KB for a live report with images.
-- ============================================================================
create table if not exists recovery_records (
  id               uuid primary key default gen_random_uuid(),
  original_item_id uuid not null unique,
  reporter_id      uuid references profiles(id) on delete set null,
  type             item_type not null,
  category_id      text not null references categories(id),
  location_id      int  not null references locations(id),
  reported_at      timestamptz not null,
  resolved_at      timestamptz not null default now(),
  outcome          outcome_t not null default 'recovered',
  days_open        int not null default 0
);
create index if not exists recovery_cat_idx      on recovery_records (category_id);
create index if not exists recovery_resolved_idx on recovery_records (resolved_at desc);
create index if not exists recovery_reporter_idx on recovery_records (reporter_id);

-- Storage garbage collection queue. Deleting an item_images row removes the
-- database reference but not the file in the storage bucket, so every deleted
-- path is queued here and drained by `npm run gc` (see scripts/gc.mjs).
create table if not exists storage_gc (
  id           bigserial primary key,
  storage_path text not null,
  queued_at    timestamptz not null default now()
);

create or replace function queue_image_for_gc()
returns trigger language plpgsql as $$
begin
  insert into storage_gc (storage_path) values (old.storage_path);
  return old;
end $$;

drop trigger if exists item_images_gc on item_images;
create trigger item_images_gc after delete on item_images
  for each row execute function queue_image_for_gc();

-- Internal: no permission check. Called by the wrapper below and by the
-- nightly purge job.
create or replace function _archive_item(p_item uuid, p_outcome outcome_t)
returns recovery_records language plpgsql security definer set search_path = public as $$
declare
  i items%rowtype;
  r recovery_records%rowtype;
begin
  select * into i from items where id = p_item;
  if not found then raise exception 'Item % does not exist', p_item; end if;

  insert into recovery_records (
    original_item_id, reporter_id, type, category_id, location_id,
    reported_at, resolved_at, outcome, days_open
  ) values (
    i.id, i.reporter_id, i.type, i.category_id, i.location_id,
    i.created_at, now(), p_outcome,
    greatest(0, extract(epoch from (now() - i.created_at)) / 86400)::int
  )
  on conflict (original_item_id) do update set outcome = excluded.outcome
  returning * into r;

  -- images, comments, claims, matches, flags and notification links all
  -- disappear with the parent row via ON DELETE CASCADE
  delete from items where id = i.id;
  return r;
end $$;

-- Public entry point. The owner of the report or a staff member may purge it.
create or replace function archive_item(p_item uuid, p_outcome outcome_t default 'recovered')
returns recovery_records language plpgsql security definer set search_path = public as $$
declare owner_id uuid;
begin
  select reporter_id into owner_id from items where id = p_item;
  if owner_id is null then raise exception 'Item % does not exist', p_item; end if;
  if owner_id <> auth.uid() and not is_staff(auth.uid()) then
    raise exception 'Only the person who filed this report can remove it';
  end if;
  if not is_aal2() then
    raise exception 'Two-step sign-in is required to remove a report';
  end if;
  return _archive_item(p_item, p_outcome);
end $$;

-- Nightly housekeeping: any found item still sitting in the database 30 days
-- after being marked recovered is purged down to its mark. Lost reports that
-- nobody ever resolved are closed out after 120 days.
create or replace function purge_resolved_items()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; rec record;
begin
  for rec in
    select id from items
    where status = 'recovered' and updated_at < now() - interval '30 days'
  loop
    perform _archive_item(rec.id, 'recovered'); n := n + 1;
  end loop;

  for rec in
    select id from items
    where status in ('active','matched') and created_at < now() - interval '120 days'
  loop
    perform _archive_item(rec.id, 'expired'); n := n + 1;
  end loop;

  return n;
end $$;

-- Schedule it if pg_cron is available (Database → Extensions → enable pg_cron).
-- Skip this block and call purge_resolved_items() from the GitHub Action instead.
do $$ begin
  perform cron.schedule('campusfind-purge', '0 3 * * *', 'select purge_resolved_items()');
exception when others then
  raise notice 'pg_cron not enabled — run purge_resolved_items() from a scheduled job instead';
end $$;

-- ============================================================================
--  VIEWS
-- ============================================================================

-- Public projection of items. private_marks and verify_question are absent by
-- construction, so no query from the browser can ever return them.
create or replace view items_public
with (security_invoker = true) as
select
  i.id, i.reporter_id, i.type, i.status, i.name, i.category_id, i.location_id,
  l.name as location_name, c.label as category_label, c.emoji as category_emoji,
  i.spot, i.room, i.description, i.brand, i.color, i.occurred_at,
  i.is_urgent, i.views, i.holding, i.created_at, i.updated_at,
  p.full_name as reporter_name, p.is_verified as reporter_verified,
  (select count(*) from comments cm where cm.item_id = i.id) as reply_count,
  (select count(*) from item_images im where im.item_id = i.id) as photo_count
from items i
join profiles   p on p.id = i.reporter_id
join locations  l on l.id = i.location_id
join categories c on c.id = i.category_id;

-- Live reports and archived marks in one place, so campus insights stay
-- correct after a purge.
create or replace view reports_all
with (security_invoker = true) as
  select id, type, category_id, location_id, created_at as reported_at,
         status::text as state, false as archived
  from items
  union all
  select original_item_id, type, category_id, location_id, reported_at,
         outcome::text as state, true as archived
  from recovery_records;

create or replace view campus_insights
with (security_invoker = true) as
select
  (select count(*) from reports_all)                                   as total_reports,
  (select count(*) from reports_all where type = 'lost')               as lost_reports,
  (select count(*) from reports_all where type = 'found')              as found_reports,
  (select count(*) from reports_all where state in ('recovered','returned')) as recovered_reports,
  (select count(*) from items where status = 'active')                 as active_reports,
  (select round(100.0 * count(*) filter (where state in ('recovered','returned'))
                / greatest(count(*), 1))
     from reports_all)                                                 as recovery_rate,
  (select round(avg(days_open)::numeric, 1) from recovery_records
     where outcome in ('recovered','returned'))                        as avg_days_to_recover;

-- ============================================================================
--  ROW LEVEL SECURITY
-- ============================================================================
alter table profiles         enable row level security;
alter table items            enable row level security;
alter table item_images      enable row level security;
alter table comments         enable row level security;
alter table matches          enable row level security;
alter table claims           enable row level security;
alter table notifications    enable row level security;
alter table flags            enable row level security;
alter table help_posts       enable row level security;
alter table help_replies     enable row level security;
alter table recovery_records enable row level security;
alter table categories       enable row level security;
alter table locations        enable row level security;
alter table storage_gc       enable row level security;

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists ref_read_cat on categories;
create policy ref_read_cat on categories for select to authenticated using (true);
drop policy if exists ref_read_loc on locations;
create policy ref_read_loc on locations for select to authenticated using (true);

drop policy if exists items_read on items;
create policy items_read on items for select to authenticated using (true);
drop policy if exists items_insert on items;
create policy items_insert on items for insert to authenticated
  with check (reporter_id = auth.uid() and can_post(auth.uid()));
drop policy if exists items_update on items;
create policy items_update on items for update to authenticated
  using ((reporter_id = auth.uid() or is_staff(auth.uid())) and is_aal2());
drop policy if exists items_delete on items;
create policy items_delete on items for delete to authenticated
  using ((reporter_id = auth.uid() or is_staff(auth.uid())) and is_aal2());

drop policy if exists images_read on item_images;
create policy images_read on item_images for select to authenticated using (true);
drop policy if exists images_write on item_images;
create policy images_write on item_images for all to authenticated
  using (exists (select 1 from items i where i.id = item_id and i.reporter_id = auth.uid()))
  with check (exists (select 1 from items i where i.id = item_id and i.reporter_id = auth.uid()));

drop policy if exists comments_read on comments;
create policy comments_read on comments for select to authenticated using (true);
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert to authenticated
  with check (author_id = auth.uid() and can_post(auth.uid()));
drop policy if exists comments_delete on comments;
create policy comments_delete on comments for delete to authenticated
  using ((author_id = auth.uid() or is_staff(auth.uid())) and is_aal2());

drop policy if exists matches_read on matches;
create policy matches_read on matches for select to authenticated using (true);
drop policy if exists matches_write on matches;
create policy matches_write on matches for all to authenticated using (true) with check (true);

-- A claim is visible to the claimant and to the person holding the item, and
-- to nobody else. This is what keeps the verification answer private.
drop policy if exists claims_read on claims;
create policy claims_read on claims for select to authenticated using (
  claimant_id = auth.uid()
  or exists (select 1 from items i where i.id = item_id and i.reporter_id = auth.uid())
  or is_staff(auth.uid())
);
drop policy if exists claims_insert on claims;
create policy claims_insert on claims for insert to authenticated
  with check (claimant_id = auth.uid() and can_post(auth.uid()));
drop policy if exists claims_update on claims;
create policy claims_update on claims for update to authenticated
  using (is_aal2() and exists (select 1 from items i where i.id = item_id and i.reporter_id = auth.uid()));

drop policy if exists notifs_read on notifications;
create policy notifs_read on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifs_update on notifications;
create policy notifs_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifs_insert on notifications;
create policy notifs_insert on notifications for insert to authenticated with check (true);

drop policy if exists flags_insert on flags;
create policy flags_insert on flags for insert to authenticated
  with check (reporter_id = auth.uid() and is_aal2());
drop policy if exists flags_read on flags;
create policy flags_read on flags for select to authenticated using (is_staff(auth.uid()));
drop policy if exists flags_update on flags;
create policy flags_update on flags for update to authenticated using (is_staff(auth.uid()) and is_aal2());

drop policy if exists help_read on help_posts;
create policy help_read on help_posts for select to authenticated using (true);
drop policy if exists help_insert on help_posts;
create policy help_insert on help_posts for insert to authenticated
  with check (author_id = auth.uid() and can_post(auth.uid()));
drop policy if exists help_delete on help_posts;
create policy help_delete on help_posts for delete to authenticated
  using ((author_id = auth.uid() or is_staff(auth.uid())) and is_aal2());

drop policy if exists help_reply_read on help_replies;
create policy help_reply_read on help_replies for select to authenticated using (true);
drop policy if exists help_reply_insert on help_replies;
create policy help_reply_insert on help_replies for insert to authenticated
  with check (author_id = auth.uid() and can_post(auth.uid()));

-- Marks are readable by everyone signed in (they carry nothing personal
-- beyond the reporter link) and writable only through archive_item().
drop policy if exists recovery_read on recovery_records;
create policy recovery_read on recovery_records for select to authenticated using (true);

-- storage_gc: no policy at all, so only the service role can read it.

-- ============================================================================
--  STORAGE BUCKET
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

drop policy if exists "photos readable" on storage.objects;
create policy "photos readable" on storage.objects for select
  using (bucket_id = 'item-photos');

drop policy if exists "photos uploadable" on storage.objects;
create policy "photos uploadable" on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text and is_aal2());

drop policy if exists "photos removable" on storage.objects;
create policy "photos removable" on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text);
