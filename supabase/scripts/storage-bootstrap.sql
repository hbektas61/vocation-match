-- Test-harness only. Never applied to a real project, never a migration.
--
-- `supabase/scripts/db-test.sh` drives the bare Postgres image directly, so the
-- storage service never runs and the tables it owns do not exist. A real
-- Supabase project (hosted or `supabase start`) has them before any of our
-- migrations run, because storage-api applies its own migrations at boot.
--
-- This file recreates the parts of that schema our migrations and policies
-- depend on, as faithfully as the security of those policies requires:
--
--   * `storage.objects` and `storage.buckets` with the columns and the unique
--     index storage-api creates.
--   * `storage.foldername` / `storage.filename` / `storage.extension`, which
--     is what a path-prefix policy is written against.
--   * The grant shape that matters most: storage-api grants ALL on these
--     tables to `anon` and `authenticated` and relies entirely on row level
--     security. If our policies are wrong, the tables are wide open — so the
--     tests have to run against that same starting point, not a stricter one.
--
--   * The ownership and role grants that decide whether `create policy ... on
--     storage.objects` is even allowed. In a hosted project `postgres` is a
--     member of `supabase_storage_admin`, which is why writing storage policies
--     from the SQL editor works; that membership is reproduced here so the
--     migration statement is identical to the one production runs.
--
-- Applied before the migrations, as `supabase_admin`, so
-- `20260725001400_profile_photos.sql` sees the schema it will see in production.

create schema if not exists storage;
alter schema storage owner to supabase_storage_admin;

grant supabase_storage_admin to postgres with admin option;

set role supabase_storage_admin;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  owner_id         text,
  user_metadata    jsonb
);

create unique index if not exists bucketid_objname
  on storage.objects (bucket_id, name);

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end;
$$;

create or replace function storage.filename(name text)
returns text
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end;
$$;

create or replace function storage.extension(name text)
returns text
language plpgsql
immutable
as $$
declare
  _parts text[];
  _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end;
$$;

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to postgres, anon, authenticated, service_role;
grant all on storage.buckets to postgres, anon, authenticated, service_role;
grant all on storage.objects to postgres, anon, authenticated, service_role;
grant execute on all functions in schema storage to postgres, anon, authenticated, service_role;

reset role;
