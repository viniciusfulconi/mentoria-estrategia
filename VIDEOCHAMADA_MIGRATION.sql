-- Salas de videochamada (Daily.co)
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run

create table if not exists salas_videochamada (
  id uuid default gen_random_uuid() primary key,
  aluno_id text not null,
  room_name text not null,
  room_url text not null,
  status text default 'ativa' check (status in ('ativa', 'encerrada')),
  iniciada_por text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create unique index if not exists salas_videochamada_aluno_idx
  on salas_videochamada (aluno_id)
  where status = 'ativa';

alter table salas_videochamada enable row level security;
create policy "acesso_publico" on salas_videochamada for all using (true) with check (true);

-- Tabela de notificacoes (se ainda nao existir)
create table if not exists notificacoes (
  id uuid default gen_random_uuid() primary key,
  aluno_id text not null,
  tipo text not null default 'info',
  titulo text not null,
  mensagem text,
  lida boolean default false,
  criado_em timestamp with time zone default now()
);

create index if not exists notificacoes_aluno_idx on notificacoes (aluno_id);

alter table notificacoes enable row level security;
create policy "acesso_publico" on notificacoes for all using (true) with check (true);
