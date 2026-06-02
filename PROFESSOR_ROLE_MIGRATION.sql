-- Adiciona o papel 'professor' ao constraint da tabela perfis
-- Execute no Supabase SQL Editor

ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_papel_check;

ALTER TABLE perfis ADD CONSTRAINT perfis_papel_check
  CHECK (papel IN ('coordenador', 'mentor', 'aluno', 'direcao', 'professor'));
