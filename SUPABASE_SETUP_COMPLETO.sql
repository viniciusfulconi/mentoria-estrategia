-- ═══════════════════════════════════════════════════════════════════════════
-- SETUP COMPLETO DO BANCO — Mentoria Estratégia
-- Cole TUDO no Supabase: Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELAS BASE (já existiam no setup antigo)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists turmas (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  tipo text not null check (tipo in ('ITA','Medicina')),
  ano integer not null,
  orcamento_total numeric default 0,
  created_at timestamp with time zone default now()
);

create table if not exists mentores (
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

create table if not exists alunos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  email text,
  turma_id uuid references turmas(id) on delete set null,
  mentor_id uuid references mentores(id) on delete set null,
  created_at timestamp with time zone default now()
);

create table if not exists simulados (
  id uuid default gen_random_uuid() primary key,
  aluno_id uuid references alunos(id) on delete cascade,
  turma_id uuid references turmas(id) on delete set null,
  titulo text not null,
  data date not null,
  nota numeric not null,
  materias jsonb default '{}',
  created_at timestamp with time zone default now()
);

create table if not exists aulas (
  id uuid default gen_random_uuid() primary key,
  titulo text not null,
  turma_id uuid references turmas(id) on delete set null,
  materia text not null,
  duracao text default '—',
  youtube_url text not null,
  youtube_id text not null,
  created_at timestamp with time zone default now()
);

