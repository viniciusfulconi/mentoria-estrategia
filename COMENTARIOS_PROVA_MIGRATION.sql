-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Comentários do mentor em prova antiga
--
-- Um comentário por prova+aluno, escrito pelo MENTOR DAQUELE ALUNO e lido pelo
-- aluno na tela da prova. Três blocos de texto (letra/organização, resolução,
-- conteúdos a estudar) e uma marcação opcional de tópicos.
--
-- Cole TUDO no Supabase: Dashboard → SQL Editor → New query → Run.
-- Idempotente: pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABELA
--
--  prova_id e aluno_id são DENORMALIZADOS de propósito, espelhando
--  correcoes_prova: aluno_id é indispensável para o RLS do aluno (e do mentor,
--  que escopa por alunos_dados.mentor) e prova_id evita join na consulta que a
--  tela de ranking faz para saber quem já tem comentário.
--
--  mentor: auth_mentor_nome() de quem escreveu. É o mesmo nome que aparece em
--  alunos_dados.mentor — a plataforma inteira liga mentor↔aluno por nome.
--  NÃO confundir com provas_aluno.mentor, que fica vazio quando o coordenador
--  atribui a prova em lote e por isso não serve para identificar mentorado.
--
--  topicos: uuid[] apontando para public.topicos (matéria + tópico), a MESMA
--  convenção de questoes_prova_antiga.topicos. Não é a árvore de 3 níveis
--  (arvore_materias/arvore_topicos/arvore_subtopicos), que é do cronograma.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists comentarios_prova (
  id uuid default gen_random_uuid() primary key,
  prova_aluno_id uuid references provas_aluno(id) on delete cascade not null,
  prova_id uuid references provas_antigas(id) on delete cascade not null,
  aluno_id text not null,
  mentor text not null,
  letra text,
  resolucao text,
  conteudo text,
  topicos uuid[] default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (prova_aluno_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS
--
--  Leitura: staff lê tudo (coordenação acompanha), aluno lê só o dele.
--  Escrita: SÓ o mentor daquele aluno. Coordenação NÃO escreve — se um dia
--  precisar, é acrescentar o papel no with check do insert.
--
--  INSERT e UPDATE são policies separadas (em vez de um "for all") porque o
--  upsert do PostgREST roda como `insert ... on conflict do update` e precisa
--  passar nas duas. A tela salva por upsert em prova_aluno_id.
--
--  Sem policy de DELETE: ninguém apaga comentário. Para retirar, o mentor
--  esvazia os campos — assim o aluno nunca perde o histórico sem rastro.
-- ─────────────────────────────────────────────────────────────────────────────

alter table comentarios_prova enable row level security;

drop policy if exists "comentarios_read"   on public.comentarios_prova;
drop policy if exists "comentarios_insert" on public.comentarios_prova;
drop policy if exists "comentarios_update" on public.comentarios_prova;

create policy "comentarios_read" on public.comentarios_prova for select to authenticated
  using (
    auth_papel() = any (array['coordenador','direcao','mentor'])
    or (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  );

create policy "comentarios_insert" on public.comentarios_prova for insert to authenticated
  with check (
    auth_papel() = 'mentor'
    and mentor = auth_mentor_nome()
    and aluno_id in (select id_aluno from alunos_dados where mentor = auth_mentor_nome())
  );

create policy "comentarios_update" on public.comentarios_prova for update to authenticated
  using (
    auth_papel() = 'mentor'
    and mentor = auth_mentor_nome()
    and aluno_id in (select id_aluno from alunos_dados where mentor = auth_mentor_nome())
  )
  with check (
    auth_papel() = 'mentor'
    and mentor = auth_mentor_nome()
    and aluno_id in (select id_aluno from alunos_dados where mentor = auth_mentor_nome())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ÍNDICES
--  O unique (prova_aluno_id) já indexa a busca da tela de comentar.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_comentarios_prova_prova_id on comentarios_prova (prova_id);
create index if not exists idx_comentarios_prova_aluno_id on comentarios_prova (aluno_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CONFERÊNCIA (opcional)
-- ─────────────────────────────────────────────────────────────────────────────
-- select policyname, cmd from pg_policies where tablename = 'comentarios_prova';
-- → comentarios_read (SELECT), comentarios_insert (INSERT), comentarios_update (UPDATE)
