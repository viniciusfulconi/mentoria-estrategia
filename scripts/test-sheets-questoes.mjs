// Testes do detalhamento questão a questão em lib/sheets-parse.ts — sem rede,
// sem banco.
//
// Uso:  node --test scripts/test-sheets-questoes.mjs
//
// Cobre o buraco que deixou os gráficos por questão vazios: o sync da planilha
// trazia as notas agregadas mas descartava as colunas Q1..Qn, então toda linha
// criada por ele nascia com notas_questoes NULL. Os casos aqui são os que a
// planilha real exercita e que quebrariam a conversão em silêncio.
//
// .mjs (não .ts) de propósito: mesmo motivo de test-rankings.mjs — o tsc do
// projeto ignora e o Node importa o .ts nativamente com extensão explícita.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSimulados, canonicalizar } from '../lib/sheets-parse.ts'

// ─── fixtures mínimas no shape da planilha AppSheet ──────────────────────────

const ALUNO = { idAluno: 'a1', NomeCompleto: 'Fulano de Tal', Turma: 'Presencial', Mentor: 'u1' }
const USUARIO = { idUsuario: 'u1', Nome: 'Mentor Ciclano' }

const qs = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v]))

// Monta um SheetsInput completo a partir de um simulado + uma resposta.
// `Nota: null` entra sempre porque checarColunas exige a coluna na aba de
// respostas (o valor nulo é ignorado por pick, então não interfere no mapeamento).
function entrada({ simulado, resposta, gabarito }) {
  return {
    simulados: [simulado],
    respostas: [{ idResposta: 'r1', Simulado: simulado.idSimulado, Aluno: 'a1', Nota: null, ...resposta }],
    cadastroAlunos: [ALUNO],
    usuarios: [USUARIO],
    gabaritos: gabarito ? [{ idGabarito: 'g1', Simulado: simulado.idSimulado, ...gabarito }] : [],
  }
}

const linhaDe = (input, fase) => parseSimulados(input).linhas.find((l) => l.fase === fase)

const SIM_1FASE_ITA = { idSimulado: 's1', Ciclo: 'Ciclo 3', Modelo: 'ITA', Fase: '1ª Fase', Materia: null }
const SIM_PORT_ITA = { idSimulado: 's2', Ciclo: 'Ciclo 3', Modelo: 'ITA', Fase: '2ª Fase', Materia: 'Português' }
const SIM_MAT_ITA = { idSimulado: 's3', Ciclo: 'Ciclo 3', Modelo: 'ITA', Fase: '2ª Fase', Materia: 'Matemática' }
const SIM_LING_IME = { idSimulado: 's4', Ciclo: 'Ciclo 2', Modelo: 'IME', Fase: '2ª Fase', Materia: 'Linguagens' }

// ─── 1ª fase: é o gráfico "Acertos por questão" da página do aluno ───────────

test('1ª fase ITA: 48 questões, inglês incluído no detalhamento mas fora da nota', () => {
  const gabarito = {}
  const resposta = { Nota: 5, 'Acertos Matemática': 12, 'Acertos Física': 0, 'Acertos Química': 0, 'Acertos Inglês': 12 }
  for (let q = 1; q <= 48; q++) {
    gabarito[`Q${q}`] = 'A'
    // acerta o bloco de matemática (1..12) e o de inglês (37..48)
    resposta[`Q${q}`] = (q <= 12 || q >= 37) ? 'A' : 'B'
  }

  const l = linhaDe(entrada({ simulado: SIM_1FASE_ITA, gabarito, resposta }), '1fase')

  assert.equal(Object.keys(l.notas_questoes).length, 48, 'as 48 entram — o gráfico marca inglês como "não conta"')
  assert.equal(l.notas_questoes.Q1, 1)
  assert.equal(l.notas_questoes.Q13, 0)
  assert.equal(l.notas_questoes.Q48, 1)
  assert.equal(l.media_1fase, 5, 'a nota continua vindo da coluna Nota, não da soma das questões')
})

// ─── prova objetiva: acerto sai da comparação com o gabarito ─────────────────

test('objetiva: letra igual ao gabarito vale 1, diferente vale 0', () => {
  const l = linhaDe(entrada({
    simulado: SIM_PORT_ITA,
    gabarito: qs({ Q1: 'A', Q2: 'B', Q3: 'C' }),
    resposta: { 'Nota Português': 4.4444, Q1: 'A', Q2: 'E', Q3: 'C' },
  }), '2fase_port')

  assert.deepEqual(l.notas_questoes, { Q1: 1, Q2: 0, Q3: 1 })
})

