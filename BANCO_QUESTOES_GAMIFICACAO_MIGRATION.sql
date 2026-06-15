-- Banco de Questões + Gamificação (Penas)
-- Execute no Supabase: Dashboard > SQL Editor

-- ─── QUESTÕES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement    TEXT NOT NULL,
  alternatives JSONB,
  answer       TEXT,
  solution     TEXT,
  subject      TEXT NOT NULL,
  topic        TEXT,
  subtopic     TEXT,
  source       TEXT,
  year         INT,
  difficulty   TEXT CHECK (difficulty IN ('Fácil', 'Médio', 'Difícil')),
  type         TEXT NOT NULL DEFAULT 'multiple_choice'
                 CHECK (type IN ('multiple_choice', 'discursive')),
  tags         TEXT[],
  vertical     TEXT CHECK (vertical IN ('ITA', 'Medicina')),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS questions_subject_idx    ON public.questions(subject);
CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON public.questions(difficulty);
CREATE INDEX IF NOT EXISTS questions_source_idx     ON public.questions(source);
CREATE INDEX IF NOT EXISTS questions_vertical_idx   ON public.questions(vertical);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem questões"
  ON public.questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados inserem questões"
  ON public.questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Criador edita questão"
  ON public.questions FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Criador exclui questão"
  ON public.questions FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- ─── PROGRESSO DOS ALUNOS NAS QUESTÕES ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.questoes_progresso (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'not_seen'
                CHECK (status IN ('not_seen', 'in_review', 'solved')),
  notes       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aluno_id, question_id)
);

CREATE INDEX IF NOT EXISTS qp_aluno_idx    ON public.questoes_progresso(aluno_id);
CREATE INDEX IF NOT EXISTS qp_question_idx ON public.questoes_progresso(question_id);

ALTER TABLE public.questoes_progresso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aluno acessa próprio progresso"
  ON public.questoes_progresso FOR ALL
  TO authenticated
  USING (auth.uid() = aluno_id)
  WITH CHECK (auth.uid() = aluno_id);

CREATE POLICY "Coordenador lê todo progresso"
  ON public.questoes_progresso FOR SELECT
  TO authenticated USING (true);

-- ─── DESAFIOS SEMANAIS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desafios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      TEXT NOT NULL,
  enunciado   TEXT,
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  materia     TEXT,
  recompensa  INT NOT NULL DEFAULT 100,
  dificuldade TEXT CHECK (dificuldade IN ('Fácil', 'Médio', 'Difícil')),
  inicio      DATE NOT NULL,
  fim         DATE NOT NULL,
  vertical    TEXT CHECK (vertical IN ('ITA', 'Medicina')),
  criado_por  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS desafios_inicio_idx  ON public.desafios(inicio);
CREATE INDEX IF NOT EXISTS desafios_vertical_idx ON public.desafios(vertical);

ALTER TABLE public.desafios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem desafios"
  ON public.desafios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados inserem desafios"
  ON public.desafios FOR INSERT TO authenticated WITH CHECK (auth.uid() = criado_por);

CREATE POLICY "Criador edita desafio"
  ON public.desafios FOR UPDATE TO authenticated USING (auth.uid() = criado_por);

CREATE POLICY "Criador exclui desafio"
  ON public.desafios FOR DELETE TO authenticated USING (auth.uid() = criado_por);

-- ─── RESPOSTAS DOS DESAFIOS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desafios_respostas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  desafio_id  UUID NOT NULL REFERENCES public.desafios(id) ON DELETE CASCADE,
  aluno_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resposta    TEXT NOT NULL,
  validado    BOOLEAN,
  penas_pagas BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (desafio_id, aluno_id)
);

CREATE INDEX IF NOT EXISTS dr_desafio_idx ON public.desafios_respostas(desafio_id);
CREATE INDEX IF NOT EXISTS dr_aluno_idx   ON public.desafios_respostas(aluno_id);

