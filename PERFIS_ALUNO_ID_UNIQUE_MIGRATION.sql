-- #3 — impede que DOIS perfis reivindiquem o mesmo aluno_id (hijack de notas).
-- Contexto: o cadastro deixa o usuário escolher aluno_id de um dropdown com todos
-- os alunos; perfis.aluno_id é a chave que puxa as notas (resultados.id_aluno).
-- Sem unicidade, dois cadastros podiam apontar para o mesmo aluno.
-- Verificado em 2026-07: nenhuma duplicata existente, então o índice único é seguro.
-- A tela de aprovação (app/admin) agora mostra o nome do aluno vinculado p/ conferência.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uniq_perfis_aluno_id
  ON public.perfis (aluno_id)
  WHERE aluno_id IS NOT NULL;
