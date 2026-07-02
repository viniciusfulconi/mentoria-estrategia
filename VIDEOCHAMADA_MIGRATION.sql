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
-- RLS real em produção (o antigo "acesso_publico USING(true)" foi endurecido à mão).
-- Leitura: staff OU o próprio aluno (para saber se há chamada ativa esperando por ele).
-- Escrita: só staff (mentor/coord/direção) — o app grava via service role no /api/videochamada.
drop policy if exists "acesso_publico" on salas_videochamada;
create policy salas_read on salas_videochamada for select using (
  auth_papel() = any (array['coordenador','direcao','mentor','professor'])
  or (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
);
create policy salas_write on salas_videochamada for all
  using (auth_papel() = any (array['coordenador','direcao','mentor']))
  with check (auth_papel() = any (array['coordenador','direcao','mentor']));

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
-- RLS real em produção (endurecido à mão). Aluno lê/gerencia só as próprias
-- notificações; staff pode escrever. Inserts do sistema usam service role.
drop policy if exists "acesso_publico" on notificacoes;
create policy notif_read on notificacoes for select using (
  auth_papel() = any (array['coordenador','direcao'])
  or (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
);
create policy notif_write on notificacoes for all
  using (
    auth_papel() = any (array['coordenador','direcao','mentor'])
    or (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  )
  with check (
    auth_papel() = any (array['coordenador','direcao','mentor'])
    or (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  );
