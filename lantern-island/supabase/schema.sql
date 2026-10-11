-- Lantern Island: tables and file bucket for the optional Supabase storage.
--
-- How to use: in your Supabase project open "SQL Editor", paste this whole file, press Run.
-- It is safe to run again: nothing that exists is changed or deleted.
--
-- The game server is the only thing that talks to these tables. It uses the project's
-- service key, which stays on the server. Row Level Security is switched on with no
-- policies, so the public (anon) key that browsers could see can read and write nothing.

-- One table per kind of record. "data" holds the same JSON the file storage writes to disk.
create table if not exists public.li_groups (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create table if not exists public.li_cards (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create table if not exists public.li_missions (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
-- Small bookkeeping records (which sample cards and missions were already copied in).
create table if not exists public.li_meta (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.li_groups   enable row level security;
alter table public.li_cards    enable row level security;
alter table public.li_missions enable row level security;
alter table public.li_meta     enable row level security;

-- Sound and pictures for cards. Private: phones get them through the game server.
insert into storage.buckets (id, name, public)
values ('li-media', 'li-media', false)
on conflict (id) do nothing;
