-- ═══════════════════════════════════════════════════════════════════════════
-- Revisões 7-15-30 (vertical Medicina) — portado da mentoria-play.
--
-- Quando o aluno FECHA um conteúdo (tica uma tarefa de Medicina, ou registra
-- manualmente), o sistema agenda três revisões: +7, +15 e +30 dias. O aluno
-- tica cada uma; o mentor acompanha. Um ciclo por conteúdo; conteúdo repetido
-- dentro de 30 dias não gera ciclo novo (dedupe).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists revisoes_730 (
  id          uuid default gen_random_uuid() primary key,
  aluno_id    text not null,
  materia     text not null,
  label       text not null,             -- o conteúdo fechado (tópico)
  topico_id   uuid references arvore_topicos(id) on delete set null,
  origem      text not null default 'manual' check (origem in ('tarefa', 'manual', 'mapa')),
  tarefa_id   uuid references tarefas(id) on delete set null,
  fechado_em  date not null,
  r7_date     date not null,
  r15_date    date not null,
  r30_date    date not null,
  r7_done_at  timestamptz,
  r15_done_at timestamptz,
  r30_done_at timestamptz,
  note        text,
  vertical    text not null default 'Medicina',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_rev730_aluno   on revisoes_730 (aluno_id);
create index if not exists idx_rev730_fechado on revisoes_730 (aluno_id, fechado_em);

-- As tarefas do Mapa de revisão passam a carregar o tópico explícito — é ele
-- que vira o rótulo do ciclo quando o aluno tica a tarefa (o comentário já
-- levava o tópico, mas concatenado com o texto do mentor).
alter table tarefas add column if not exists topico text;

-- ── RLS: aluno cuida do próprio ciclo; staff vê e opera tudo ────────────────
alter table revisoes_730 enable row level security;

drop policy if exists rev730_aluno on revisoes_730;
drop policy if exists rev730_staff on revisoes_730;
create policy rev730_aluno on revisoes_730 for all to authenticated
  using      (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  with check (auth_papel() = 'aluno' and aluno_id = auth_aluno_id());
create policy rev730_staff on revisoes_730 for all to authenticated
  using      (auth_papel() = any (array['coordenador', 'direcao', 'mentor']))
  with check (auth_papel() = any (array['coordenador', 'direcao', 'mentor']));