ALTER TABLE public.desafios_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aluno vê suas respostas"
  ON public.desafios_respostas FOR SELECT TO authenticated
  USING (auth.uid() = aluno_id);

CREATE POLICY "Aluno insere resposta"
  ON public.desafios_respostas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = aluno_id);

CREATE POLICY "Coordenador lê todas as respostas"
  ON public.desafios_respostas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coordenador valida respostas"
  ON public.desafios_respostas FOR UPDATE TO authenticated USING (true);

-- ─── GAMIFICAÇÃO: PENAS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.moedas_saldo (
  aluno_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  saldo      INT NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.moedas_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados veem saldos"
  ON public.moedas_saldo FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sistema gerencia saldo"
  ON public.moedas_saldo FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Transações imutáveis (ledger)
CREATE TABLE IF NOT EXISTS public.moedas_transacoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN (
                  'simulado','desafio','atendimento','aula','streak',
                  'transferencia_in','transferencia_out','compra','bonus'
                )),
  valor         INT NOT NULL,
  referencia_id TEXT,
  descricao     TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mt_aluno_idx ON public.moedas_transacoes(aluno_id);
CREATE INDEX IF NOT EXISTS mt_tipo_idx  ON public.moedas_transacoes(tipo);

ALTER TABLE public.moedas_transacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aluno vê suas transações"
  ON public.moedas_transacoes FOR SELECT TO authenticated
  USING (auth.uid() = aluno_id);

CREATE POLICY "Coordenador vê todas as transações"
  ON public.moedas_transacoes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sistema insere transações"
  ON public.moedas_transacoes FOR INSERT TO authenticated WITH CHECK (true);

-- ─── LOJA ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.loja_produtos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                TEXT NOT NULL,
  descricao           TEXT,
  custo               INT NOT NULL CHECK (custo > 0),
  quantidade_total    INT,
  quantidade_restante INT,
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  vertical            TEXT CHECK (vertical IN ('ITA', 'Medicina')),
  criado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.loja_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem produtos"
  ON public.loja_produtos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coordenador gerencia produtos"
  ON public.loja_produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.loja_compras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.loja_produtos(id) ON DELETE CASCADE,
  aluno_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lc_aluno_idx   ON public.loja_compras(aluno_id);
CREATE INDEX IF NOT EXISTS lc_produto_idx ON public.loja_compras(produto_id);

ALTER TABLE public.loja_compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aluno vê suas compras"
  ON public.loja_compras FOR SELECT TO authenticated USING (auth.uid() = aluno_id);

CREATE POLICY "Aluno insere compra"
  ON public.loja_compras FOR INSERT TO authenticated WITH CHECK (auth.uid() = aluno_id);

CREATE POLICY "Coordenador vê todas as compras"
  ON public.loja_compras FOR SELECT TO authenticated USING (true);

-- ─── RPC: transferência atômica de penas ─────────────────────────────────────
-- Garante consistência: debita de quem envia e credita em quem recebe numa transação

CREATE OR REPLACE FUNCTION public.transferir_penas(
  p_de   UUID,
  p_para UUID,
  p_qtd  INT,
  p_desc TEXT DEFAULT 'Transferência entre alunos'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_qtd <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;

  -- Debitar remetente
  UPDATE public.moedas_saldo SET saldo = saldo - p_qtd, updated_at = NOW()
  WHERE aluno_id = p_de AND saldo >= p_qtd;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  -- Creditar destinatário (cria linha se não existir)
  INSERT INTO public.moedas_saldo (aluno_id, saldo)
  VALUES (p_para, p_qtd)
  ON CONFLICT (aluno_id) DO UPDATE SET saldo = moedas_saldo.saldo + p_qtd, updated_at = NOW();

  -- Registrar ambos os lados no ledger
  INSERT INTO public.moedas_transacoes (aluno_id, tipo, valor, descricao)
  VALUES (p_de,   'transferencia_out', -p_qtd, p_desc),
         (p_para, 'transferencia_in',   p_qtd, p_desc);
END;
$$;
