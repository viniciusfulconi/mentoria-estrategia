-- ═══════════════════════════════════════════════════════════════════════════
-- TAREFAS — mentor/coordenador atribui tarefas ao aluno; aparecem no horário
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Definição da tarefa (uma linha por tarefa, independente de quantos alunos) ──
create table if not exists tarefas (
  id uuid default gen_random_uuid() primary key,
  criado_por_id   uuid,
  criado_por_papel text,                         -- 'coordenador' | 'direcao' | 'mentor'
  criado_por_nome  text,
  materia   text,
  tipo      text not null check (tipo in ('revisao', 'lista', 'teoria')),
  link      text,                                -- só para tipo 'lista'
  comentario text,                               -- texto/observação sobre a tarefa
  -- Prazo: dois modos possíveis
  --   'dia'    → data + hora_inicio/hora_fim (janela de horas em um dia)
  --   'janela' → janela_inicio .. janela_fim (intervalo de dias para fazer)
  modo_prazo text not null check (modo_prazo in ('dia', 'janela')),
  data          date,
  hora_inicio   time,
  hora_fim      time,
  janela_inicio date,
  janela_fim    date,
  vertical  text default 'ITA',
  created_at timestamp with time zone default now()
);

-- ── Atribuição por aluno + status de cumprimento ──────────────────────────────
create table if not exists tarefas_alunos (
  id uuid default gen_random_uuid() primary key,
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  aluno_id  text not null,
  status    text not null default 'pendente' check (status in ('pendente', 'cumprida')),
  comentario_aluno text,
  concluida_em timestamp with time zone,
  created_at   timestamp with time zone default now(),
  unique (tarefa_id, aluno_id)
);

create index if not exists idx_tarefas_criado_por on tarefas (criado_por_id);
create index if not exists idx_tarefas_vertical    on tarefas (vertical);
create index if not exists idx_tarefas_alunos_aluno   on tarefas_alunos (aluno_id);
create index if not exists idx_tarefas_alunos_tarefa  on tarefas_alunos (tarefa_id);
create index if not exists idx_tarefas_alunos_status  on tarefas_alunos (status);

-- ── RLS (mesmo padrão de notificacoes/atividades) ─────────────────────────────
alter table tarefas        enable row level security;
alter table tarefas_alunos enable row level security;

-- tarefas: qualquer autenticado lê (o app filtra por papel/aluno); staff escreve.
drop policy if exists tarefas_read  on tarefas;
drop policy if exists tarefas_write on tarefas;
create policy tarefas_read on tarefas for select to authenticated using (true);
create policy tarefas_write on tarefas for all to authenticated
  using      (auth_papel() = any (array['coordenador','direcao','mentor']))
  with check (auth_papel() = any (array['coordenador','direcao','mentor']));

-- tarefas_alunos: leitura autenticada; staff insere/gerencia; o aluno pode
-- atualizar a própria linha (marcar cumprida + comentário).
drop policy if exists tarefas_alunos_read   on tarefas_alunos;
drop policy if exists tarefas_alunos_staff  on tarefas_alunos;
drop policy if exists tarefas_alunos_self   on tarefas_alunos;
create policy tarefas_alunos_read on tarefas_alunos for select to authenticated using (true);
create policy tarefas_alunos_staff on tarefas_alunos for all to authenticated
  using      (auth_papel() = any (array['coordenador','direcao','mentor']))
  with check (auth_papel() = any (array['coordenador','direcao','mentor']));
create policy tarefas_alunos_self on tarefas_alunos for update to authenticated
  using      (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  with check (auth_papel() = 'aluno' and aluno_id = auth_aluno_id());
