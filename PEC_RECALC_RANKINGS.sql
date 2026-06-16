-- Recalcula linhas fase='ranking' para todos os alunos PEC + os 6 cruzados,
-- após correção das notas de 1fase e adição de novas linhas via cruzamento.
-- Usa as mesmas fórmulas do código original (ITA: média simples, IME: ponderado).

-- Conjunto: alunos PEC + os 6 do cruzamento
WITH afetados AS (
  SELECT DISTINCT id_aluno, ciclo_nome, concurso FROM resultados
  WHERE id_aluno IN (
    SELECT id_aluno FROM alunos_dados WHERE ingresso='PEC'
    UNION
    SELECT unnest(ARRAY['d1594f69','66df1577','23f7eed1','ee5d5533','ea57b80a','538a5db3'])
  )
  AND fase = 'ranking'
),
fontes AS (
  SELECT
    a.id_aluno, a.ciclo_nome, a.concurso,
    f1.media_1fase                 AS m1,
    fmat.nota_matematica           AS mat,
    ffis.nota_fisica               AS fis,
    fqui.nota_quimica              AS qui,
    fport.media_linguagens         AS port,
    fport.nota_redacao             AS red,
    fing.nota_ingles               AS ing
  FROM afetados a
  LEFT JOIN resultados f1    ON f1.id_aluno    = a.id_aluno AND f1.ciclo_nome    = a.ciclo_nome AND f1.fase    = '1fase'
  LEFT JOIN resultados fmat  ON fmat.id_aluno  = a.id_aluno AND fmat.ciclo_nome  = a.ciclo_nome AND fmat.fase  = '2fase_mat'
  LEFT JOIN resultados ffis  ON ffis.id_aluno  = a.id_aluno AND ffis.ciclo_nome  = a.ciclo_nome AND ffis.fase  = '2fase_fis'
  LEFT JOIN resultados fqui  ON fqui.id_aluno  = a.id_aluno AND fqui.ciclo_nome  = a.ciclo_nome AND fqui.fase  = '2fase_qui'
  LEFT JOIN resultados fport ON fport.id_aluno = a.id_aluno AND fport.ciclo_nome = a.ciclo_nome AND fport.fase = '2fase_port'
  LEFT JOIN resultados fing  ON fing.id_aluno  = a.id_aluno AND fing.ciclo_nome  = a.ciclo_nome AND fing.fase  = '2fase_ing'
)
UPDATE resultados r
SET
  media_1fase      = f.m1,
  nota_matematica  = f.mat,
  nota_fisica      = f.fis,
  nota_quimica     = f.qui,
  media_linguagens = f.port,
  nota_redacao     = f.red,
  nota_ingles      = f.ing,
  media_2fase = CASE
    WHEN f.concurso = 'IME' THEN (
      (3*COALESCE(f.mat,0) + 2.5*COALESCE(f.fis,0) + 2.5*COALESCE(f.qui,0) + 1*COALESCE(f.port,0) + 1*COALESCE(f.ing,0))
      / NULLIF(
          (CASE WHEN f.mat IS NULL THEN 0 ELSE 3 END
         + CASE WHEN f.fis IS NULL THEN 0 ELSE 2.5 END
         + CASE WHEN f.qui IS NULL THEN 0 ELSE 2.5 END
         + CASE WHEN f.port IS NULL THEN 0 ELSE 1 END
         + CASE WHEN f.ing IS NULL THEN 0 ELSE 1 END), 0)
    )
    ELSE (
      (COALESCE(f.m1,0) + COALESCE(f.mat,0) + COALESCE(f.fis,0) + COALESCE(f.qui,0) + COALESCE(f.port,0))
      / NULLIF(
          (CASE WHEN f.m1  IS NULL THEN 0 ELSE 1 END
         + CASE WHEN f.mat IS NULL THEN 0 ELSE 1 END
         + CASE WHEN f.fis IS NULL THEN 0 ELSE 1 END
         + CASE WHEN f.qui IS NULL THEN 0 ELSE 1 END
         + CASE WHEN f.port IS NULL THEN 0 ELSE 1 END), 0)
    )
  END,
  resultado_ciclo = CASE
    WHEN f.concurso = 'IME' THEN CASE
      WHEN f.mat IS NOT NULL AND f.fis IS NOT NULL AND f.qui IS NOT NULL AND f.port IS NOT NULL
      THEN CASE WHEN f.mat>=4 AND f.fis>=4 AND f.qui>=4 AND f.port>=4 THEN 'Aprovado' ELSE 'Reprovado' END
      ELSE 'Em andamento'
    END
    ELSE CASE
      WHEN f.m1 IS NOT NULL AND f.mat IS NOT NULL AND f.fis IS NOT NULL AND f.qui IS NOT NULL AND f.port IS NOT NULL
      THEN CASE WHEN f.mat>=4 AND f.fis>=4 AND f.qui>=4 AND f.port>=4 AND ((f.m1+f.mat+f.fis+f.qui+f.port)/5)>=5 THEN 'Aprovado' ELSE 'Reprovado' END
      ELSE 'Em andamento'
    END
  END
FROM fontes f
WHERE r.fase = 'ranking'
  AND r.id_aluno   = f.id_aluno
  AND r.ciclo_nome = f.ciclo_nome;
