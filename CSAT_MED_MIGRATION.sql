-- CSAT Medicina — 2 colunas extras em respostas_csat
-- Cole no Supabase: Dashboard → SQL Editor → New query → Run

alter table respostas_csat
  add column if not exists rapidez_respostas        numeric,
  add column if not exists personalizacao_realidade numeric;