test('objetiva: questão em branco é erro, não ausência', () => {
  const l = linhaDe(entrada({
    simulado: SIM_PORT_ITA,
    gabarito: qs({ Q1: 'A', Q2: 'B' }),
    resposta: { Q1: 'A', Q2: null },
  }), '2fase_port')

  assert.deepEqual(l.notas_questoes, { Q1: 1, Q2: 0 },
    'quem deixou em branco errou — a questão precisa entrar no divisor da nota')
})

test('objetiva: resposta fora de A–E ("X", "?") conta como erro sem quebrar', () => {
  const l = linhaDe(entrada({
    simulado: SIM_PORT_ITA,
    gabarito: qs({ Q1: 'A', Q2: 'B', Q3: 'C' }),
    resposta: { Q1: 'X', Q2: '?', Q3: 'C' },
  }), '2fase_port')

  assert.deepEqual(l.notas_questoes, { Q1: 0, Q2: 0, Q3: 1 })
})

test('objetiva: questão anulada vale para todo mundo', () => {
  const l = linhaDe(entrada({
    simulado: SIM_PORT_ITA,
    gabarito: qs({ Q1: 'Anulada', Q2: 'B' }),
    resposta: { Q1: 'E', Q2: null },
  }), '2fase_port')

  assert.equal(l.notas_questoes.Q1, 1, 'anulada pontua mesmo com a letra "errada"')
  assert.equal(l.notas_questoes.Q2, 0)
})

test('objetiva: gabarito com duas respostas válidas após recurso aceita ambas', () => {
  const gabarito = qs({ Q1: 'B , D', Q2: 'A , Anulada' })
  const comB = linhaDe(entrada({ simulado: SIM_PORT_ITA, gabarito, resposta: { Q1: 'B', Q2: 'E' } }), '2fase_port')
  const comD = linhaDe(entrada({ simulado: SIM_PORT_ITA, gabarito, resposta: { Q1: 'D', Q2: 'A' } }), '2fase_port')
  const comC = linhaDe(entrada({ simulado: SIM_PORT_ITA, gabarito, resposta: { Q1: 'C', Q2: 'A' } }), '2fase_port')

  assert.equal(comB.notas_questoes.Q1, 1)
  assert.equal(comD.notas_questoes.Q1, 1)
  assert.equal(comC.notas_questoes.Q1, 0, 'alternativa fora da lista continua erro')
  assert.equal(comB.notas_questoes.Q2, 1, '"A , Anulada" pontua todo mundo')
})

test('objetiva: o gabarito define o tamanho da prova, não as colunas do aluno', () => {
  const l = linhaDe(entrada({
    simulado: SIM_PORT_ITA,
    gabarito: qs({ Q1: 'A', Q2: 'B', Q3: 'C' }),
    resposta: { Q1: 'A' },                    // aluno só tem 1 coluna preenchida
  }), '2fase_port')

  assert.deepEqual(Object.keys(l.notas_questoes), ['Q1', 'Q2', 'Q3'],
    'as 3 questões entram — senão o divisor encolhe e a nota infla')
})

// ─── dissertativa: a célula já é a nota da questão ───────────────────────────

test('dissertativa: nota por questão vai direto, sem gabarito', () => {
  const l = linhaDe(entrada({
    simulado: SIM_MAT_ITA,
    resposta: { Nota: 2.5, Q1: 1, Q2: 0.5, Q3: 0, Q4: '0,7' },
  }), '2fase_mat')

  assert.deepEqual(l.notas_questoes, { Q1: 1, Q2: 0.5, Q3: 0, Q4: 0.7 },
    'aceita vírgula decimal (Sheets API devolve string)')
})

test('dissertativa: lançamento fora de [0,1] é preservado, não recortado', () => {
  // Casos reais do Ciclo 1/Química: penalidade -0.5 e questão de peso 3. A `Nota`
  // declarada na planilha reflete os dois, então clampar quebraria a coerência
  // entre nota agregada e detalhamento (notaDeQuestoes, lib/notas.ts).
  const l = linhaDe(entrada({
    simulado: SIM_MAT_ITA,
    resposta: { Nota: 3.5, Q1: -0.5, Q2: 3, Q3: 1 },
  }), '2fase_mat')

  assert.deepEqual(l.notas_questoes, { Q1: -0.5, Q2: 3, Q3: 1 })
})

