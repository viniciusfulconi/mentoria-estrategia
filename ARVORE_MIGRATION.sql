-- Árvore hierárquica de conteúdo: Matéria > Tópico > Subtópico
-- Execute no Supabase: Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.arvore_materias (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome     TEXT NOT NULL UNIQUE,
  vertical TEXT CHECK (vertical IN ('ITA', 'Medicina')),
  ordem    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.arvore_topicos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id UUID NOT NULL REFERENCES public.arvore_materias(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  ordem      INT NOT NULL DEFAULT 0,
  UNIQUE (materia_id, nome)
);

CREATE TABLE IF NOT EXISTS public.arvore_subtopicos (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topico_id UUID NOT NULL REFERENCES public.arvore_topicos(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  ordem     INT NOT NULL DEFAULT 0,
  UNIQUE (topico_id, nome)
);

CREATE INDEX IF NOT EXISTS arvore_topicos_materia_idx    ON public.arvore_topicos(materia_id);
CREATE INDEX IF NOT EXISTS arvore_subtopicos_topico_idx  ON public.arvore_subtopicos(topico_id);

-- RLS: leitura livre para autenticados, escrita só para admins (controlado no frontend)
ALTER TABLE public.arvore_materias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arvore_topicos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arvore_subtopicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem arvore_materias"   ON public.arvore_materias   FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados leem arvore_topicos"    ON public.arvore_topicos    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados leem arvore_subtopicos" ON public.arvore_subtopicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam arvore_materias"    ON public.arvore_materias   FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins gerenciam arvore_topicos"     ON public.arvore_topicos    FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins gerenciam arvore_subtopicos"  ON public.arvore_subtopicos FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Liga questões ao subtópico da árvore
ALTER TABLE public.questions
  DROP COLUMN IF EXISTS topico_id,
  ADD COLUMN IF NOT EXISTS subtopico_id UUID REFERENCES public.arvore_subtopicos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS questions_subtopico_idx ON public.questions(subtopico_id);
