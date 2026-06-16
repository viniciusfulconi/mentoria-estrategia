-- ═══════════════════════════════════════════════════════════════════════════
-- Merge dos dois id_alunos do Guilherme Inacio de Carvalho Silva
--   f5e15474 (presencial, mentor Vinícius Fulconi, C2 Aprovado + C3 Reprovado)
--   af412378 (PEC, mentor Antônio Vinícius, C5)
-- Sem conflito de ciclos. Mantém id antigo (preserva histórico).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE resultados SET id_aluno = 'f5e15474' WHERE id_aluno = 'af412378';
UPDATE alunos_dados SET id_aluno = 'f5e15474' WHERE id_aluno = 'af412378';

COMMIT;
