-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige media_linguagens no Ciclo 5: estava sendo gravada como apenas
-- nota_portugues, ignorando nota_redacao. Fórmula correta: (port + red)/2.
--
-- Causado pelo bug em app/simulados/upload/page.tsx (corrigido em commit
-- separado): quando a planilha não trazia a coluna "Media Linguagens"
-- pré-calculada, o código pegava apenas a coluna "Nota" (português).
--
-- Etapa 1: corrige media_linguagens nas linhas fase='2fase_port'
-- Etapa 2: propaga para a linha consolidada fase='ranking'
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Etapa 1: 2fase_port ──────────────────────────────────────────────────
UPDATE resultados
SET media_linguagens = ROUND(((nota_portugues + nota_redacao) / 2)::numeric, 4)
WHERE fase = '2fase_port'
  AND ciclo_nome = 'Ciclo 5'
  AND nota_portugues IS NOT NULL
  AND nota_redacao IS NOT NULL
  AND ABS(media_linguagens - (nota_portugues + nota_redacao) / 2) > 0.05;

-- ── Etapa 2: ranking — recalcula media_linguagens, media_2fase, resultado_ciclo
WITH port AS (
  SELECT id_aluno, ciclo_nome, media_linguagens, nota_redacao
  FROM resultados
  WHERE fase = '2fase_port'
    AND ciclo_nome = 'Ciclo 5'
)
UPDATE resultados r
SET
  media_linguagens = port.media_linguagens,
  nota_redacao     = port.nota_redacao,
  media_2fase = CASE
    -- IME: (3*mat + 2.5*fis + 2.5*qui + 1*port + 1*ing) / soma_pesos_presentes
    WHEN r.concurso = 'IME' THEN (
      (3   * COALESCE(r.nota_matematica, 0)
       + 2.5 * COALESCE(r.nota_fisica, 0)
       + 2.5 * COALESCE(r.nota_quimica, 0)
       + 1   * COALESCE(port.media_linguagens, 0)
       + 1   * COALESCE(r.nota_ingles, 0))
      / NULLIF(
          (CASE WHEN r.nota_matematica  IS NULL THEN 0 ELSE 3   END
           + CASE WHEN r.nota_fisica    IS NULL THEN 0 ELSE 2.5 END
           + CASE WHEN r.nota_quimica   IS NULL THEN 0 ELSE 2.5 END
           + CASE WHEN port.media_linguagens IS NULL THEN 0 ELSE 1 END
           + CASE WHEN r.nota_ingles    IS NULL THEN 0 ELSE 1   END)
        , 0)
    )
    -- ITA: média simples das presentes (1ª fase, mat, fis, qui, port)
    ELSE (
      (COALESCE(r.media_1fase, 0)
       + COALESCE(r.nota_matematica, 0)
       + COALESCE(r.nota_fisica, 0)
       + COALESCE(r.nota_quimica, 0)
       + COALESCE(port.media_linguagens, 0))
      / NULLIF(
          (CASE WHEN r.media_1fase     IS NULL THEN 0 ELSE 1 END
           + CASE WHEN r.nota_matematica IS NULL THEN 0 ELSE 1 END
           + CASE WHEN r.nota_fisica     IS NULL THEN 0 ELSE 1 END
           + CASE WHEN r.nota_quimica    IS NULL THEN 0 ELSE 1 END
           + CASE WHEN port.media_linguagens IS NULL THEN 0 ELSE 1 END)
        , 0)
    )
  END,
  resultado_ciclo = CASE
    WHEN r.concurso = 'IME' THEN CASE
      WHEN r.nota_matematica IS NOT NULL AND r.nota_fisica IS NOT NULL
        AND r.nota_quimica IS NOT NULL AND port.media_linguagens IS NOT NULL
      THEN CASE
        WHEN r.nota_matematica >= 4 AND r.nota_fisica >= 4
          AND r.nota_quimica >= 4 AND port.media_linguagens >= 4
        THEN 'Aprovado' ELSE 'Reprovado'
      END
      ELSE 'Em andamento'
    END
    ELSE CASE  -- ITA: precisa todas as 5 (1f + mat + fis + qui + port)
      WHEN r.media_1fase IS NOT NULL AND r.nota_matematica IS NOT NULL
        AND r.nota_fisica IS NOT NULL AND r.nota_quimica IS NOT NULL
        AND port.media_linguagens IS NOT NULL
      THEN CASE
        WHEN r.nota_matematica >= 4 AND r.nota_fisica >= 4
          AND r.nota_quimica >= 4 AND port.media_linguagens >= 4
          AND ((r.media_1fase + r.nota_matematica + r.nota_fisica
               + r.nota_quimica + port.media_linguagens) / 5) >= 5
        THEN 'Aprovado' ELSE 'Reprovado'
      END
      ELSE 'Em andamento'
    END
  END
FROM port
WHERE r.fase = 'ranking'
  AND r.ciclo_nome = 'Ciclo 5'
  AND r.id_aluno = port.id_aluno;
