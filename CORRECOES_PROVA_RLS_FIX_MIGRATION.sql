-- ═══════════════════════════════════════════════════════════════════════════
-- Corrige a visibilidade das correções de Provas Antigas para MENTORES.
--
-- Sintoma: no ranking de uma prova, o mentor via só as correções dos SEUS
-- alunos (ex.: "Corrigiram: 9") enquanto o coordenador via todas ("47").
-- "Atribuídos" (142) era igual porque provas_aluno não é escopada — só a
-- leitura de correcoes_prova estava restrita ao mentor.
--
-- Causa: a policy de SELECT "correcoes_read" escopava o papel 'mentor' aos
-- próprios alunos:
--     (auth_papel() = 'mentor' AND aluno_id IN (
--        SELECT id_aluno FROM alunos_dados WHERE mentor = auth_mentor_nome()))
-- Mas a tela de Provas Antigas dá ao mentor ITA acesso de LEITURA ao ranking
-- COMPLETO. A policy ficou incoerente com a feature.
--
-- Fix: mentor passa a ler todas as correções (como coordenador/direção).
-- Aluno continua vendo apenas a própria. A escrita (correcoes_write) NÃO é
-- alterada — submissão do aluno e ajuste do coordenador seguem iguais.
--
-- Rodar no Supabase → SQL Editor. Efeito é imediato (RLS em runtime); não
-- precisa de deploy de código.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "correcoes_read" ON public.correcoes_prova;

CREATE POLICY "correcoes_read" ON public.correcoes_prova FOR SELECT TO authenticated
  USING (
    auth_papel() = ANY (ARRAY['coordenador','direcao','mentor'])
    OR (auth_papel() = 'aluno' AND aluno_id = auth_aluno_id())
  );

-- Conferência (opcional): depois de rodar, a policy deve aparecer sem o
-- subselect por mentor.
-- select policyname, cmd, qual from pg_policies
-- where tablename = 'correcoes_prova';
