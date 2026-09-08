-- ═══════════════════════════════════════════════════════════════════════════
-- Provas antigas do ENEM na mentoria (vertical Medicina)
--
-- O aluno baixa o PDF do caderno oficial, preenche um cartão-resposta virtual
-- e recebe nota 0–1000 por área via TRI de verdade (3PL, estimador EAP), com a
-- calibração de linking daquele ano. O mentor vê o mesmo relatório.
--
-- O acervo vem do Play Aprovação (Supabase próprio, projeto mgroaren…): as
-- questões são copiadas para cá com o MESMO uuid, para que `areas` continue
-- válido sem remapeamento. Imagens e PDFs NÃO são copiados — seguem servidos
-- pelos buckets públicos do Play (`questoes` e `simulado-enem-pdfs`).
--
-- ANTI-COLA: `enem_itens` guarda o gabarito, então NENHUM aluno lê esta tabela.
-- A correção e o relatório rodam server-side com service-role; o cliente do
-- aluno só recebe o que a rota decidir devolver.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Acervo de itens (imutável; espelho do Play) ─────────────────────────────
create table if not exists enem_itens (
  id            uuid primary key,          -- mesmo uuid do Play (não gerar novo)
  code          integer not null unique,   -- chave estável p/ casar com os stats do microdado
  ano           smallint not null,
  enem_area     text not null check (enem_area in ('CH', 'CN', 'LC', 'MT')),
  co_item       bigint,
  co_habilidade smallint,
  tp_lingua     smallint check (tp_lingua in (0, 1)),   -- 0 = Inglês, 1 = Espanhol
  -- Psicometria (métrica θ padronizada do INEP)
  tri_a         numeric,
  tri_b         numeric,
  tri_c         numeric,
  -- Conteúdo
  gabarito      text,        -- null = item anulado (credita todo mundo, fica fora do θ)
  dificuldade   text,
  materia       text,
  topico        text,
  subtopico     text,
  enunciado     text,
  alternativas  jsonb,
  solucao       text,
  created_at    timestamptz default now()
);
create index if not exists enem_itens_ano_idx  on enem_itens (ano);
create index if not exists enem_itens_area_idx on enem_itens (enem_area);
create index if not exists enem_itens_code_idx on enem_itens (code);

-- ── Provas publicadas ───────────────────────────────────────────────────────
create table if not exists enem_provas (
  id          uuid primary key,            -- mesmo uuid do Play
  titulo      text not null,
  ano         smallint not null,
  descricao   text,
  status      text not null default 'published' check (status in ('rascunho', 'published')),
  pdf_url     text,                        -- bucket público do Play
  -- [{ area, base, question_ids } | { area:'LC', base, comuns[], ingles[], espanhol[] }]
  areas       jsonb not null default '[]'::jsonb,
  -- Linking do ano: { "LC": {"A":492.6,"B":121.0}, ... }
  calibracao  jsonb,
  vertical    text not null default 'Medicina',
  created_at  timestamptz default now()
);
create index if not exists enem_provas_status_idx on enem_provas (status, vertical);

-- ── Cartão-resposta do aluno + resultado ────────────────────────────────────
create table if not exists enem_tentativas (
  id           uuid default gen_random_uuid() primary key,
  prova_id     uuid not null references enem_provas(id) on delete cascade,
  aluno_id     text not null,              -- alunos.id (Medicina)
  status       text not null default 'em_andamento' check (status in ('em_andamento', 'enviada')),
  lingua       smallint check (lingua in (0, 1)),
  respostas    jsonb not null default '{}'::jsonb,   -- { "<item uuid>": "a" }
  nota_redacao numeric check (nota_redacao is null or (nota_redacao >= 0 and nota_redacao <= 1000)),
  -- gravado pela rota de correção: { areas: {CH:{acertos,total,theta,erro_padrao,nota}}, nota_geral }
  resultado    jsonb,
  enviada_em   timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (prova_id, aluno_id)
);
create index if not exists enem_tent_aluno_idx  on enem_tentativas (aluno_id);
create index if not exists enem_tent_prova_idx  on enem_tentativas (prova_id);
create index if not exists enem_tent_status_idx on enem_tentativas (status);

-- ── Trava: depois de enviada, o aluno não mexe mais; e nunca na nota ────────
create or replace function protege_enem_tentativa()
returns trigger language plpgsql security definer as $$
begin
  if auth_papel() = 'aluno' then
    -- aluno não lança a própria redação nem forja resultado/status
    new.nota_redacao := old.nota_redacao;
    new.resultado    := old.resultado;
    if old.status = 'enviada' then
      new.respostas := old.respostas;
      new.lingua    := old.lingua;
      new.status    := old.status;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_protege_enem_tentativa on enem_tentativas;
create trigger trg_protege_enem_tentativa
  before update on enem_tentativas
  for each row execute function protege_enem_tentativa();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table enem_itens      enable row level security;
alter table enem_provas     enable row level security;
alter table enem_tentativas enable row level security;

-- itens: NUNCA para aluno (guardam o gabarito). Staff lê; escrita é service-role.
drop policy if exists enem_itens_read on enem_itens;
create policy enem_itens_read on enem_itens for select to authenticated
  using (auth_papel() = any (array['coordenador', 'direcao', 'mentor', 'professor']));

-- provas: todo autenticado lê (título, PDF, estrutura — sem gabarito)
drop policy if exists enem_provas_read  on enem_provas;
drop policy if exists enem_provas_write on enem_provas;
create policy enem_provas_read on enem_provas for select to authenticated using (true);
create policy enem_provas_write on enem_provas for all to authenticated
  using      (auth_papel() = any (array['coordenador', 'direcao']))
  with check (auth_papel() = any (array['coordenador', 'direcao']));

-- tentativas: aluno cuida da própria; staff lê todas e lança redação
drop policy if exists enem_tent_aluno on enem_tentativas;
drop policy if exists enem_tent_staff on enem_tentativas;
create policy enem_tent_aluno on enem_tentativas for all to authenticated
  using      (auth_papel() = 'aluno' and aluno_id = auth_aluno_id())
  with check (auth_papel() = 'aluno' and aluno_id = auth_aluno_id());
create policy enem_tent_staff on enem_tentativas for all to authenticated
  using      (auth_papel() = any (array['coordenador', 'direcao', 'mentor']))
  with check (auth_papel() = any (array['coordenador', 'direcao', 'mentor']));
