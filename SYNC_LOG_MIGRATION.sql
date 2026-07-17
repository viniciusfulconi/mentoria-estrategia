-- ─────────────────────────────────────────────────────────────────────────────
-- SYNC_LOG — registro de cada execução do sync automático da planilha de
-- simulados (Vercel Cron → app/api/sync-simulados). Serve de dead man's switch:
-- o app acende um banner se a última execução OK for antiga demais (job morto).
--
-- Rodar no Supabase: Dashboard → SQL Editor → New query → Run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists sync_log (
  id uuid default gen_random_uuid() primary key,
  executado_em timestamptz default now(),
  status text not null,               -- ok | skipped | ciclo_novo | erro
  hash text,                          -- sha256 do conteúdo mapeado (skip se igual)
  ciclos_tocados text[],
  linhas_inseridas int default 0,
  linhas_atualizadas int default 0,
  avisos jsonb,                       -- { origem, avisos[], ciclos_novos[], ... }
  erro text,
  duracao_ms int
);

create index if not exists idx_sync_log_executado_em on sync_log (executado_em desc);
create index if not exists idx_sync_log_status_data   on sync_log (status, executado_em desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Leitura só para gestão (coordenador/direcao). A escrita é feita pelo cron com
-- service_role, que faz BYPASS de RLS — por isso não há policy de INSERT.
alter table sync_log enable row level security;

drop policy if exists "sync_log_read" on sync_log;
create policy "sync_log_read" on sync_log for select to authenticated
  using (auth_papel() = any (array['coordenador','direcao']));
