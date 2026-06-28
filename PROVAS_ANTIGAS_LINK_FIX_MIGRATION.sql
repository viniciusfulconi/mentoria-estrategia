-- Corrige cadastro de prova antiga quebrando com erro 23502:
--   null value in column "link" of relation "provas_antigas" violates not-null constraint
--
-- Contexto: a tabela provas_antigas em produção tinha uma coluna "link" legada,
-- NOT NULL e sem default, sobra de uma versão antiga do schema. O código atual
-- usa pdf_url no lugar e nunca preenche "link", então todo INSERT falhava.
-- A coluna é órfã: nada no código lê ou escreve provas_antigas.link.
--
-- Execute no Supabase: Dashboard > SQL Editor

-- Fix mínimo (aplicado em produção): torna a coluna nullable
ALTER TABLE public.provas_antigas
  ALTER COLUMN link DROP NOT NULL;

-- Limpeza opcional (futuro): remover de vez a coluna morta.
-- Descomente quando quiser. Irreversível.
-- ALTER TABLE public.provas_antigas DROP COLUMN IF EXISTS link;
