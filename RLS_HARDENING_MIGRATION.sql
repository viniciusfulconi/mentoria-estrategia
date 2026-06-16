-- ═══════════════════════════════════════════════════════════════════════════
-- RLS HARDENING — substitui políticas permissivas (`using (true)`) por escopo
-- baseado em papel. Helpers auth_papel(), auth_aluno_id(), auth_mentor_nome()
-- já existem em public.
--
-- Idempotente: usa DROP POLICY IF EXISTS para poder rodar de novo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TIER 1 — Dados pessoais / notas (fraude possível com using=true)         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── resultados (notas dos simulados) ──────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"          ON public.resultados;
DROP POLICY IF EXISTS "anon_read_cadastro"   ON public.resultados;
DROP POLICY IF EXISTS "resultados_read"      ON public.resultados;
DROP POLICY IF EXISTS "resultados_read_self" ON public.resultados;
DROP POLICY IF EXISTS "resultados_read_anon" ON public.resultados;
DROP POLICY IF EXISTS "resultados_write"     ON public.resultados;

-- staff lê tudo
CREATE POLICY "resultados_read" ON public.resultados FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND id_aluno = auth_aluno_id())
  );
-- anon (não logado) lê só rankings consolidados (página /aprovados-*)
CREATE POLICY "resultados_read_anon" ON public.resultados FOR SELECT TO anon
  USING (fase = 'ranking');
-- só coord/direcao escreve notas
CREATE POLICY "resultados_write" ON public.resultados FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── simulados (vertical ITA — notas individuais) ──────────────────────────
DROP POLICY IF EXISTS "autenticado"      ON public.simulados;
DROP POLICY IF EXISTS "simulados_read"   ON public.simulados;
DROP POLICY IF EXISTS "simulados_write"  ON public.simulados;

CREATE POLICY "simulados_read" ON public.simulados FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND aluno_id::text = auth_aluno_id())
  );
CREATE POLICY "simulados_write" ON public.simulados FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── simulado_respostas (respostas individuais) ────────────────────────────
DROP POLICY IF EXISTS "acesso_simulado_respostas" ON public.simulado_respostas;
DROP POLICY IF EXISTS "leitura_respostas"         ON public.simulado_respostas;
DROP POLICY IF EXISTS "leitura_scores"            ON public.simulado_respostas;
DROP POLICY IF EXISTS "simulado_respostas_read"   ON public.simulado_respostas;
DROP POLICY IF EXISTS "simulado_respostas_aluno_write" ON public.simulado_respostas;
DROP POLICY IF EXISTS "simulado_respostas_staff_write" ON public.simulado_respostas;

CREATE POLICY "simulado_respostas_read" ON public.simulado_respostas FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND aluno_id::text = auth_aluno_id())
  );
-- aluno escreve/edita só as próprias
CREATE POLICY "simulado_respostas_aluno_write" ON public.simulado_respostas FOR ALL TO authenticated
  USING      (auth_papel() = 'aluno' AND aluno_id::text = auth_aluno_id())
  WITH CHECK (auth_papel() = 'aluno' AND aluno_id::text = auth_aluno_id());
-- staff lê/edita/apaga
CREATE POLICY "simulado_respostas_staff_write" ON public.simulado_respostas FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── simulados_med (config; aluno do vertical lê) ──────────────────────────
DROP POLICY IF EXISTS "acesso_simulados_med" ON public.simulados_med;
DROP POLICY IF EXISTS "simulados_med_read"   ON public.simulados_med;
DROP POLICY IF EXISTS "simulados_med_write"  ON public.simulados_med;

CREATE POLICY "simulados_med_read" ON public.simulados_med FOR SELECT TO authenticated
  USING (true);  -- leitura aberta (config); detalhe sensível fica em outras tabelas
CREATE POLICY "simulados_med_write" ON public.simulados_med FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── respostas_csat (avaliações de mentores) ───────────────────────────────
DROP POLICY IF EXISTS "autenticado"            ON public.respostas_csat;
DROP POLICY IF EXISTS "csat_read_staff"        ON public.respostas_csat;
DROP POLICY IF EXISTS "csat_insert_aluno"      ON public.respostas_csat;
DROP POLICY IF EXISTS "csat_admin"             ON public.respostas_csat;