create table if not exists atendimentos (
  id uuid default gen_random_uuid() primary key,
  mentor_id uuid references mentores(id) on delete cascade,
  aluno_id uuid references alunos(id) on delete cascade,
  data date not null,
  nota numeric default 5,
  observacao text default '',
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PERFIS — tabela de usuários autenticados (CRÍTICA: sem ela o login falha)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text not null,
  papel text not null check (papel in ('coordenador', 'mentor', 'aluno')),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'bloqueado')),
  mentor_nome text,
  aluno_id text,
  telefone text,
  modalidade text,
  cidade text,
  foto_url text,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RESULTADOS — dados importados da planilha de simulados/rankings
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists resultados (
  id uuid default gen_random_uuid() primary key,
  id_aluno text not null,
  nome_aluno text,
  mentor text,
  ciclo_nome text,
  concurso text,
  fase text,
  -- 1ª fase
  media_1fase numeric,
  acertos_mat_1f numeric,
  acertos_fis_1f numeric,
  acertos_qui_1f numeric,
  acertos_ing_1f numeric,
  -- 2ª fase
  nota_matematica numeric,
  nota_fisica numeric,
  nota_quimica numeric,
  media_linguagens numeric,
  nota_redacao numeric,
  nota_portugues numeric,
  nota_ingles numeric,
  media_2fase numeric,
  pontos_inteiros numeric,
  -- resultado
  resultado text,
  resultado_ciclo text,
  motivo_reprovacao text,
  classificacao integer,
  -- notas por questão (radar/gráfico)
  notas_questoes jsonb,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ALUNOS_DADOS — cadastro dos alunos vindo da planilha
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists alunos_dados (
  id_aluno text primary key,
  nome text not null,
  mentor text,
  data_nascimento date,
  ingresso text,
  cadastrado boolean default false,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ATENDIMENTOS_MENTORIA — registro de atendimentos dos mentores
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists atendimentos_mentoria (
  id uuid default gen_random_uuid() primary key,
  mentor text not null,
  aluno text,
  tipo text not null default 'Individual',
  data_atendimento date not null,
  hora_inicio text,
  hora_fim text,
  duracao_minutos integer default 0,
  valor_pago numeric default 0,
  descricao text,
  solicitacao_aluno text,
  encaminhamento_psico boolean default false,
  link_gravacao text,
  link_gemini text,
  arquivo_gemini_url text,
  arquivo_gemini_nome text,
  mes text,
  ano integer,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CONCURSOS + TÓPICOS + PROGRESSO — cronograma de estudos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists concursos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  logo_url text,
  created_at timestamp with time zone default now()
);

create table if not exists topicos (
  id uuid default gen_random_uuid() primary key,
  concurso_id uuid references concursos(id) on delete cascade,
  materia text not null,
  topico text not null,
  nome text,
  incidencia numeric default 0,
  created_at timestamp with time zone default now()
);

create table if not exists progresso_topicos (
  id uuid default gen_random_uuid() primary key,
  aluno_id text not null,
  topico_id uuid references topicos(id) on delete cascade,
  status text not null,
  updated_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. LISTAS — listas de exercícios dos alunos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists listas (
  id uuid default gen_random_uuid() primary key,
  aluno_id text not null,
  topico_id uuid references topicos(id) on delete set null,
  materia text not null,
  topico_nome text,
  nome text not null,
  acertos integer not null,
  total integer not null,
  data date not null,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ATIVIDADES — horário / agenda (aulas, simulados, vestibulares, pessoal)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists atividades (
  id uuid default gen_random_uuid() primary key,
  tipo text not null,
  titulo text not null,
  descricao text,
  materia text,
  professor text,
  data_inicio timestamp with time zone not null,
  data_fim timestamp with time zone,
  cor text,
  turma_id uuid references turmas(id) on delete set null,
  aluno_id text,
  -- recorrência
  recorrente boolean default false,
  dia_semana integer,
  recorrencia_inicio date,
  recorrencia_fim date,
  -- simulado
  tipo_simulado text,
  ciclo_simulado text,
  materias_simulado text[],
  -- vestibular
  link_edital text,
  -- controle
  criado_por text,
  criado_por_id uuid,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CSAT — pesquisas de satisfação
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists pesquisas_csat (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  data date not null,
  created_at timestamp with time zone default now()
);

create table if not exists respostas_csat (
  id uuid default gen_random_uuid() primary key,
  pesquisa_id uuid references pesquisas_csat(id) on delete cascade,
  pesquisa_nome text,
  aluno text,
  mentor text not null,
  qualidade_atendimento integer default 0,
  organizacao_planejamento integer default 0,
  diferencial_mentoria integer default 0,
  clareza_orientacoes integer default 0,
  acompanhamento_cobranca integer default 0,
  comunicacao_relacao integer default 0,
  o_que_ajuda text,
  o_que_melhorar text,
  o_que_mudaria text,
  created_at timestamp with time zone default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY — libera acesso para usuários autenticados
-- ─────────────────────────────────────────────────────────────────────────────

alter table turmas enable row level security;
alter table mentores enable row level security;
alter table alunos enable row level security;
alter table simulados enable row level security;
alter table aulas enable row level security;
alter table atendimentos enable row level security;
alter table perfis enable row level security;
alter table resultados enable row level security;
alter table alunos_dados enable row level security;
alter table atendimentos_mentoria enable row level security;
alter table concursos enable row level security;
alter table topicos enable row level security;
alter table progresso_topicos enable row level security;
alter table listas enable row level security;
alter table atividades enable row level security;
alter table pesquisas_csat enable row level security;
alter table respostas_csat enable row level security;

-- Policies — acesso para qualquer usuário autenticado
create policy "autenticado" on turmas for all to authenticated using (true) with check (true);
create policy "autenticado" on mentores for all to authenticated using (true) with check (true);
create policy "autenticado" on alunos for all to authenticated using (true) with check (true);
create policy "autenticado" on simulados for all to authenticated using (true) with check (true);
create policy "autenticado" on aulas for all to authenticated using (true) with check (true);
create policy "autenticado" on atendimentos for all to authenticated using (true) with check (true);
create policy "autenticado" on resultados for all to authenticated using (true) with check (true);
create policy "autenticado" on alunos_dados for all to authenticated using (true) with check (true);
create policy "autenticado" on atendimentos_mentoria for all to authenticated using (true) with check (true);
create policy "autenticado" on concursos for all to authenticated using (true) with check (true);
create policy "autenticado" on topicos for all to authenticated using (true) with check (true);
create policy "autenticado" on progresso_topicos for all to authenticated using (true) with check (true);
create policy "autenticado" on listas for all to authenticated using (true) with check (true);
create policy "autenticado" on atividades for all to authenticated using (true) with check (true);
create policy "autenticado" on pesquisas_csat for all to authenticated using (true) with check (true);
create policy "autenticado" on respostas_csat for all to authenticated using (true) with check (true);

-- Perfis: cada usuário vê todos os perfis (necessário para admin) e gerencia o próprio
create policy "autenticado" on perfis for all to authenticated using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ÍNDICES DE PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_resultados_id_aluno on resultados (id_aluno);
create index if not exists idx_resultados_fase on resultados (fase);
create index if not exists idx_resultados_mentor on resultados (mentor);
create index if not exists idx_resultados_ciclo_nome on resultados (ciclo_nome);
create index if not exists idx_resultados_aluno_fase on resultados (id_aluno, fase);
create index if not exists idx_resultados_fase_ciclo on resultados (fase, ciclo_nome);
create index if not exists idx_resultados_com_questoes on resultados (ciclo_nome, fase) where notas_questoes is not null;

create index if not exists idx_progresso_topicos_aluno_id on progresso_topicos (aluno_id);
create index if not exists idx_perfis_aluno_id on perfis (aluno_id);
create index if not exists idx_alunos_dados_id_aluno on alunos_dados (id_aluno);
create index if not exists idx_atendimentos_mentor on atendimentos_mentoria (mentor);
create index if not exists idx_atendimentos_aluno on atendimentos_mentoria (aluno);
create index if not exists idx_atividades_tipo on atividades (tipo);
create index if not exists idx_atividades_turma_id on atividades (turma_id);
create index if not exists idx_listas_aluno_id on listas (aluno_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. STORAGE BUCKETS
-- Crie manualmente no Supabase: Storage → New bucket
-- ─────────────────────────────────────────────────────────────────────────────
-- Buckets necessários (criar como PUBLIC):
--   • atendimentos  → arquivos Gemini dos atendimentos
--   • avatares      → fotos de perfil dos usuários
--   • cronograma    → logos dos concursos
-- ─────────────────────────────────────────────────────────────────────────────
