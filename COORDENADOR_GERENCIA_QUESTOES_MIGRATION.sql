-- ═══════════════════════════════════════════════════════════════════════════
-- Coordenador/Direção podem EDITAR e EXCLUIR qualquer questão
-- ───────────────────────────────────────────────────────────────────────────
-- Hoje a tabela public.questions só permite UPDATE/DELETE pelo criador
-- (policies "Criador edita questão" / "Criador exclui questão", que exigem
-- auth.uid() = created_by). Questões importadas em massa (created_by NULL) ou
-- criadas por outra pessoa ficam ineditáveis pela interface, mesmo para o
-- coordenador — embora o botão "Editar" apareça para ele.
--
-- Esta migration adiciona policies que permitem a coordenador e direção
-- gerenciar (UPDATE/DELETE) QUALQUER questão. Usa o helper auth_papel(), já
-- existente em public (ver RLS_HARDENING_MIGRATION.sql).
--
-- Idempotente: pode rodar de novo (DROP POLICY IF EXISTS).
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar > Run.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Gestor edita qualquer questão"  ON public.questions;
DROP POLICY IF EXISTS "Gestor exclui qualquer questão" ON public.questions;

CREATE POLICY "Gestor edita qualquer questão"
  ON public.questions FOR UPDATE
  TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

CREATE POLICY "Gestor exclui qualquer questão"
  ON public.questions FOR DELETE
  TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- As policies "Criador edita questão" / "Criador exclui questão" continuam
-- valendo (professores seguem editando as próprias questões). Policies
-- permissivas no PostgreSQL são combinadas por OR.