-- staff lê (mentor vê só as suas)
CREATE POLICY "csat_read_staff" ON public.respostas_csat FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao'])
    OR (auth_papel() = 'mentor' AND mentor = auth_mentor_nome())
  );
-- qualquer autenticado insere (aluno responde; coord faz upload em lote)
CREATE POLICY "csat_insert_aluno" ON public.respostas_csat FOR INSERT TO authenticated
  WITH CHECK (true);
-- só coord/direcao edita/apaga
CREATE POLICY "csat_admin" ON public.respostas_csat FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── respostas_professor (avaliações de professores) ───────────────────────
DROP POLICY IF EXISTS "leitura autenticada"  ON public.respostas_professor;
DROP POLICY IF EXISTS "escrita autenticada"  ON public.respostas_professor;
DROP POLICY IF EXISTS "delete autenticado"   ON public.respostas_professor;
DROP POLICY IF EXISTS "professor_read"       ON public.respostas_professor;
DROP POLICY IF EXISTS "professor_insert"     ON public.respostas_professor;
DROP POLICY IF EXISTS "professor_admin"      ON public.respostas_professor;

CREATE POLICY "professor_read" ON public.respostas_professor FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao'])
    OR (auth_papel() = 'professor' AND professor = (SELECT nome FROM perfis WHERE id = auth.uid()))
  );
CREATE POLICY "professor_insert" ON public.respostas_professor FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "professor_admin" ON public.respostas_professor FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── moedas_saldo (escrita estava aberta — crítico) ────────────────────────
DROP POLICY IF EXISTS "Sistema gerencia saldo" ON public.moedas_saldo;
DROP POLICY IF EXISTS "moedas_saldo_write"     ON public.moedas_saldo;

-- leitura "Autenticados veem saldos" continua (ranking de moedas é público para alunos)
CREATE POLICY "moedas_saldo_write" ON public.moedas_saldo FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TIER 2 — Config destruível (leitura todos, escrita coord/direcao)       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- helper para reusar
-- (não dá pra DRY com função SQL — inline mesmo)

-- ── provas_antigas + questoes_prova_antiga ────────────────────────────────
DROP POLICY IF EXISTS "autenticado"              ON public.provas_antigas;
DROP POLICY IF EXISTS "provas_antigas_read"      ON public.provas_antigas;
DROP POLICY IF EXISTS "provas_antigas_write"     ON public.provas_antigas;

CREATE POLICY "provas_antigas_read" ON public.provas_antigas FOR SELECT TO authenticated USING (true);
CREATE POLICY "provas_antigas_write" ON public.provas_antigas FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

DROP POLICY IF EXISTS "autenticado"                  ON public.questoes_prova_antiga;
DROP POLICY IF EXISTS "questoes_prova_antiga_read"   ON public.questoes_prova_antiga;
DROP POLICY IF EXISTS "questoes_prova_antiga_write"  ON public.questoes_prova_antiga;

CREATE POLICY "questoes_prova_antiga_read" ON public.questoes_prova_antiga FOR SELECT TO authenticated USING (true);
CREATE POLICY "questoes_prova_antiga_write" ON public.questoes_prova_antiga FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── concursos ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"        ON public.concursos;
DROP POLICY IF EXISTS "concursos_read"     ON public.concursos;
DROP POLICY IF EXISTS "concursos_write"    ON public.concursos;

CREATE POLICY "concursos_read" ON public.concursos FOR SELECT TO authenticated USING (true);
CREATE POLICY "concursos_write" ON public.concursos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── aulas ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"    ON public.aulas;
DROP POLICY IF EXISTS "aulas_read"     ON public.aulas;
DROP POLICY IF EXISTS "aulas_write"    ON public.aulas;

CREATE POLICY "aulas_read" ON public.aulas FOR SELECT TO authenticated USING (true);
CREATE POLICY "aulas_write" ON public.aulas FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']));

-- ── arvore_* (config da árvore de conteúdo) ───────────────────────────────
DROP POLICY IF EXISTS "Admins gerenciam arvore_materias"   ON public.arvore_materias;
DROP POLICY IF EXISTS "Admins gerenciam arvore_topicos"    ON public.arvore_topicos;
DROP POLICY IF EXISTS "Admins gerenciam arvore_subtopicos" ON public.arvore_subtopicos;
DROP POLICY IF EXISTS "arvore_materias_write"   ON public.arvore_materias;
DROP POLICY IF EXISTS "arvore_topicos_write"    ON public.arvore_topicos;
DROP POLICY IF EXISTS "arvore_subtopicos_write" ON public.arvore_subtopicos;

