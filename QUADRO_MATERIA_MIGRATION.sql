-- Adiciona campo materia ao quadro branco
alter table quadros_aluno add column if not exists materia text default 'Geral';
