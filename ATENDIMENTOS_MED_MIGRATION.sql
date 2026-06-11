-- Atendimentos Medicina — adiciona coluna vertical
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run

alter table atendimentos_mentoria
  add column if not exists vertical text default 'ITA';

-- Índice para filtrar por vertical rapidamente
create index if not exists idx_atendimentos_vertical on atendimentos_mentoria (vertical);
