-- Adiciona coluna pdf_resolucao_url em provas_antigas
-- PDF de resolução é mostrado ao aluno SOMENTE depois de corrigir a prova
-- Execute no Supabase: Dashboard > SQL Editor

ALTER TABLE public.provas_antigas
  ADD COLUMN IF NOT EXISTS pdf_resolucao_url text;
