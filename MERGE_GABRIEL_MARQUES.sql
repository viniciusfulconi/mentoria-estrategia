-- ═══════════════════════════════════════════════════════════════════════════
-- Remove cadastro PEC duplicado do Gabriel Marques
--
--   7aef92af = Gabriel Marques Guedes (presencial, mentor Heitor Cruz)
--     • Perfil de login: gabrielmguedes2@gmail.com
--     • 5 ciclos completos em resultados (C1-C5, todas as matérias)
--     • Histórico em correcoes_prova / provas_aluno
--
--   e9fe62c7 = Gabriel Marques (PEC, mentor Antônio Vinícius)
--     • Falso PEC: cruzou no import e gerou cadastro extra
--     • Sem perfil, sem provas, sem moedas — só 8 linhas em resultados
--       (C1-C3, só m1 + port) que viraram m2f=10.00 no C2 e jogaram ele
--       como 1º geral no ranking porque a fórmula PEC usa só linguagens.
--
-- Como nenhum dado do PEC é resgatável (presencial já tem tudo, com nota
-- real de mat/fis/qui), basta apagar id_aluno=e9fe62c7 das duas tabelas
-- onde ele aparece.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM resultados   WHERE id_aluno = 'e9fe62c7';
DELETE FROM alunos_dados WHERE id_aluno = 'e9fe62c7';

-- Sanity check
SELECT 'resultados'   AS tabela, COUNT(*) AS n FROM resultados   WHERE id_aluno = 'e9fe62c7'
UNION ALL
SELECT 'alunos_dados',          COUNT(*)        FROM alunos_dados WHERE id_aluno = 'e9fe62c7';

COMMIT;
