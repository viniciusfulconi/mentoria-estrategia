-- ═══════════════════════════════════════════════════════════════════════════
-- Limpeza pós-sanity check (2026-06-16):
--
-- 1) Deleta 3 linhas fantasma — registros em CAIXA ALTA com tudo zerado
--    que duplicam um registro Title Case válido (mesmo id_aluno+ciclo+fase).
--    Causa provável: upload pegou o aluno duas vezes em abas com case
--    diferente do nome.
--
-- 2) Padroniza nome em INITCAP para 3 alunos que só existem em CAIXA ALTA
--    no banco (Matheus, Ricardo, João Victor). Preserva todos os dados.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Deleta os 3 ghosts ────────────────────────────────────────────────
-- João Pedro Gomes Gonçalves — Ciclo 3, 1fase (versão Title Case tem m1f=8.06)
DELETE FROM resultados
WHERE id = '0ae6aacd-3420-4f98-8470-4ea76cff5806'
  AND nome_aluno = UPPER(nome_aluno);

-- Gustavo de Aguiar Medeiros — Ciclo 2, 2fase_port (Title Case tem port=9.00)
DELETE FROM resultados
WHERE id = '50f9b736-e8cd-46da-a128-899265bfd34c'
  AND nome_aluno = UPPER(nome_aluno);

-- Gabriela Souza Almeida — Ciclo 1, 2fase_port (Title Case tem port=8.00, red=5.60)
DELETE FROM resultados
WHERE id = '651bae64-ed05-41e9-a53b-17192d29b92a'
  AND nome_aluno = UPPER(nome_aluno);

-- ── 2. Padroniza nomes em CAIXA ALTA ─────────────────────────────────────
-- Aplica INITCAP só nos 3 id_alunos que só existem em uppercase.
UPDATE resultados
SET nome_aluno = INITCAP(nome_aluno)
WHERE id_aluno IN ('23f7eed1', '66df1577', 'd1594f69')
  AND nome_aluno = UPPER(nome_aluno);
