-- ═══════════════════════════════════════════════════════════════════════════
-- RLS HARDENING PART 2 — tabelas que ficaram de fora da rodada anterior
-- ═══════════════════════════════════════════════════════════════════════════

-- ── progresso_subtopicos (BUG: WITH CHECK era true — aluno podia inserir
--    progresso de outro aluno). Reaperta também o INSERT/UPDATE.
DROP POLICY IF EXISTS "Aluno acessa próprio progresso" ON public.progresso_subtopicos;
DROP POLICY IF EXISTS "progresso_subtopicos_self"     ON public.progresso_subtopicos;
DROP POLICY IF EXISTS "progresso_subtopicos_staff"    ON public.progresso_subtopicos;

CREATE POLICY "progresso_subtopicos_self" ON public.progresso_subtopicos FOR ALL TO authenticated
  USING      ((auth.uid())::text = aluno_id)
  WITH CHECK ((auth.uid())::text = aluno_id);
CREATE POLICY "progresso_subtopicos_staff" ON public.progresso_subtopicos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']));

-- ── alunos (cadastro de alunos) ───────────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"  ON public.alunos;
DROP POLICY IF EXISTS "alunos_read"  ON public.alunos;
DROP POLICY IF EXISTS "alunos_write" ON public.alunos;

CREATE POLICY "alunos_read" ON public.alunos FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND id::text = auth_aluno_id())
  );
CREATE POLICY "alunos_write" ON public.alunos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── alunos_dados (view materializada com dados de aluno) ──────────────────
DROP POLICY IF EXISTS "autenticado"        ON public.alunos_dados;
DROP POLICY IF EXISTS "alunos_dados_read"  ON public.alunos_dados;
DROP POLICY IF EXISTS "alunos_dados_write" ON public.alunos_dados;

CREATE POLICY "alunos_dados_read" ON public.alunos_dados FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND id_aluno = auth_aluno_id())
  );
CREATE POLICY "alunos_dados_write" ON public.alunos_dados FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── mentores ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"     ON public.mentores;
DROP POLICY IF EXISTS "mentores_read"   ON public.mentores;
DROP POLICY IF EXISTS "mentores_write"  ON public.mentores;

CREATE POLICY "mentores_read" ON public.mentores FOR SELECT TO authenticated USING (true);
CREATE POLICY "mentores_write" ON public.mentores FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── atendimentos (tabela legacy?) ─────────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"          ON public.atendimentos;
DROP POLICY IF EXISTS "atendimentos_read"    ON public.atendimentos;
DROP POLICY IF EXISTS "atendimentos_write"   ON public.atendimentos;

CREATE POLICY "atendimentos_read" ON public.atendimentos FOR SELECT TO authenticated
  USING (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']));
CREATE POLICY "atendimentos_write" ON public.atendimentos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']));

-- ── atividades (agenda de horário) ────────────────────────────────────────
DROP POLICY IF EXISTS "atividades_write"  ON public.atividades;
DROP POLICY IF EXISTS "atividades_read"   ON public.atividades;

CREATE POLICY "atividades_read" ON public.atividades FOR SELECT TO authenticated USING (true);
CREATE POLICY "atividades_write" ON public.atividades FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']));

-- ── loja_produtos ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coordenador gerencia produtos"  ON public.loja_produtos;
DROP POLICY IF EXISTS "loja_produtos_read"   ON public.loja_produtos;
DROP POLICY IF EXISTS "loja_produtos_write"  ON public.loja_produtos;

CREATE POLICY "loja_produtos_read" ON public.loja_produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "loja_produtos_write" ON public.loja_produtos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── pesquisas_csat ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"          ON public.pesquisas_csat;
DROP POLICY IF EXISTS "pesquisas_csat_read"  ON public.pesquisas_csat;
DROP POLICY IF EXISTS "pesquisas_csat_write" ON public.pesquisas_csat;

CREATE POLICY "pesquisas_csat_read" ON public.pesquisas_csat FOR SELECT TO authenticated USING (true);
CREATE POLICY "pesquisas_csat_write" ON public.pesquisas_csat FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));
