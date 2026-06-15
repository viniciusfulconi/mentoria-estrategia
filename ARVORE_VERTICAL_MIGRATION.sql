-- Adiciona coluna vertical em arvore_topicos e arvore_subtopicos
-- Hoje vertical só existe em arvore_materias — para suportar Medicina sem JOIN
-- Execute no Supabase: Dashboard > SQL Editor

ALTER TABLE public.arvore_topicos
  ADD COLUMN IF NOT EXISTS vertical TEXT;

ALTER TABLE public.arvore_subtopicos
  ADD COLUMN IF NOT EXISTS vertical TEXT;

-- Popular vertical em arvore_topicos a partir da matéria pai
UPDATE public.arvore_topicos t
   SET vertical = m.vertical
  FROM public.arvore_materias m
 WHERE t.materia_id = m.id
   AND t.vertical IS NULL;

-- Popular vertical em arvore_subtopicos via JOIN tópico
UPDATE public.arvore_subtopicos s
   SET vertical = t.vertical
  FROM public.arvore_topicos t
 WHERE s.topico_id = t.id
   AND s.vertical IS NULL;

CREATE INDEX IF NOT EXISTS arvore_topicos_vertical_idx    ON public.arvore_topicos(vertical);
CREATE INDEX IF NOT EXISTS arvore_subtopicos_vertical_idx ON public.arvore_subtopicos(vertical);
