create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid not null references public.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text not null check (reason in ('SPAM','HARASSMENT','SCAM','IMPERSONATION','INAPPROPRIATE','OTHER')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  constraint user_reports_no_self_report check (reporter_id <> reported_user_id),
  constraint user_reports_reporter_reported_key unique (reporter_id, reported_user_id)
);
create index if not exists user_reports_reported_user_id_idx on public.user_reports (reported_user_id);
alter table public.user_reports enable row level security;