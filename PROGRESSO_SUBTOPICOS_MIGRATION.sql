-- Migração do progresso do cronograma para a nova árvore
-- Execute no Supabase: Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.progresso_subtopicos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id     TEXT NOT NULL,
  subtopico_id UUID NOT NULL REFERENCES public.arvore_subtopicos(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'nao_iniciada'
                 CHECK (status IN ('nao_iniciada', 'em_andamento', 'finalizada')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aluno_id, subtopico_id)
);

CREATE INDEX IF NOT EXISTS ps_aluno_idx     ON public.progresso_subtopicos(aluno_id);
CREATE INDEX IF NOT EXISTS ps_subtopico_idx ON public.progresso_subtopicos(subtopico_id);

ALTER TABLE public.progresso_subtopicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aluno acessa próprio progresso"
  ON public.progresso_subtopicos FOR ALL
  TO authenticated
  USING (auth.uid()::text = aluno_id OR auth.uid()::text = aluno_id)
  WITH CHECK (true);

CREATE POLICY "Coordenador lê todo progresso"
  ON public.progresso_subtopicos FOR SELECT
  TO authenticated USING (true);