CREATE POLICY "arvore_materias_write" ON public.arvore_materias FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));
CREATE POLICY "arvore_topicos_write" ON public.arvore_topicos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));
CREATE POLICY "arvore_subtopicos_write" ON public.arvore_subtopicos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- arvore_areas pode não existir em todos os ambientes; só aplica se existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='arvore_areas') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Autenticados leem arvore_areas" ON public.arvore_areas';
    EXECUTE 'DROP POLICY IF EXISTS "arvore_areas_write" ON public.arvore_areas';
    EXECUTE 'CREATE POLICY "arvore_areas_read" ON public.arvore_areas FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "arvore_areas_write" ON public.arvore_areas FOR ALL TO authenticated '
         || 'USING (auth_papel() = ANY (ARRAY[''coordenador'',''direcao''])) '
         || 'WITH CHECK (auth_papel() = ANY (ARRAY[''coordenador'',''direcao'']))';
  END IF;
END $$;

-- ── simulado_questoes + simulado_templates ────────────────────────────────
DROP POLICY IF EXISTS "acesso_simulado_questoes"    ON public.simulado_questoes;
DROP POLICY IF EXISTS "simulado_questoes_read"      ON public.simulado_questoes;
DROP POLICY IF EXISTS "simulado_questoes_write"     ON public.simulado_questoes;

CREATE POLICY "simulado_questoes_read" ON public.simulado_questoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "simulado_questoes_write" ON public.simulado_questoes FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

DROP POLICY IF EXISTS "leitura_simulado_templates"  ON public.simulado_templates;
DROP POLICY IF EXISTS "escrita_simulado_templates"  ON public.simulado_templates;
DROP POLICY IF EXISTS "simulado_templates_read"     ON public.simulado_templates;
DROP POLICY IF EXISTS "simulado_templates_write"    ON public.simulado_templates;

CREATE POLICY "simulado_templates_read" ON public.simulado_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "simulado_templates_write" ON public.simulado_templates FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ── turmas + topicos (legacy) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "autenticado"     ON public.turmas;
DROP POLICY IF EXISTS "turmas_read"     ON public.turmas;
DROP POLICY IF EXISTS "turmas_write"    ON public.turmas;

CREATE POLICY "turmas_read" ON public.turmas FOR SELECT TO authenticated USING (true);
CREATE POLICY "turmas_write" ON public.turmas FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

DROP POLICY IF EXISTS "autenticado"     ON public.topicos;
DROP POLICY IF EXISTS "topicos_read"    ON public.topicos;
DROP POLICY IF EXISTS "topicos_write"   ON public.topicos;

CREATE POLICY "topicos_read" ON public.topicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "topicos_write" ON public.topicos FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao']));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ TIER 3 — Aluno só vê o próprio                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── notificacoes ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acesso_publico"  ON public.notificacoes;
DROP POLICY IF EXISTS "notif_read"      ON public.notificacoes;
DROP POLICY IF EXISTS "notif_write"     ON public.notificacoes;

CREATE POLICY "notif_read" ON public.notificacoes FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  );
-- aluno marca como lida; coord apaga
CREATE POLICY "notif_write" ON public.notificacoes FOR ALL TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  )
  WITH CHECK (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  );

-- ── quadros_aluno ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acesso_publico" ON public.quadros_aluno;
DROP POLICY IF EXISTS "quadros_read"   ON public.quadros_aluno;
DROP POLICY IF EXISTS "quadros_write"  ON public.quadros_aluno;

CREATE POLICY "quadros_read" ON public.quadros_aluno FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  );
CREATE POLICY "quadros_write" ON public.quadros_aluno FOR ALL TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  )
  WITH CHECK (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  );

-- ── salas_videochamada ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acesso_publico" ON public.salas_videochamada;
DROP POLICY IF EXISTS "salas_read"     ON public.salas_videochamada;
DROP POLICY IF EXISTS "salas_write"    ON public.salas_videochamada;

CREATE POLICY "salas_read" ON public.salas_videochamada FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor','professor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  );
CREATE POLICY "salas_write" ON public.salas_videochamada FOR ALL TO authenticated
  USING      (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']))
  WITH CHECK (auth_papel() = ANY (ARRAY['coordenador','direcao','mentor']));
