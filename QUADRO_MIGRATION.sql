-- Quadro branco do aluno
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run

create table if not exists quadros_aluno (
  id uuid default gen_random_uuid() primary key,
  aluno_id text not null,
  titulo text not null default 'Sem título',
  conteudo jsonb default '{"elements":[],"files":{}}',
  updated_at timestamp with time zone default now()
);

create index if not exists quadros_aluno_aluno_idx on quadros_aluno (aluno_id);

alter table quadros_aluno enable row level security;
create policy "acesso_publico" on quadros_aluno for all using (true) with check (true);
