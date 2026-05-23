-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES DE PERFORMANCE
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run
-- CONCURRENTLY = cria sem travar o banco (pode demorar alguns segundos)
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabela resultados — a mais consultada da plataforma
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_id_aluno
  ON resultados (id_aluno);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_fase
  ON resultados (fase);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_mentor
  ON resultados (mentor);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_ciclo_nome
  ON resultados (ciclo_nome);

-- Composto: acelera a query mais comum (aluno + fase)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_aluno_fase
  ON resultados (id_aluno, fase);

-- Composto: acelera queries de turma (fase + ciclo)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_fase_ciclo
  ON resultados (fase, ciclo_nome);

-- Parcial: só linhas com notas por questão (radar / barra)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resultados_com_questoes
  ON resultados (ciclo_nome, fase)
  WHERE notas_questoes IS NOT NULL;

-- Progresso dos tópicos por aluno
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_progresso_topicos_aluno_id
  ON progresso_topicos (aluno_id);

-- Perfis e dados de alunos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_perfis_aluno_id
  ON perfis (aluno_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alunos_dados_id_aluno
  ON alunos_dados (id_aluno);

-- Atendimentos
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atendimentos_mentor_id
  ON atendimentos (mentor_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_atendimentos_aluno_id
  ON atendimentos (aluno_id);
