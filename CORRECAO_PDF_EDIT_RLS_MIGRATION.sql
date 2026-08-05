-- ═══════════════════════════════════════════════════════════════════════════
-- Permite ao ALUNO editar a PRÓPRIA correção de prova antiga (UPDATE).
--
-- Motivo: alguns alunos confirmaram a correção de provas DISCURSIVAS sem
-- anexar o PDF da dissertativa. A tela /minhas-provas/[id] passou a oferecer
-- um botão "Anexar/trocar PDF da correção" que faz UPDATE em correcoes_prova
-- (só o campo pdf_correcao_url). Para isso o aluno precisa de permissão de
-- UPDATE na própria linha.
--
-- A RLS de produção diverge do repo (a policy de escrita "correcoes_write"
-- foi criada direto no banco). Se ela for INSERT-only, o UPDATE do aluno é
-- barrado. Esta migration adiciona uma policy de UPDATE dedicada, idempotente
-- e restrita à própria linha do aluno. Policies são OR'd, então é seguro
-- mesmo que já exista uma FOR ALL cobrindo o caso.
--
-- Rodar no Supabase → SQL Editor. Efeito imediato (RLS em runtime); não
-- precisa deploy do banco. Só faça se o UPDATE do aluno for bloqueado.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "correcoes_aluno_update" ON public.correcoes_prova;

CREATE POLICY "correcoes_aluno_update" ON public.correcoes_prova
  FOR UPDATE TO authenticated
  USING (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  WITH CHECK (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id());

-- Conferência (opcional):
-- select policyname, cmd, qual, with_check from pg_policies
-- where tablename = 'correcoes_prova';
