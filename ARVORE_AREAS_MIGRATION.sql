-- Camada extra na árvore: Área (Física, Matemática, Química, Português)
-- Reagrupa as 69 entradas de arvore_materias em 4 áreas pais.
-- Execute no Supabase: Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.arvore_areas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT NOT NULL,
  vertical  TEXT NOT NULL,
  ordem     INT  NOT NULL DEFAULT 0,
  UNIQUE (nome, vertical)
);

ALTER TABLE public.arvore_materias
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES public.arvore_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS arvore_materias_area_idx ON public.arvore_materias(area_id);

ALTER TABLE public.arvore_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem arvore_areas" ON public.arvore_areas;
CREATE POLICY "Autenticados leem arvore_areas"
  ON public.arvore_areas FOR SELECT
  TO authenticated USING (true);

-- Áreas do ITA
INSERT INTO public.arvore_areas (nome, vertical, ordem) VALUES
  ('Física',      'ITA', 0),
  ('Português',   'ITA', 1),
  ('Química',     'ITA', 2),
  ('Matemática',  'ITA', 3)
ON CONFLICT (nome, vertical) DO NOTHING;

-- Vincular as 69 matérias às 4 áreas conforme faixas de ordem
UPDATE public.arvore_materias m
   SET area_id = a.id
  FROM public.arvore_areas a
 WHERE a.vertical = 'ITA' AND a.nome = 'Física'
   AND m.vertical = 'ITA' AND m.ordem BETWEEN 0 AND 8;

UPDATE public.arvore_materias m
   SET area_id = a.id
  FROM public.arvore_areas a
 WHERE a.vertical = 'ITA' AND a.nome = 'Português'
   AND m.vertical = 'ITA' AND m.ordem BETWEEN 9 AND 26;

UPDATE public.arvore_materias m
   SET area_id = a.id
  FROM public.arvore_areas a
 WHERE a.vertical = 'ITA' AND a.nome = 'Química'
   AND m.vertical = 'ITA' AND m.ordem BETWEEN 27 AND 50;

UPDATE public.arvore_materias m
   SET area_id = a.id
  FROM public.arvore_areas a
 WHERE a.vertical = 'ITA' AND a.nome = 'Matemática'
   AND m.vertical = 'ITA' AND m.ordem BETWEEN 51 AND 68;
