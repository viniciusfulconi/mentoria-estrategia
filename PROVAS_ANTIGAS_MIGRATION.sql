-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Provas Antigas
-- Cole TUDO no Supabase: Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROVAS_ANTIGAS — cadastro da prova pelo coordenador
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists provas_antigas (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  tipo text not null check (tipo in ('ime', 'ita')),
  fase integer not null check (fase in (1, 2)),
  num_questoes integer not null,
  modelo text not null check (modelo in ('multipla_escolha', 'discursiva')),
  pdf_url text,
  criado_por_id uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. QUESTOES_PROVA_ANTIGA — matéria e tópicos de cada questão
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists questoes_prova_antiga (
  id uuid default gen_random_uuid() primary key,
  prova_id uuid references provas_antigas(id) on delete cascade not null,
  numero integer not null,
  materia text not null,
  topicos uuid[] default '{}',
  created_at timestamp with time zone default now(),
  unique (prova_id, numero)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PROVAS_ALUNO — mentor atribui uma prova antiga a um aluno (agenda)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists provas_aluno (
  id uuid default gen_random_uuid() primary key,
  prova_id uuid references provas_antigas(id) on delete cascade not null,
  aluno_id text not null,
  mentor text,
  data date not null,
  hora_inicio time default '08:00',
  hora_fim time default '13:00',
  criado_por_id uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CORRECOES_PROVA — respostas do aluno após fazer a prova
--
--  Fase 1 (múltipla escolha):
--    respostas: { "1": "acertou", "2": "chute", "3": "nao_sabia", ... }
--    valores possíveis: acertou | chute | besteira | nao_sabia | tempo
--
--  Fase 2 (discursiva):
--    notas: { "1": 0.8, "2": 1.0, ... }  (0 a 1 por questão)
--    pdf_correcao_url: link do PDF enviado pelo aluno
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists correcoes_prova (
  id uuid default gen_random_uuid() primary key,
  prova_aluno_id uuid references provas_aluno(id) on delete cascade not null,
  prova_id uuid references provas_antigas(id) on delete cascade not null,
  aluno_id text not null,
  -- fase 1
  respostas jsonb default '{}',
  -- fase 2
  notas jsonb default '{}',
  pdf_correcao_url text,
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  unique (prova_aluno_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — mesma política permissiva das outras tabelas
-- ─────────────────────────────────────────────────────────────────────────────

alter table provas_antigas enable row level security;
alter table questoes_prova_antiga enable row level security;
alter table provas_aluno enable row level security;
alter table correcoes_prova enable row level security;

create policy "autenticado" on provas_antigas for all to authenticated using (true) with check (true);
create policy "autenticado" on questoes_prova_antiga for all to authenticated using (true) with check (true);
create policy "autenticado" on provas_aluno for all to authenticated using (true) with check (true);
create policy "autenticado" on correcoes_prova for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ÍNDICES — buscas mais comuns
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_questoes_prova_antiga_prova_id on questoes_prova_antiga (prova_id);
create index if not exists idx_provas_aluno_aluno_id on provas_aluno (aluno_id);
create index if not exists idx_provas_aluno_prova_id on provas_aluno (prova_id);
create index if not exists idx_correcoes_prova_aluno_id on correcoes_prova (aluno_id);
create index if not exists idx_correcoes_prova_prova_id on correcoes_prova (prova_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. STORAGE BUCKET — PDFs das provas e correções dos alunos
--
--  Execute SEPARADAMENTE no Supabase Dashboard:
--  Storage → New bucket → nome: "provas-antigas" → Public: NÃO (privado)
--
--  Depois adicione esta policy via SQL Editor:
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('provas-antigas', 'provas-antigas', false)
on conflict (id) do nothing;

create policy "autenticado_provas_antigas" on storage.objects
  for all to authenticated
  using (bucket_id = 'provas-antigas')
  with check (bucket_id = 'provas-antigas');
