-- Adiciona o papel 'direcao' à constraint da tabela perfis
-- Execute este script no SQL Editor do Supabase

ALTER TABLE perfis
  DROP CONSTRAINT IF EXISTS perfis_papel_check;

ALTER TABLE perfis
  ADD CONSTRAINT perfis_papel_check
  CHECK (papel IN ('coordenador', 'mentor', 'aluno', 'direcao'));
