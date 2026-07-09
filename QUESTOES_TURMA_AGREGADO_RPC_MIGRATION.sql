-- ─────────────────────────────────────────────────────────────────────────────
-- QUESTOES_TURMA_AGREGADO_RPC_MIGRATION.sql
--
-- Contexto: após o RLS hardening, a policy resultados_read só deixa o aluno ler
-- as PRÓPRIAS linhas de `resultados`. O radar comparativo por questão
-- (components/aluno/AlunoCharts.tsx → RadarQuestoesChart) e o gráfico de acertos
-- da 1ª fase (GraficoQuestoes) liam a turma inteira no client (loadTurmaQuestoes)
-- para calcular "média da turma" e "top 25%". Para o aluno, o RLS corta as
-- linhas dos colegas → esses dois overlays somem (só a linha do próprio aluno
-- aparece). Para o mentor funciona porque o staff lê todas as linhas.
--
-- Mesma solução da posicoes_aluno: uma função SECURITY DEFINER que enxerga todas
-- as linhas por dentro e devolve APENAS agregados por questão (média e top 25%).
-- Nenhuma nota individual de colega é exposta ao client.
--
-- A lógica replica exatamente o que o RadarQuestoesChart/GraficoQuestoes faziam:
--   · o conjunto de questões (Q) é definido pelas chaves de notas_questoes DO
--     ALUNO-ALVO para cada (ciclo, fase) — igual ao `questoes` do componente.
--   · média da turma  → média, por questão q∈Q, sobre todas as linhas da turma
--                       com aquele q presente (null/ausente ignorado).
--   · top 25%         → ordena os alunos da turma pela média deles sobre Q
--                       (desc), pega ceil(n*0.25) (mínimo 1) e tira a média por
--                       questão desse recorte. Empate desempatado por id_aluno.
--   · a turma INCLUI o próprio aluno-alvo (paridade com a visão do mentor, que
--     já enxergava a própria linha dentro de registrosTurma).
--
-- Casamento de ciclo por NÚMERO extraído de ciclo_nome — mesma regra do
-- componente (cicloNum = ciclo_nome.match(/\d+/)), porque as linhas de 2ª fase
-- e de ranking podem ter sufixos diferentes ("Ciclo 3" vs "Ciclo 3 - ITA").
--
-- Retorno (jsonb):
--   {
--     "<num_ciclo>": {
--       "<fase>": {
--         "media": { "Q1": 0.53, ... },   -- fração 0..1 por questão
--         "top25": { "Q1": 0.91, ... },
--         "n": 42                          -- nº de alunos na turma (hasData)
--       }
--     }
--   }
--
-- Aplicar no SQL Editor do Supabase (só CRIA a função, não altera policies).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.questoes_turma_agregado(target_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
-- ── (ciclo_num, fase, Q) definidos pelas linhas do aluno-alvo ─────────────────
alvo AS (
  SELECT DISTINCT ON (ciclo_num, fase) ciclo_num, fase, qs
  FROM (
    SELECT (regexp_match(ciclo_nome, '\d+'))[1]        AS ciclo_num,
           fase,
           ARRAY(SELECT jsonb_object_keys(notas_questoes)) AS qs,
           id
    FROM resultados
    WHERE id_aluno = target_id
      AND fase <> 'ranking'
      AND notas_questoes IS NOT NULL
      AND jsonb_typeof(notas_questoes) = 'object'
      AND (regexp_match(ciclo_nome, '\d+'))[1] IS NOT NULL
  ) s
  ORDER BY ciclo_num, fase, id
),

-- ── linhas da turma para os mesmos (ciclo_num, fase) ─────────────────────────
turma AS (
  SELECT (regexp_match(r.ciclo_nome, '\d+'))[1] AS ciclo_num,
         r.fase,
         r.id_aluno,
         r.notas_questoes
  FROM resultados r
  WHERE r.fase <> 'ranking'
    AND r.notas_questoes IS NOT NULL
    AND jsonb_typeof(r.notas_questoes) = 'object'
    AND EXISTS (
      SELECT 1 FROM alvo a
      WHERE a.ciclo_num = (regexp_match(r.ciclo_nome, '\d+'))[1]
        AND a.fase = r.fase
    )
),

-- nº de alunos na turma por grupo (base do top25Count e do `n`)
grp AS (
  SELECT a.ciclo_num, a.fase, a.qs,
         (SELECT COUNT(*) FROM turma t
           WHERE t.ciclo_num = a.ciclo_num AND t.fase = a.fase) AS n
  FROM alvo a
),

-- valores por (grupo, aluno, questao) restritos a Q e presentes/numéricos
sq AS (
  SELECT g.ciclo_num, g.fase, t.id_aluno,
         q.key AS questao,
         (t.notas_questoes ->> q.key)::numeric AS val
  FROM grp g
  JOIN turma t ON t.ciclo_num = g.ciclo_num AND t.fase = g.fase
  CROSS JOIN LATERAL unnest(g.qs) AS q(key)
  WHERE t.notas_questoes ? q.key
    AND jsonb_typeof(t.notas_questoes -> q.key) = 'number'
),

-- média de cada aluno sobre Q → ranking para o top 25%
sm AS (
  SELECT ciclo_num, fase, id_aluno, AVG(val) AS media
  FROM sq
  GROUP BY ciclo_num, fase, id_aluno
),
sm_rank AS (
  SELECT sm.*,
         ROW_NUMBER() OVER (PARTITION BY ciclo_num, fase ORDER BY media DESC, id_aluno) AS rk
  FROM sm
),

-- média da turma por questão
mq AS (
  SELECT ciclo_num, fase, questao, AVG(val) AS media
  FROM sq
  GROUP BY ciclo_num, fase, questao
),

-- média do top 25% por questão
tq AS (
  SELECT sq.ciclo_num, sq.fase, sq.questao, AVG(sq.val) AS media
  FROM sq
  JOIN grp g       ON g.ciclo_num = sq.ciclo_num AND g.fase = sq.fase
  JOIN sm_rank sr  ON sr.ciclo_num = sq.ciclo_num AND sr.fase = sq.fase
                  AND sr.id_aluno = sq.id_aluno
  WHERE sr.rk <= GREATEST(1, CEIL(g.n * 0.25))
  GROUP BY sq.ciclo_num, sq.fase, sq.questao
),

-- monta o objeto por (ciclo, fase)
por_grupo AS (
  SELECT g.ciclo_num, g.fase,
         jsonb_build_object(
           'media', COALESCE(
             (SELECT jsonb_object_agg(questao, media) FROM mq
               WHERE mq.ciclo_num = g.ciclo_num AND mq.fase = g.fase), '{}'::jsonb),
           'top25', COALESCE(
             (SELECT jsonb_object_agg(questao, media) FROM tq
               WHERE tq.ciclo_num = g.ciclo_num AND tq.fase = g.fase), '{}'::jsonb),
           'n', g.n
         ) AS bloco
  FROM grp g
)

SELECT COALESCE(
  jsonb_object_agg(ciclo_num, fases),
  '{}'::jsonb
)
FROM (
  SELECT ciclo_num, jsonb_object_agg(fase, bloco) AS fases
  FROM por_grupo
  GROUP BY ciclo_num
) y;
$$;

-- Só usuários logados podem chamar. Devolve apenas agregados por questão
-- (média/top25 da turma) — nunca notas individuais de terceiros.
REVOKE ALL ON FUNCTION public.questoes_turma_agregado(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questoes_turma_agregado(text) TO authenticated;
