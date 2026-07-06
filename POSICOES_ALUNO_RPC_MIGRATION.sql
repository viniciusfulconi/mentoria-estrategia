-- ─────────────────────────────────────────────────────────────────────────────
-- POSICOES_ALUNO_RPC_MIGRATION.sql
--
-- Contexto: após o RLS hardening, a policy resultados_read só deixa o aluno ler
-- as PRÓPRIAS linhas. A home do aluno (app/aluno/[id]) calculava a posição no
-- client ordenando "todos" os rankings — que, para aluno, viravam só as linhas
-- dele → todo aluno aparecia em 1º lugar em tudo.
--
-- Esta função calcula as posições no banco (SECURITY DEFINER, enxerga todas as
-- linhas fase='ranking') e devolve SÓ os números do aluno-alvo — nenhuma nota
-- de outros alunos é exposta, preservando o espírito do hardening.
--
-- A lógica replica exatamente o que o front fazia:
--   · posicao_geral   → app/aluno/[id]/page.tsx (média das médias finais por
--                       ciclo, dedup por ciclo_nome mantendo o menor id,
--                       mediaFinalCiclo = COALESCE(media_2fase, media_1fase))
--   · por_materia     → média do campo sobre todas as linhas de ranking do
--                       aluno (sem dedup por ciclo), null excluído; sem nota → 0
--   · por_ciclo       → components/aluno/PenasConquistas.tsx (dedup por aluno
--                       mantendo o maior id; score = media_2fase, caindo para
--                       media_1fase quando nula OU zero — regra do `||` do JS)
--
-- Empates: desempate determinístico por id_aluno, mesma convenção de
-- ordenarEClassificar em lib/rankings.ts.
--
-- Aplicar no SQL Editor do Supabase (produção tem policies aplicadas à mão —
-- esta migration só CRIA a função, não altera nenhuma policy existente).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.posicoes_aluno(target_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH ranking AS (
  SELECT id, id_aluno, ciclo_nome,
         media_1fase, media_2fase,
         nota_matematica, nota_fisica, nota_quimica, media_linguagens
  FROM resultados
  WHERE fase = 'ranking'
),

-- ── Posição geral ────────────────────────────────────────────────────────────
ciclo_dedup_geral AS (
  SELECT DISTINCT ON (id_aluno, ciclo_nome)
         id_aluno,
         COALESCE(media_2fase, media_1fase) AS media_final
  FROM ranking
  ORDER BY id_aluno, ciclo_nome, id
),
geral AS (
  SELECT id_aluno,
         COALESCE(AVG(media_final) FILTER (WHERE media_final IS NOT NULL), 0) AS m
  FROM ciclo_dedup_geral
  GROUP BY id_aluno
),
geral_pos AS (
  SELECT id_aluno,
         ROW_NUMBER() OVER (ORDER BY m DESC, id_aluno) AS pos,
         COUNT(*)     OVER ()                          AS total
  FROM geral
),

-- ── Posição por matéria ──────────────────────────────────────────────────────
materia AS (
  SELECT id_aluno, v.campo,
         COALESCE(AVG(v.valor) FILTER (WHERE v.valor IS NOT NULL), 0) AS m
  FROM ranking,
  LATERAL (VALUES
    ('nota_matematica',  nota_matematica),
    ('nota_fisica',      nota_fisica),
    ('nota_quimica',     nota_quimica),
    ('media_linguagens', media_linguagens)
  ) AS v(campo, valor)
  GROUP BY id_aluno, v.campo
),
materia_pos AS (
  SELECT id_aluno, campo,
         ROW_NUMBER() OVER (PARTITION BY campo ORDER BY m DESC, id_aluno) AS pos
  FROM materia
),

-- ── Posição por ciclo (penas/conquistas) ─────────────────────────────────────
ciclo_dedup AS (
  SELECT DISTINCT ON (ciclo_nome, id_aluno)
         ciclo_nome, id_aluno,
         COALESCE(NULLIF(media_2fase, 0), NULLIF(media_1fase, 0), 0) AS score
  FROM ranking
  ORDER BY ciclo_nome, id_aluno, id DESC
),
ciclo_pos AS (
  SELECT ciclo_nome, id_aluno,
         ROW_NUMBER() OVER (PARTITION BY ciclo_nome ORDER BY score DESC, id_aluno) AS pos,
         COUNT(*)     OVER (PARTITION BY ciclo_nome)                               AS total
  FROM ciclo_dedup
)

SELECT jsonb_build_object(
  'posicao_geral', (SELECT pos   FROM geral_pos WHERE id_aluno = target_id),
  'total_alunos',  (SELECT total FROM geral_pos LIMIT 1),
  'por_materia',   COALESCE(
    (SELECT jsonb_object_agg(campo, pos) FROM materia_pos WHERE id_aluno = target_id),
    '{}'::jsonb
  ),
  'por_ciclo',     COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('ciclo', ciclo_nome, 'pos', pos, 'total', total)
                      ORDER BY ciclo_nome)
     FROM ciclo_pos WHERE id_aluno = target_id),
    '[]'::jsonb
  )
);
$$;

-- Só usuários logados podem chamar (qualquer papel; devolve apenas posições,
-- que já são exibidas na plataforma — nunca notas de terceiros).
REVOKE ALL ON FUNCTION public.posicoes_aluno(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.posicoes_aluno(text) TO authenticated;
