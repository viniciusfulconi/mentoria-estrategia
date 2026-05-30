-- Avaliações de professores (equivalente a pesquisas_csat)
CREATE TABLE IF NOT EXISTS avaliacoes_professores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  materia    text NOT NULL,
  data       date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Respostas individuais (1 linha = 1 aluno avaliando 1 professor em 1 avaliação)
CREATE TABLE IF NOT EXISTS respostas_professor (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id            uuid REFERENCES avaliacoes_professores(id) ON DELETE CASCADE,
  professor               text NOT NULL,
  materia                 text NOT NULL,
  dominio_conteudo        smallint,   -- 1-5
  clareza_explicacao      smallint,   -- 1-5
  ritmo_aula              smallint,   -- 1-5 (3=Normal=ideal)
  teoria_exercicios       smallint,   -- 1-5
  organizacao_quadro      smallint,   -- 1-5
  respeito_alunos         smallint,   -- 1-5
  acessibilidade_duvidas  smallint,   -- 1-5
  cumprimento_horarios    smallint,   -- 1-5
  contribuicao_aprendizado smallint,  -- 1-5
  adequacao_listas        smallint,   -- 1-5
  comentario              text,
  created_at              timestamptz DEFAULT now()
);

-- Índices para queries por professor e matéria
CREATE INDEX IF NOT EXISTS idx_respostas_professor_professor ON respostas_professor(professor);
CREATE INDEX IF NOT EXISTS idx_respostas_professor_materia   ON respostas_professor(materia);
CREATE INDEX IF NOT EXISTS idx_respostas_professor_avaliacao ON respostas_professor(avaliacao_id);

-- RLS: leitura autenticada, escrita autenticada
ALTER TABLE avaliacoes_professores ENABLE ROW LEVEL SECURITY;
ALTER TABLE respostas_professor     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura autenticada" ON avaliacoes_professores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "escrita autenticada" ON avaliacoes_professores
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delete autenticado" ON avaliacoes_professores
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "leitura autenticada" ON respostas_professor
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "escrita autenticada" ON respostas_professor
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "delete autenticado" ON respostas_professor
  FOR DELETE TO authenticated USING (true);
