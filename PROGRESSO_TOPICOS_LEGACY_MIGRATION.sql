-- Renomeia tabela legada para marcá-la como histórico
-- progresso_topicos: 4827 registros do cronograma antigo, sem código que leia
-- A árvore nova (arvore_*) usa progresso_subtopicos
-- Execute no Supabase: Dashboard > SQL Editor

ALTER TABLE IF EXISTS public.progresso_topicos
  RENAME TO progresso_topicos_legacy;
