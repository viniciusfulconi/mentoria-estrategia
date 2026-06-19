-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: posicao_ranking_prova_antiga
--
-- Devolve (posicao, total) para um aluno em uma prova antiga, usando o
-- mesmo critério do ranking do coordenador (acertos/nota em exatas:
-- Matemática + Física + Química), com desempate por nome.
--
-- Roda como SECURITY DEFINER: o aluno consegue saber a própria posição
-- sem que a RLS de correcoes_prova (que restringe a leitura à própria
-- correção) seja afrouxada. Nenhuma resposta de outro aluno é exposta —
-- só os dois inteiros (posicao, total) saem da função.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.posicao_ranking_prova_antiga(
  p_prova_id uuid,
  p_aluno_id text
)
RETURNS TABLE (posicao int, total int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modelo text;
BEGIN
  SELECT modelo INTO v_modelo FROM provas_antigas WHERE id = p_prova_id;
  IF v_modelo IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH exatas_nums AS (
    SELECT numero
    FROM questoes_prova_antiga
    WHERE prova_id = p_prova_id
      AND materia IN ('Matemática', 'Física', 'Química')
  ),
  pontuacoes AS (
    SELECT
      c.aluno_id,
      COALESCE(ad.nome, c.aluno_id) AS nome,
      CASE
        WHEN v_modelo = 'multipla_escolha' THEN (
          SELECT COUNT(*)::numeric
          FROM jsonb_each_text(c.respostas) AS r(numero, valor)
          WHERE r.valor = 'acertou'
            AND (r.numero)::int IN (SELECT numero FROM exatas_nums)
        )
        ELSE (
          SELECT COALESCE(SUM((r.valor)::numeric), 0)
          FROM jsonb_each_text(c.notas) AS r(numero, valor)
          WHERE (r.numero)::int IN (SELECT numero FROM exatas_nums)
        )
      END AS pts
    FROM correcoes_prova c
    LEFT JOIN alunos_dados ad ON ad.id_aluno = c.aluno_id
    WHERE c.prova_id = p_prova_id
      AND c.confirmed_at IS NOT NULL
  ),
  ranked AS (
    SELECT
      aluno_id,
      ROW_NUMBER() OVER (ORDER BY pts DESC, nome ASC) AS pos
    FROM pontuacoes
  )
  SELECT
    r.pos::int,
    (SELECT COUNT(*)::int FROM pontuacoes)
  FROM ranked r
  WHERE r.aluno_id = p_aluno_id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.posicao_ranking_prova_antiga(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.posicao_ranking_prova_antiga(uuid, text) TO authenticated;
