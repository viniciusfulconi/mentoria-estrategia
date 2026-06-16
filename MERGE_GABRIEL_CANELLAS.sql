-- ═══════════════════════════════════════════════════════════════════════════
-- Merge dos dois id_alunos do Gabriel Canellas Caetano
-- Estava aparecendo duas vezes em /cadastro porque tinha rankings em 2 ids:
--   4211dde3 (presencial, mentor Victor So, até C4)
--   b6ebc6ac (PEC, mentor Antônio Vinícius, C4 port + C5 completo)
--
-- Mantém o id antigo (4211dde3, preserva histórico) e migra dados do novo
-- para esse id. Para C4 ranking onde ambos têm linha, mescla manualmente
-- adicionando media_linguagens do PEC ao presencial.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Mescla a linha C4 ranking: presencial recebe media_linguagens do PEC
--    e recalcula media_2fase + resultado_ciclo
UPDATE resultados
SET
  media_linguagens = 6.0,
  -- ITA: (m1 + mat + fis + qui + ling) / N_presentes
  -- m1=5.83, mat=4.0, fis=0, qui=4.9, ling=6.0 → 5 valores presentes
  -- Mas fis=0 conta como presente (era 0 no presencial)
  media_2fase = ROUND(((5.83 + 4.0 + 0.0 + 4.9 + 6.0) / 5)::numeric, 4),
  -- Regra ITA: tudo presente, fis<4 → Reprovado
  resultado_ciclo = 'Reprovado'
WHERE id_aluno = '4211dde3' AND ciclo_nome = 'Ciclo 4' AND fase = 'ranking';

-- 2. Migra todas as outras linhas de b6ebc6ac → 4211dde3
--    (exceto C4 ranking que já foi mesclado acima)
UPDATE resultados
SET id_aluno = '4211dde3'
WHERE id_aluno = 'b6ebc6ac'
  AND NOT (ciclo_nome = 'Ciclo 4' AND fase = 'ranking');

-- 3. Deleta a linha C4 ranking do id antigo PEC (já foi mesclada)
DELETE FROM resultados
WHERE id_aluno = 'b6ebc6ac' AND ciclo_nome = 'Ciclo 4' AND fase = 'ranking';

-- 4. Atualiza alunos_dados: troca id_aluno b6ebc6ac → 4211dde3,
--    mantém mentor atual (Antônio Vinícius — atual mentor PEC) e ingresso='PEC'
UPDATE alunos_dados
SET id_aluno = '4211dde3'
WHERE id_aluno = 'b6ebc6ac';

-- 5. Confirma o merge
SELECT id_aluno, ciclo_nome, fase, mentor,
       ROUND(media_1fase::numeric,2) AS m1,
       ROUND(nota_matematica::numeric,2) AS mat,
       ROUND(nota_fisica::numeric,2) AS fis,
       ROUND(nota_quimica::numeric,2) AS qui,
       ROUND(media_linguagens::numeric,2) AS ling,
       ROUND(media_2fase::numeric,2) AS m2f,
       resultado_ciclo
FROM resultados
WHERE id_aluno = '4211dde3'
ORDER BY ciclo_nome, fase;

COMMIT;
