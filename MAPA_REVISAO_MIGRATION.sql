-- ═══════════════════════════════════════════════════════════════════════════
-- Mapa de erros para revisão (vertical Medicina)
--
-- O mentor classifica, durante o atendimento, cada tópico da árvore em
-- incidência no vestibular × dificuldade do aluno. A regra de geração é:
--
--     dificuldade ALTA   → sempre gera (prioridade 1/2/3 conforme incidência)
--     dificuldade MÉDIA  → gera se a incidência for ALTA (prio 2) ou MÉDIA (prio 3)
--     dificuldade BAIXA  → nunca gera
--
-- O mapa é um RASCUNHO enquanto o mentor ajusta tipo/comentário/duração.
-- Ao ENVIAR, cada item vira uma (ou duas) linhas em `tarefas` + `tarefas_alunos`,
-- distribuídas em blocos de horário ao longo da janela de datas. Daí para
-- frente quem manda é o módulo de Tarefas: o aluno tica, o mentor acompanha.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mapas_revisao (
  id uuid default gen_random_uuid() primary key,
  aluno_id    text not null,
  aluno_nome  text,
  mentor_id   uuid,
  mentor_nome text,
  vertical    text not null default 'Medicina',
  status      text not null default 'rascunho' check (status in ('rascunho', 'enviado')),

  -- Janela de distribuição
  data_inicio date,
  data_fim    date,
  hora_inicio time not null default '14:00',
  -- Horas livres do aluno por dia da semana — índice 0 = domingo … 6 = sábado
  horas_semana numeric[] not null default '{0,2,2,2,2,2,0}',

  enviado_em timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists mapas_revisao_itens (
  id uuid default gen_random_uuid() primary key,
  mapa_id   uuid not null references mapas_revisao(id) on delete cascade,
  topico_id uuid references arvore_topicos(id) on delete set null,
  materia_nome text not null,
  topico_nome  text not null,

  -- Diagnóstico da chamada
  incidencia  text check (incidencia  in ('alta', 'media', 'baixa')),
  dificuldade text check (dificuldade in ('alta', 'media', 'baixa')),
  prioridade  int,   -- 1 (mais urgente) … 3; null = não gera tarefa

  -- Decisão do mentor sobre a tarefa gerada
  incluir        boolean not null default true,
  tipo           text not null default 'ambos' check (tipo in ('teoria', 'lista', 'ambos')),
  comentario     text,
  link           text,
  minutos_teoria int not null default 45,
  minutos_lista  int not null default 60,

  -- Rastro após o envio (permite ver o progresso do aluno pelo mapa)
  tarefa_teoria_id uuid references tarefas(id) on delete set null,
  tarefa_lista_id  uuid references tarefas(id) on delete set null,

  created_at timestamptz default now(),
  unique (mapa_id, topico_id)
);

create index if not exists idx_mapas_revisao_aluno   on mapas_revisao (aluno_id);
create index if not exists idx_mapas_revisao_mentor  on mapas_revisao (mentor_id);
create index if not exists idx_mapas_revisao_status  on mapas_revisao (status);
create index if not exists idx_mri_mapa              on mapas_revisao_itens (mapa_id);
create index if not exists idx_mri_prioridade        on mapas_revisao_itens (prioridade);

-- ── RLS: só staff. O aluno nunca vê o mapa — ele vê as tarefas geradas. ─────
alter table mapas_revisao       enable row level security;
alter table mapas_revisao_itens enable row level security;

drop policy if exists mapas_revisao_rw on mapas_revisao;
create policy mapas_revisao_rw on mapas_revisao for all to authenticated
  using      (auth_papel() = any (array['coordenador', 'direcao', 'mentor']))
  with check (auth_papel() = any (array['coordenador', 'direcao', 'mentor']));

drop policy if exists mapas_revisao_itens_rw on mapas_revisao_itens;
create policy mapas_revisao_itens_rw on mapas_revisao_itens for all to authenticated
  using      (auth_papel() = any (array['coordenador', 'direcao', 'mentor']))
  with check (auth_papel() = any (array['coordenador', 'direcao', 'mentor']));
