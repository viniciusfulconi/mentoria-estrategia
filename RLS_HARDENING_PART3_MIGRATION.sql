-- ─────────────────────────────────────────────────────────────────────────────
-- RLS_HARDENING_PART3_MIGRATION.sql
--
-- Fecha policies permissivas legadas que sobreviveram aos hardenings anteriores
-- (policies são OR entre si — uma permissiva anula a restritiva da mesma ação).
-- Auditoria feita direto no pg_policies de produção em 2026-07-06.
--
-- ⚠️ DEPENDÊNCIA DE DEPLOY: os DROPs de `resultados_read_anon`, `leitura_alunos`
-- e `leitura_mentores` quebram o /cadastro e a videochamada ANTES do deploy do
-- front que acompanha esta migration (API /api/cadastro/opcoes + gate de auth
-- na videochamada). Aplicar a migration JUNTO com o deploy, ou logo após.
--
-- O que cada bloco fecha:
--   1. transferir_penas    — SECURITY DEFINER sem validação de chamador e com
--                            EXECUTE para anon/PUBLIC: qualquer pessoa deslogada
--                            podia drenar penas de qualquer aluno.
--   2. quadros_aluno       — "acesso_publico" (ALL p/ role public): leitura e
--                            escrita anônimas em qualquer quadro.
--   3. resultados          — "resultados_read_anon": anônimo lia nome+notas de
--                            todos (o /cadastro dependia disso; agora usa API).
--   4. alunos / mentores   — SELECT público das tabelas inteiras.
--   5. desafios_respostas  — qualquer logado lia todas e podia UPDATE em
--                            qualquer uma (aluno se auto-validava e ganhava penas).
--   6. moedas_transacoes   — INSERT liberado a qualquer logado; leitura de todas.
--   7. loja_compras        — leitura de todas as compras por qualquer logado.
--   8. avaliacoes_professores — INSERT/DELETE/SELECT livres p/ qualquer logado.
--   9. questoes_progresso / progresso_subtopicos — "Coordenador lê..." com
--                            qual=true (na prática, todo mundo lia tudo).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. transferir_penas: exigir que o pagador seja o chamador (ou staff) ─────
CREATE OR REPLACE FUNCTION public.transferir_penas(
  p_de uuid, p_para uuid, p_qtd integer,
  p_desc text DEFAULT 'Transferência entre alunos'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR (p_de <> auth.uid() AND auth_papel() NOT IN ('coordenador','direcao')) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;
  IF p_qtd <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;

  UPDATE public.moedas_saldo SET saldo = saldo - p_qtd, updated_at = NOW()
  WHERE aluno_id = p_de AND saldo >= p_qtd;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  INSERT INTO public.moedas_saldo (aluno_id, saldo)
  VALUES (p_para, p_qtd)
  ON CONFLICT (aluno_id) DO UPDATE SET saldo = moedas_saldo.saldo + p_qtd, updated_at = NOW();

  INSERT INTO public.moedas_transacoes (aluno_id, tipo, valor, descricao)
  VALUES (p_de,   'transferencia_out', -p_qtd, p_desc),
         (p_para, 'transferencia_in',   p_qtd, p_desc);
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_penas(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_penas(uuid, uuid, integer, text) TO authenticated;

-- ── 2. quadros_aluno: fim da leitura/escrita anônima ─────────────────────────
-- As policies restritivas quadros_read/quadros_write (hardening pt.1) permanecem.
DROP POLICY IF EXISTS "acesso_publico" ON public.quadros_aluno;

-- ── 3. resultados: fim da leitura anônima do ranking ─────────────────────────
-- /cadastro passa a usar /api/cadastro/opcoes (service role no servidor).
DROP POLICY IF EXISTS "resultados_read_anon" ON public.resultados;

-- ── 4. alunos e mentores: fim do SELECT público ──────────────────────────────
-- alunos_read/mentores_read (authenticated) permanecem. Aluno Medicina resolve a
-- própria linha por email (fluxo do quadro, perfis.aluno_id nulo) → policy nova.
DROP POLICY IF EXISTS "leitura_alunos" ON public.alunos;
DROP POLICY IF EXISTS "leitura_mentores" ON public.mentores;

CREATE POLICY "alunos_read_self_email" ON public.alunos FOR SELECT TO authenticated
  USING (auth_papel() = 'aluno' AND email = (auth.jwt() ->> 'email'));

-- ── 5. desafios_respostas: aluno não lê/valida resposta dos outros ───────────
-- Permanecem: "Aluno vê suas respostas" (SELECT own) e "Aluno insere resposta".
DROP POLICY IF EXISTS "Coordenador lê todas as respostas" ON public.desafios_respostas;
DROP POLICY IF EXISTS "Coordenador valida respostas" ON public.desafios_respostas;

CREATE POLICY "respostas_staff_read" ON public.desafios_respostas FOR SELECT TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao']));

CREATE POLICY "respostas_staff_update" ON public.desafios_respostas FOR UPDATE TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── 6. moedas_transacoes: só staff insere/lê tudo (aluno lê as próprias) ─────
-- /api/penas/creditar roda com o JWT do coordenador → coberto pela policy staff.
-- transferir_penas/creditar_saldo são SECURITY DEFINER → não dependem de policy.
DROP POLICY IF EXISTS "Sistema insere transações" ON public.moedas_transacoes;
DROP POLICY IF EXISTS "Coordenador vê todas as transações" ON public.moedas_transacoes;

CREATE POLICY "transacoes_staff_read" ON public.moedas_transacoes FOR SELECT TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao']));

CREATE POLICY "transacoes_staff_insert" ON public.moedas_transacoes FOR INSERT TO authenticated
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── 7. loja_compras: leitura geral só para staff ─────────────────────────────
-- "Aluno vê suas compras" / "Aluno insere compra" permanecem.
DROP POLICY IF EXISTS "Coordenador vê todas as compras" ON public.loja_compras;

CREATE POLICY "compras_staff_read" ON public.loja_compras FOR SELECT TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── 8. avaliacoes_professores: leitura p/ staff, escrita/delete p/ gestão ────
DROP POLICY IF EXISTS "leitura autenticada" ON public.avaliacoes_professores;
DROP POLICY IF EXISTS "escrita autenticada" ON public.avaliacoes_professores;
DROP POLICY IF EXISTS "delete autenticado" ON public.avaliacoes_professores;

CREATE POLICY "avaliacoes_staff_read" ON public.avaliacoes_professores FOR SELECT TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor']));

CREATE POLICY "avaliacoes_gestor_insert" ON public.avaliacoes_professores FOR INSERT TO authenticated
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

CREATE POLICY "avaliacoes_gestor_delete" ON public.avaliacoes_professores FOR DELETE TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── 9. progresso: "Coordenador lê..." com qual=true valia para todo mundo ────
-- progresso_subtopicos já tem policy staff correta (hardening pt.2); a extra cai.
DROP POLICY IF EXISTS "Coordenador lê todo progresso" ON public.progresso_subtopicos;
DROP POLICY IF EXISTS "Coordenador lê todo progresso" ON public.questoes_progresso;

CREATE POLICY "questoes_progresso_staff_read" ON public.questoes_progresso FOR SELECT TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor']));
