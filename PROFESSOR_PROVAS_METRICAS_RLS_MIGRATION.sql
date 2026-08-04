-- ═══════════════════════════════════════════════════════════════════════════
-- Libera as MÉTRICAS DE PROVAS ANTIGAS (ranking / matérias / questões /
-- distribuição) para o papel 'professor'.
--
-- Contexto: a tela /provas-antigas e /provas-antigas/[id] passou a aceitar
-- professor (leitura, sem editar) no front. As tabelas provas_antigas,
-- questoes_prova_antiga, provas_aluno e comentarios_prova já são legíveis por
-- qualquer usuário autenticado (policy "autenticado" using(true)) — então o
-- professor já as enxerga.
--
-- O único bloqueio é correcoes_prova: a policy de SELECT "correcoes_read"
-- (definida em CORRECOES_PROVA_RLS_FIX_MIGRATION.sql) escopa a leitura a
-- coordenador/direção/mentor + o próprio aluno. Sem professor nessa lista, o
-- ranking aparece VAZIO ("Corrigiram: 0") para o professor.
--
-- Fix: professor passa a ler todas as correções, igual ao mentor ITA (acesso
-- de leitura ao ranking completo). A escrita (correcoes_write) NÃO muda.
--
-- Rodar no Supabase → SQL Editor. Efeito é imediato (RLS em runtime); não
-- precisa de deploy de código.
--
-- ⚠️ RLS de produção pode divergir do repo: confira o resultado real com
--    o SELECT de conferência ao final.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "correcoes_read" ON public.correcoes_prova;

CREATE POLICY "correcoes_read" ON public.correcoes_prova FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  );

-- Conferência (opcional): a policy deve listar 'professor' no ARRAY.
-- select policyname, cmd, qual from pg_policies
-- where tablename = 'correcoes_prova';
