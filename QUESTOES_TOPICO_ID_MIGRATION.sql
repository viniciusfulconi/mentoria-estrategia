-- Integração banco de questões com tabela topicos existente
-- Execute no Supabase: Dashboard > SQL Editor

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS topico_id UUID REFERENCES public.topicos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS questions_topico_id_idx ON public.questions(topico_id);
