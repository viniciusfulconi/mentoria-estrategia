-- Recalcula media_linguagens, nota_redacao, media_2fase e resultado_ciclo
-- nas linhas fase='ranking' que ficaram com port=0 enquanto a fase '2fase_port'
-- tinha a nota correta. Causa: import de redação por SQL não disparou
-- a consolidação que normalmente roda em /simulados/upload.

WITH port AS (
  SELECT id_aluno, ciclo_nome, media_linguagens, nota_redacao
  FROM resultados
  WHERE fase = '2fase_port'
)
UPDATE resultados r
SET
  media_linguagens = port.media_linguagens,
  nota_redacao     = port.nota_redacao,
  media_2fase = CASE
    -- IME: ponderado (3*mat + 2.5*fis + 2.5*qui + 1*port + 1*ing) / soma_pesos
    WHEN r.concurso = 'IME' THEN (
      (3   * COALESCE(r.nota_matematica, 0)
       + 2.5 * COALESCE(r.nota_fisica, 0)
       + 2.5 * COALESCE(r.nota_quimica, 0)
       + 1   * port.media_linguagens
       + 1   * COALESCE(r.nota_ingles, 0))
      / NULLIF(
          (CASE WHEN r.nota_matematica IS NULL THEN 0 ELSE 3 END
           + CASE WHEN r.nota_fisica    IS NULL THEN 0 ELSE 2.5 END
           + CASE WHEN r.nota_quimica   IS NULL THEN 0 ELSE 2.5 END
           + 1
           + CASE WHEN r.nota_ingles    IS NULL THEN 0 ELSE 1 END)
        , 0)
    )
    -- ITA: média simples das 5 (1ª fase, mat, fis, qui, port)
    ELSE (
      (COALESCE(r.media_1fase, 0)
       + COALESCE(r.nota_matematica, 0)
       + COALESCE(r.nota_fisica, 0)
       + COALESCE(r.nota_quimica, 0)
       + port.media_linguagens)
      / NULLIF(
          (CASE WHEN r.media_1fase     IS NULL THEN 0 ELSE 1 END
           + CASE WHEN r.nota_matematica IS NULL THEN 0 ELSE 1 END
           + CASE WHEN r.nota_fisica     IS NULL THEN 0 ELSE 1 END
           + CASE WHEN r.nota_quimica    IS NULL THEN 0 ELSE 1 END
           + 1)
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
    ELSE CASE  -- ITA
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
  AND r.id_aluno = port.id_aluno
  AND r.ciclo_nome = port.ciclo_nome
  AND (r.media_linguagens = 0 OR r.media_linguagens IS NULL)
  AND port.media_linguagens IS NOT NULL
  AND port.media_linguagens != 0;
