-- Cole este SQL no Supabase: Dashboard → SQL Editor → New query → Cole tudo → Run

create table turmas (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  tipo text not null check (tipo in ('ITA','Medicina')),
  ano integer not null,
  orcamento_total numeric default 0,
  created_at timestamp with time zone default now()
);

create table mentores (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  email text,
  turma_id uuid references turmas(id) on delete set null,
  materia text not null,
  valor_por_atendimento numeric default 0,
  nota_media numeric default 5,
  total_atendimentos integer default 0,
  created_at timestamp with time zone default now()
);

create table alunos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  email text,
  turma_id uuid references turmas(id) on delete set null,
  mentor_id uuid references mentores(id) on delete set null,
  created_at timestamp with time zone default now()
);

create table simulados (
  id uuid default gen_random_uuid() primary key,
  aluno_id uuid references alunos(id) on delete cascade,
  turma_id uuid references turmas(id) on delete set null,
  titulo text not null,
  data date not null,
  nota numeric not null,
  materias jsonb default '{}',
  created_at timestamp with time zone default now()
);

create table aulas (
  id uuid default gen_random_uuid() primary key,
  titulo text not null,
  turma_id uuid references turmas(id) on delete set null,
  materia text not null,
  duracao text default '—',
  youtube_url text not null,
  youtube_id text not null,
  created_at timestamp with time zone default now()
);

create table atendimentos (
  id uuid default gen_random_uuid() primary key,
  mentor_id uuid references mentores(id) on delete cascade,
  aluno_id uuid references alunos(id) on delete cascade,
  data date not null,
  nota numeric default 5,
  observacao text default '',
  created_at timestamp with time zone default now()
);

-- Libera acesso público (sem autenticação por enquanto)
alter table turmas enable row level security;
alter table mentores enable row level security;
alter table alunos enable row level security;
alter table simulados enable row level security;
alter table aulas enable row level security;
alter table atendimentos enable row level security;

create policy "acesso_publico" on turmas for all using (true) with check (true);
create policy "acesso_publico" on mentores for all using (true) with check (true);
create policy "acesso_publico" on alunos for all using (true) with check (true);
create policy "acesso_publico" on simulados for all using (true) with check (true);
create policy "acesso_publico" on aulas for all using (true) with check (true);
create policy "acesso_publico" on atendimentos for all using (true) with check (true);