test('dissertativa: questão não lançada fica de fora do JSON', () => {
  const l = linhaDe(entrada({
    simulado: SIM_MAT_ITA,
    resposta: { Nota: 1, Q1: 1, Q2: null, Q3: '' },
  }), '2fase_mat')

  assert.deepEqual(l.notas_questoes, { Q1: 1 },
    'ausente ≠ zero: notaDeQuestoes usa max(chaves, 10) e não infla a nota')
})

// ─── IME: prova única de Linguagens partida em duas fases ────────────────────

test('IME: Linguagens vira Português 1..20 e Inglês 21..40, com a numeração da prova', () => {
  const gabarito = {}
  const resposta = { 'Nota Português': 5, 'Acertos Inglês': 20 }
  for (let q = 1; q <= 40; q++) { gabarito[`Q${q}`] = 'A'; resposta[`Q${q}`] = q <= 20 ? 'B' : 'A' }

  const input = entrada({ simulado: SIM_LING_IME, gabarito, resposta })
  const port = linhaDe(input, '2fase_port')
  const ing = linhaDe(input, '2fase_ing')

  assert.deepEqual(Object.keys(port.notas_questoes), Array.from({ length: 20 }, (_, i) => `Q${i + 1}`))
  assert.deepEqual(Object.keys(ing.notas_questoes), Array.from({ length: 20 }, (_, i) => `Q${i + 21}`),
    'inglês mantém Q21..Q40 — notaDeQuestoes divide pelo nº de chaves, não pelo nome')
  assert.equal(Object.values(port.notas_questoes).every((v) => v === 0), true)
  assert.equal(Object.values(ing.notas_questoes).every((v) => v === 1), true)
})

// ─── degradação e integridade ────────────────────────────────────────────────

test('sem a aba Gabaritos: dissertativa continua vindo, objetiva fica sem — e nada é fatal', () => {
  const semGabarito = parseSimulados({
    simulados: [SIM_MAT_ITA, SIM_PORT_ITA],
    respostas: [
      { idResposta: 'r1', Simulado: 's3', Aluno: 'a1', Nota: 1, Q1: 1 },
      { idResposta: 'r2', Simulado: 's2', Aluno: 'a1', 'Nota Português': 6.6667, Q1: 'A' },
    ],
    cadastroAlunos: [ALUNO],
    usuarios: [USUARIO],
    gabaritos: [],
  })

  assert.equal(semGabarito.ok, true, 'aba ausente não pode derrubar o sync')
  assert.deepEqual(semGabarito.linhas.find((l) => l.fase === '2fase_mat').notas_questoes, { Q1: 1 })
  assert.equal(semGabarito.linhas.find((l) => l.fase === '2fase_port').notas_questoes, null,
    'sem gabarito não há como saber o acerto — melhor nulo que uma letra virando nota')
  assert.equal(semGabarito.avisos.some((a) => a.includes('Gabaritos')), true)
})

test('divergência entre detalhamento e agregado declarado vira aviso, não fatal', () => {
  const r = parseSimulados(entrada({
    simulado: SIM_PORT_ITA,
    gabarito: qs({ Q1: 'A', Q2: 'B', Q3: 'C' }),
    resposta: { 'Nota Português': 6.6667, 'Acertos Português': 1, Q1: 'A', Q2: 'B', Q3: 'C' },
  }))

  assert.equal(r.ok, true, 'agregado velho na planilha não pode travar o sync inteiro')
  assert.equal(r.avisos.some((a) => a.includes('divergência')), true)
})

test('a forma canônica preserva o detalhamento e ignora a ordem das chaves', () => {
  // Regressão do hash do sync (hashLinhas, lib/sync-simulados.ts): o atalho
  // JSON.stringify(l, Object.keys(l).sort()) aplica o replacer-array também aos
  // objetos aninhados, zerando notas_questoes. Com o detalhamento invisível ao
  // hash, o cron pularia a execução ("sem mudanças") depois de uma correção de
  // gabarito — e os gráficos ficariam congelados no valor errado.
  const base = { fase: '2fase_mat', ciclo_nome: 'Ciclo 3', nota_matematica: 1 }
  const serial = (q) => JSON.stringify(canonicalizar({ ...base, notas_questoes: q }))

  const antes = serial({ Q1: 1, Q2: 0 })
  const depois = serial({ Q1: 1, Q2: 1 })
  const reordenado = serial({ Q2: 0, Q1: 1 })

  assert.match(antes, /"Q1":1/, 'o conteúdo do jsonb tem que sobreviver à serialização')
  assert.notEqual(antes, depois, 'mudar uma questão tem que mudar a forma canônica')
  assert.equal(antes, reordenado, 'ordem das chaves não pode inventar mudança')
})
