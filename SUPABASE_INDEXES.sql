-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES DE PERFORMANCE
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run
-- CONCURRENTLY = cria sem travar o banco (rode fora de transação)
--
-- NOTA (revisão 2026-07): a maior parte destes índices JÁ ESTÁ aplicada em
-- produção (aplicada à mão, ver memória sobre divergência RLS/índices). Este
-- arquivo foi atualizado para refletir o estado REAL do banco. Antes de aplicar,
-- confira o que já existe:
--   SELECT tablename, indexname, indexdef FROM pg_indexes
--   WHERE schemaname='public' ORDER BY tablename, indexname;
--
-- Volumes atuais são pequenos (resultados ~3.4k, atendimentos_mentoria ~1.8k,
-- questions ~0.5k), então índices adicionais além destes têm ganho desprezível.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── resultados (tabela mais consultada) — todos já existem em prod ────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_id_aluno       ON resultados (id_aluno);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_fase           ON resultados (fase);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_mentor         ON resultados (mentor);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_ciclo_nome     ON resultados (ciclo_nome);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_aluno_fase     ON resultados (id_aluno, fase);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_fase_ciclo     ON resultados (fase, ciclo_nome);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_com_questoes   ON resultados (ciclo_nome, fase) WHERE notas_questoes IS NOT NULL;

-- ── atendimentos_mentoria (tabela ATIVA; a legada `atendimentos` não é usada) ─
-- aluno / mentor / vertical já existem em prod (idx_atendimentos_*).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atendimentos_mentor     ON atendimentos_mentoria (mentor);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atendimentos_aluno      ON atendimentos_mentoria (aluno);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atendimentos_vertical   ON atendimentos_mentoria (vertical);
-- NOVO: o dashboard filtra por range de data (últimos 14 dias / mês corrente) e
-- esta tabela cresce a cada atendimento — único filtro de range não indexado.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atendimentos_data       ON atendimentos_mentoria (data_atendimento);

-- ── demais tabelas — já existem em prod ──────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progresso_topicos_aluno_id ON progresso_topicos (aluno_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_perfis_aluno_id            ON perfis (aluno_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alunos_dados_id_aluno      ON alunos_dados (id_aluno);
-- notificacoes(aluno_id), provas_aluno(aluno_id,prova_id), correcoes_prova(aluno_id,prova_id),
-- progresso_subtopicos(aluno_id,subtopico_id), questions(subject/subtopico_id/topico_id/vertical)
-- e moedas_transacoes(aluno_id,tipo) já estão indexadas em prod.
