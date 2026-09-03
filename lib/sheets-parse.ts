// ─────────────────────────────────────────────────────────────────────────────
// Parse PURO da planilha AppSheet ("Turma Presencial ITA IME 2026") → linhas de
// fase no formato da tabela `resultados`.
//
// Esta camada NÃO faz rede nem banco. Recebe as abas já convertidas em arrays de
// objetos {header: valor} (o mesmo shape que `XLSX.utils.sheet_to_json` produz e
// que `lib/google-sheets.ts` reconstrói a partir da Sheets API). Isso permite
// testar o mapeamento inteiro contra o .xlsx local, offline, antes de qualquer
// escrita — exigência do skill upload-simulado ("validar a fórmula antes de
// processar em massa").
//
// Dependência única: `zod` (validação de colunas). NENHUM import relativo, de
// propósito: assim o módulo roda no Node nativo (type-stripping) direto do script
// de teste. O recálculo de ranking (lib/rankings.ts) mora na camada de
// orquestração (lib/sync-simulados.ts), não aqui.
//
// A planilha é RELACIONAL (store do AppSheet), não o "Formato A" do upload manual:
//   Respostas-Simulado.Simulado → Simulados  (Ciclo, Modelo, Fase, Materia)
//   Respostas-Simulado.Aluno    → Cadastro Alunos (NomeCompleto, Turma, Mentor)
//   Cadastro Alunos.Mentor      → Usuarios (Nome)
// ─────────────────────────────────────────────────────────────────────────────
import { z } from 'zod'

export type Row = Record<string, any>

export type SheetsInput = {
  respostas: Row[]
  simulados: Row[]
  cadastroAlunos: Row[]
  usuarios: Row[]
  gabaritos: Row[]
}

// Linha no formato `resultados` (fase individual). Só as colunas que este parse
// preenche; o normalizador do sync completa o resto com null.
export type ResultadoFaseRow = {
  id_aluno: string
  nome_aluno: string
  mentor: string | null
  ciclo_nome: string
  concurso: 'ITA' | 'IME'
  fase: string
  media_1fase?: number | null
  acertos_mat_1f?: number | null
  acertos_fis_1f?: number | null
  acertos_qui_1f?: number | null
  acertos_ing_1f?: number | null
  nota_matematica?: number | null
  nota_fisica?: number | null
  nota_quimica?: number | null
  media_linguagens?: number | null
  nota_redacao?: number | null
  nota_portugues?: number | null
  nota_ingles?: number | null
  // Detalhamento questão a questão (jsonb `notas_questoes`). Alimenta os gráficos
  // por questão da página do aluno e a edição de /gestao/notas. Convenção: valor
  // por questão em 0..1 — em prova objetiva é 1/0 (acerto contra o gabarito), em
  // dissertativa é a fração da questão que o corretor lançou.
  notas_questoes?: Record<string, number> | null
}

// Agregado de ciclo declarado NA PLANILHA (denormalizado em toda linha do
// aluno+ciclo). Não é gravado — é a referência do cross-check contra o ranking
// que lib/rankings.ts recalcula.
export type AgregadoDeclarado = {
  id_aluno: string
  ciclo_nome: string
  concurso: 'ITA' | 'IME'
  media_2fase_declarada: number | null
  resultado_declarado: string | null
}

export type ParseResult = {
  ok: boolean
  fatais: string[]                 // erros que ABORTAM antes de qualquer escrita
  avisos: string[]                 // não bloqueiam (órfãos, IME ambíguo, etc.)
  linhas: ResultadoFaseRow[]       // linhas de fase a persistir (só Presencial)
  declarados: AgregadoDeclarado[]  // referência p/ cross-check de ranking
  ciclosPresentes: string[]        // ciclos com ao menos 1 linha (ex.: "Ciclo 6")
  cicloAtivo: string | null        // maior ciclo com resposta → único sobrescrito
}

// ─── helpers de normalização (locais de propósito — ver cabeçalho) ───────────

function stripAcentos(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function norm(s: string): string {
  return stripAcentos(s).toLowerCase().replace(/\s+/g, ' ').trim()
}

// Número tolerante: aceita number nativo (xlsx) ou string "5.5"/"5,5" (Sheets API).
function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}
function str(v: any): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Busca valor por header, tolerante a acento/caixa/espaço (Nota Redação ≈ nota
// redacao). Primeira chave que casar vence.
function pick(row: Row, ...candidatos: string[]): any {
  const alvo = candidatos.map(norm)
  for (const k of Object.keys(row)) {
    if (alvo.includes(norm(k))) {
      const v = row[k]
      if (v !== null && v !== undefined && v !== '') return v
    }
  }
  return null
}

function numFrom(row: Row, ...candidatos: string[]): number | null {
  return num(pick(row, ...candidatos))
}

// ─── questão a questão ───────────────────────────────────────────────────────
// A planilha guarda as questões em colunas `Q1..Qn` tanto na aba de respostas
// quanto na de gabaritos, mas com semânticas DIFERENTES, decididas pela presença
// de gabarito para aquele simulado:
//
//   • com gabarito  → prova OBJETIVA: a resposta é a letra marcada (A–E) e o
//     acerto sai da comparação com o gabarito. É o caso da 1ª fase inteira e da
//     2ª fase de Português/Linguagens.
//   • sem gabarito  → prova DISSERTATIVA (2ª fase Mat/Fís/Quí): a célula já é a
//     nota da questão em 0..1, lançada pelo corretor — vai direto, sem clamp.
//     Há lançamentos legítimos fora de [0,1] (penalidade/peso extra) e a `Nota`
//     declarada os reflete; recortar quebraria notaDeQuestoes (lib/notas.ts).

// Nº da questão a partir do header ("Q7", "q 7" → 7); null se não for coluna de questão.
function numeroQuestao(header: string): number | null {
  const m = norm(header).replace(/\s+/g, '').match(/^q(\d+)$/)
  return m ? parseInt(m[1], 10) : null
}

// Colunas de questão de uma linha, em ordem numérica.
function colunasQuestao(row: Row): { key: string; n: number }[] {
  return Object.keys(row)
    .map((key) => ({ key, n: numeroQuestao(key) }))
    .filter((c): c is { key: string; n: number } => c.n !== null)
    .sort((a, b) => a.n - b.n)
}

// Alternativas aceitas de uma célula de gabarito. A planilha usa vírgula para
// questão com mais de uma resposta válida após recurso ("B , D") e o literal
// "Anulada" para questão anulada (isolado ou combinado: "A , Anulada").
function alternativasGabarito(v: unknown): string[] {
  return String(v ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean)
}

// Acerto de uma questão objetiva: 1/0. Questão anulada vale para todo mundo.
function acertoObjetivo(respostaAluno: unknown, celulaGabarito: unknown): number | null {
  const alts = alternativasGabarito(celulaGabarito)
  if (!alts.length) return null                       // questão sem gabarito → fora da prova
  if (alts.includes('ANULADA')) return 1
  const marcada = String(respostaAluno ?? '').trim().toUpperCase()
  return marcada && alts.includes(marcada) ? 1 : 0
}

// Detalhamento por questão de UMA resposta, restrito à faixa [de, ate] (usado
// para partir a prova de Linguagens do IME em Português 1..20 e Inglês 21..40).
// Mantém a numeração original da prova — o divisor de notaDeQuestoes é a
// quantidade de chaves, não o nome delas.
function questoesDaResposta(
  resp: Row, gabarito: Row | null, faixa?: { de: number; ate: number },
): Record<string, number> | null {
  const out: Record<string, number> = {}
  const dentro = (n: number) => !faixa || (n >= faixa.de && n <= faixa.ate)

  if (gabarito) {
    // Objetiva: o GABARITO define quais questões existem (a linha do aluno pode
    // ter colunas em branco por questão não respondida — que é erro, não ausência).
    for (const { key, n } of colunasQuestao(gabarito)) {
      if (!dentro(n)) continue
      const acerto = acertoObjetivo(pickQuestao(resp, n), gabarito[key])
      if (acerto !== null) out[`Q${n}`] = acerto
    }
  } else {
    // Dissertativa: só as questões efetivamente lançadas.
    for (const { key, n } of colunasQuestao(resp)) {
      if (!dentro(n)) continue
      const v = num(resp[key])
      if (v !== null) out[`Q${n}`] = v
    }
  }
  return Object.keys(out).length ? out : null
}

// Célula de questão pelo número, tolerante ao header ("Q7" vs "q 7").
function pickQuestao(row: Row, n: number): unknown {
  for (const { key, n: k } of colunasQuestao(row)) if (k === n) return row[key]
  return null
}

// ─── cross-check do detalhamento ─────────────────────────────────────────────
// A planilha declara agregados (Acertos por matéria, Nota da dissertativa) que
// são redundantes com o detalhamento. Recalcular a partir das questões e comparar
// é o que denuncia um gabarito desalinhado — a falha que produziria gráficos
// silenciosamente errados. Divergência vira AVISO, não fatal: já existe linha
// real em que o agregado da planilha é que está velho (Ciclo 6 / Português),
// e travar o sync inteiro por causa de uma célula desatualizada seria pior.

// Prova de Linguagens do IME: 40 questões, 1..20 Português e 21..40 Inglês.
const Q_PORT_IME = 20
const Q_LINGUAGENS_IME = 40

// Blocos de matéria da 1ª fase, por concurso e tamanho da prova.
const BLOCOS_1FASE: Record<string, Record<string, [number, number]>> = {
  'ITA:48': { acertos_mat_1f: [1, 12], acertos_fis_1f: [13, 24], acertos_qui_1f: [25, 36], acertos_ing_1f: [37, 48] },
  'IME:40': { acertos_mat_1f: [1, 15], acertos_fis_1f: [16, 30], acertos_qui_1f: [31, 40] },
}

// Soma das questões numa faixa (ausentes contam 0, como em notaDeQuestoes).
function somaFaixa(q: Record<string, number>, de: number, ate: number): number {
  let soma = 0
  for (let n = de; n <= ate; n++) soma += q[`Q${n}`] ?? 0
  return soma
}

// Nota agregada derivada do detalhamento — mesma fórmula de notaDeQuestoes
// (lib/notas.ts), replicada aqui porque este módulo é puro de propósito e não
// importa nada do app. Se aquela mudar, esta tem que acompanhar.
function notaDerivada(q: Record<string, number>, nQuestoes: number): number {
  const keys = Object.keys(q)
  const soma = keys.reduce((a, k) => a + (Number(q[k]) || 0), 0)
  return (soma / Math.max(keys.length, nQuestoes)) * 10
}

// Leitura por nome de uma coluna de nota da linha (as chaves vêm de tabelas de
// configuração, não do tipo).
function campoNumerico(linha: ResultadoFaseRow, col: string): number | null | undefined {
  return (linha as unknown as Record<string, number | null | undefined>)[col]
}

function conferirQuestoes(linha: ResultadoFaseRow, resp: Row, divergencias: string[]) {
  const q = linha.notas_questoes
  if (!q || !Object.keys(q).length) return
  const onde = `${linha.ciclo_nome}/${linha.concurso}/${linha.fase}/${linha.nome_aluno}`
  const registrar = (o: string, calc: number, decl: number) => {
    divergencias.push(`${o}: detalhamento=${calc} planilha=${decl}`)
  }

  if (linha.fase === '1fase') {
    const blocos = BLOCOS_1FASE[`${linha.concurso}:${Object.keys(q).length}`]
    if (!blocos) return                                  // prova de tamanho não catalogado
    for (const [col, [de, ate]] of Object.entries(blocos)) {
      const decl = campoNumerico(linha, col)
      if (decl === null || decl === undefined) continue
      const calc = somaFaixa(q, de, ate)
      if (calc !== decl) registrar(`${onde}/${col}`, calc, decl)
    }
    return
  }

  if (linha.fase === '2fase_port') {
    const decl = numFrom(resp, 'Acertos Português', 'Acertos Portugues')
    if (decl === null) return
    const ate = linha.concurso === 'IME' ? Q_PORT_IME : 15
    const calc = somaFaixa(q, 1, ate)
    if (calc !== decl) registrar(`${onde}/acertos_portugues`, calc, decl)
    return
  }

  if (linha.fase === '2fase_ing') {
    const decl = numFrom(resp, 'Acertos Inglês', 'Acertos Ingles')
    if (decl === null) return
    const calc = somaFaixa(q, Q_PORT_IME + 1, Q_LINGUAGENS_IME)
    if (calc !== decl) registrar(`${onde}/acertos_ingles`, calc, decl)
    return
  }

  // Dissertativas: a nota da fase tem que ser a que sai das 10 questões.
  const campo = { '2fase_mat': 'nota_matematica', '2fase_fis': 'nota_fisica', '2fase_qui': 'nota_quimica' }[linha.fase]
  if (!campo) return
  const decl = campoNumerico(linha, campo)
  if (decl === null || decl === undefined) return
  const calc = notaDerivada(q, 10)
  if (Math.abs(calc - decl) > 0.005) registrar(`${onde}/${campo}`, +calc.toFixed(4), decl)
}

// Índice por coluna-chave, tolerante à variação de header do id.
function indexBy(rows: Row[], ...idCols: string[]): Record<string, Row> {
  const idx: Record<string, Row> = {}
  for (const r of rows) {
    const id = str(pick(r, ...idCols))
    if (id) idx[id] = r
  }
  return idx
}

const numeroCiclo = (ciclo: string): number =>
  parseInt(stripAcentos(ciclo).match(/\d+/)?.[0] ?? '-1', 10)

// Forma canônica de um valor: chaves ordenadas em TODOS os níveis, para que a
// comparação/serialização não dependa da ordem em que a planilha devolveu as
// colunas. Mora aqui (camada pura) porque quem consome — o hash do sync — precisa
// enxergar o conteúdo de `notas_questoes`, e o atalho `JSON.stringify(obj, chaves)`
// não serve: o replacer-array vale também para os objetos aninhados e apagaria as
// chaves "Q..." do detalhamento.
export function canonicalizar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalizar)
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, canonicalizar(obj[k])]))
  }
  return v
}

// ─── validação de colunas (zod) ──────────────────────────────────────────────
// Falha ALTA se uma coluna essencial sumir ou for renomeada.

function checarColunas(nomeAba: string, rows: Row[], obrigatorias: string[], fatais: string[]) {
  if (!rows.length) { fatais.push(`Aba "${nomeAba}" está vazia.`); return }
  const headers = Object.keys(rows[0]).map(norm)
  for (const col of obrigatorias) {
    if (!headers.includes(norm(col))) {
      fatais.push(`Aba "${nomeAba}": coluna obrigatória "${col}" não encontrada (renomeada ou removida?).`)
    }
  }
}

// zod de sanidade da linha de simulado — garante os campos do JOIN.
const SimuladoSchema = z.object({
  idSimulado: z.string().min(1),
  Ciclo: z.string().min(1),
  Modelo: z.string().min(1),
})

// ─── mapeamento de fase ──────────────────────────────────────────────────────

function detectarFase(faseRaw: string, materiaRaw: string | null): string | null {
  const f = norm(faseRaw)
  if (f.includes('zero')) return null                 // Simulado Zero → ignorar
  if (f.startsWith('1')) return '1fase'
  if (f.startsWith('2')) {
    const m = norm(materiaRaw ?? '')
    if (m.includes('matem')) return '2fase_mat'
    if (m.includes('fisic')) return '2fase_fis'
    if (m.includes('quim')) return '2fase_qui'
    if (m.includes('portug') || m.includes('lingu') || m.includes('redac')) return '2fase_port'
    if (m.includes('ingl')) return '2fase_ing'
    return null
  }
  return null
}

// ─── parse principal ─────────────────────────────────────────────────────────

export function parseSimulados(input: SheetsInput): ParseResult {
  const fatais: string[] = []
  const avisos: string[] = []

  // 1. Validação de colunas — antes de tocar em qualquer dado.
  checarColunas('Respostas-Simulado', input.respostas,
    ['idResposta', 'Simulado', 'Aluno', 'Nota'], fatais)
  checarColunas('Simulados', input.simulados,
    ['idSimulado', 'Ciclo', 'Modelo', 'Fase'], fatais)
  checarColunas('Cadastro Alunos', input.cadastroAlunos,
    ['idAluno', 'NomeCompleto', 'Turma', 'Mentor'], fatais)
  checarColunas('Usuarios', input.usuarios,
    ['idUsuario', 'Nome'], fatais)

  if (fatais.length) {
    return { ok: false, fatais, avisos, linhas: [], declarados: [], ciclosPresentes: [], cicloAtivo: null }
  }

  // 2. Índices de JOIN.
  const simById = indexBy(input.simulados, 'idSimulado')
  const alunoById = indexBy(input.cadastroAlunos, 'idAluno')
  const usuarioById = indexBy(input.usuarios, 'idUsuario')
  // Gabarito é indexado pelo simulado, não por id próprio. A aba é OPCIONAL: sem
  // ela as dissertativas continuam vindo (a nota por questão é lançada direto) e
  // só as objetivas ficam sem detalhamento — degradar é melhor que abortar o sync.
  const gabaritoPorSimulado = indexBy(input.gabaritos, 'Simulado')
  if (!input.gabaritos.length) {
    avisos.push('Aba "Gabaritos" vazia ou ausente — questão a questão das provas objetivas (1ª fase e Português) não será gravada.')
  }

  const linhas: ResultadoFaseRow[] = []
  const declaradosMap = new Map<string, AgregadoDeclarado>()
  const ciclosSet = new Set<string>()

  let orfaosAluno = 0
  let orfaosSimulado = 0
  let pulouPEC = 0
  const divergenciasQ: string[] = []                  // detalhamento × agregado declarado
  const redacaoPendente = new Map<string, number>()   // ciclo → nº de ITA com português sem redação

  for (const resp of input.respostas) {
    const idSimulado = str(pick(resp, 'Simulado'))
    const idAluno = str(pick(resp, 'Aluno'))
    if (!idSimulado || !idAluno) continue

    const sim = simById[idSimulado]
    if (!sim) { orfaosSimulado++; continue }

    const simParsed = SimuladoSchema.safeParse({
      idSimulado: str(pick(sim, 'idSimulado')),
      Ciclo: str(pick(sim, 'Ciclo')),
      Modelo: str(pick(sim, 'Modelo')),
    })
    if (!simParsed.success) { orfaosSimulado++; continue }

    const ciclo_nome = simParsed.data.Ciclo
    // Ciclo 0 (Diagnóstico / Simulado Zero) é ignorado por completo — mesma regra
    // do upload manual (parsearPlanilha exclui 'Ciclo 0'/'Diagnóstico'/'Simulado
    // Zero'). Inclui os simulados de 1ª fase diagnóstica do próprio Ciclo 0.
    if (numeroCiclo(ciclo_nome) < 1) continue
    const modelo = norm(simParsed.data.Modelo)
    const concurso: 'ITA' | 'IME' = modelo.includes('ime') ? 'IME' : 'ITA'
    const fase = detectarFase(str(pick(sim, 'Fase')) ?? '', str(pick(sim, 'Materia')))
    if (!fase) continue                                 // Simulado Zero / fase desconhecida

    // Escopo: só Presencial.
    const aluno = alunoById[idAluno]
    if (!aluno) { orfaosAluno++; continue }
    const turma = norm(str(pick(aluno, 'Turma')) ?? '')
    if (turma !== 'presencial') { pulouPEC++; continue }

    const nome_aluno = str(pick(aluno, 'NomeCompleto')) ?? idAluno
    const mentorId = str(pick(aluno, 'Mentor'))
    const mentor = mentorId ? (str(pick(usuarioById[mentorId] ?? {}, 'Nome')) ?? null) : null

    const base: ResultadoFaseRow = { id_aluno: idAluno, nome_aluno, mentor, ciclo_nome, concurso, fase }
    const gabarito = gabaritoPorSimulado[idSimulado] ?? null

    // ── notas por fase (ver semântica polissêmica de "Nota" no plano) ──
    if (fase === '1fase') {
      base.media_1fase = numFrom(resp, 'Nota')          // já 0-10, inglês fora
      base.acertos_mat_1f = numFrom(resp, 'Acertos Matemática')
      base.acertos_fis_1f = numFrom(resp, 'Acertos Física')
      base.acertos_qui_1f = numFrom(resp, 'Acertos Química')
      base.acertos_ing_1f = numFrom(resp, 'Acertos Inglês')
      // Inglês entra no detalhamento (o gráfico o mostra como "não conta"), mas
      // segue fora de media_1fase — que continua vindo da coluna Nota.
      base.notas_questoes = questoesDaResposta(resp, gabarito)
    } else if (fase === '2fase_mat') {
      base.nota_matematica = numFrom(resp, 'Nota')
      base.notas_questoes = questoesDaResposta(resp, gabarito)
    } else if (fase === '2fase_fis') {
      base.nota_fisica = numFrom(resp, 'Nota')
      base.notas_questoes = questoesDaResposta(resp, gabarito)
    } else if (fase === '2fase_qui') {
      base.nota_quimica = numFrom(resp, 'Nota')
      base.notas_questoes = questoesDaResposta(resp, gabarito)
    } else if (fase === '2fase_port') {
      // ATENÇÃO: em 2ª fase Português, "Nota" é a MÉDIA de linguagens, não a nota
      // de português. Usar as colunas explícitas.
      const port = numFrom(resp, 'Nota Português', 'Nota Portugues')
      const red = numFrom(resp, 'Nota Redação', 'Nota Redacao')
      base.nota_portugues = port
      base.nota_redacao = red
      // ITA: prova só de Português (15 questões objetivas). O IME sobrescreve
      // logo abaixo, recortando o bloco de português da prova de Linguagens.
      base.notas_questoes = questoesDaResposta(resp, gabarito)

      if (concurso === 'IME') {
        // IME (fórmula verificada em 79/79 alunos): a média usa PORTUGUÊS PURO como
        // componente de linguagens — a redação é só critério de eliminação, não
        // entra na média. Média = (3·mat+2.5·fis+2.5·qui+1·port+1·ing)/10.
        base.media_linguagens = port
        // Prova única de "Linguagens" (40 questões): 1..20 Português, 21..40 Inglês.
        // O detalhamento é partido na mesma fronteira que o /20 da nota abaixo, e a
        // numeração original é preservada — notaDeQuestoes divide pela quantidade de
        // chaves, não pelo nome delas.
        base.notas_questoes = questoesDaResposta(resp, gabarito, { de: 1, ate: Q_PORT_IME })
        // Inglês vem no MESMO bloco "Linguagens" (20 questões). Emite linha própria
        // 2fase_ing para alimentar o componente de inglês do ranking (rankings.ts).
        const ingAcertos = numFrom(resp, 'Acertos Inglês', 'Acertos Ingles')
        if (ingAcertos !== null) {
          linhas.push({
            id_aluno: idAluno, nome_aluno, mentor, ciclo_nome, concurso, fase: '2fase_ing',
            nota_ingles: Math.min(10, (ingAcertos / 20) * 10),
            notas_questoes: questoesDaResposta(resp, gabarito, { de: Q_PORT_IME + 1, ate: Q_LINGUAGENS_IME }),
          })
        }
      } else if (port !== null && red === null) {
        // ITA com a objetiva corrigida e a REDAÇÃO AINDA NÃO LANÇADA. Deixar
        // media_linguagens nula é o que sinaliza "pendente" para rankings.ts: o aluno
        // fica com 4 notas, o ciclo dele segue Em andamento e sai do cross-check.
        //
        // O fallback antigo (media_linguagens = português puro) fechava o ciclo com uma
        // média que a planilha não reconhece — foi o que travou o sync do Ciclo 6. Pior:
        // como o sync nunca escreve null e ciclo não-ativo só faz gap-fill, o valor
        // errado congelava assim que o ciclo seguinte começava, e a redação atrasada
        // nunca mais entrava (é o estado em que o Ciclo 5 ficou).
        base.media_linguagens = null
        redacaoPendente.set(ciclo_nome, (redacaoPendente.get(ciclo_nome) ?? 0) + 1)
      } else {
        // ITA: média de linguagens = (português + redação) / 2, conferindo contra a
        // coluna pré-calculada da planilha (±0.05); se divergir, prevalece o cálculo.
        const mediaPlan = numFrom(resp, 'Média Português', 'Media Portugues', 'Nota')
        const mediaCalc = port !== null && red !== null ? (port + red) / 2 : port
        base.media_linguagens =
          mediaPlan !== null && (mediaCalc === null || Math.abs(mediaPlan - mediaCalc) < 0.05)
            ? mediaPlan
            : mediaCalc
      }
    } else if (fase === '2fase_ing') {
      base.nota_ingles = numFrom(resp, 'Nota')
    }

    // Cross-check do detalhamento contra os agregados que a planilha já declara
    // (Acertos por matéria). Roda DEPOIS de todo o mapeamento da fase — inclusive
    // do recorte de Linguagens do IME — para conferir exatamente o que será gravado.
    conferirQuestoes(base, resp, divergenciasQ)

    linhas.push(base)
    ciclosSet.add(ciclo_nome)

    // Agregado declarado (uma vez por aluno+ciclo+concurso).
    const chave = `${idAluno}__${ciclo_nome}__${concurso}`
    if (!declaradosMap.has(chave)) {
      declaradosMap.set(chave, {
        id_aluno: idAluno,
        ciclo_nome,
        concurso,
        media_2fase_declarada: numFrom(resp, 'Média 2a Fase', 'Media 2a Fase'),
        resultado_declarado: str(pick(resp, 'Resultado')),
      })
    }
  }

  if (orfaosAluno) avisos.push(`${orfaosAluno} resposta(s) de aluno sem cadastro — ignoradas.`)
  if (orfaosSimulado) avisos.push(`${orfaosSimulado} resposta(s) de simulado desconhecido — ignoradas.`)
  if (pulouPEC) avisos.push(`${pulouPEC} resposta(s) de aluno não-Presencial — fora do escopo (PEC).`)
  for (const [ciclo, n] of redacaoPendente) {
    avisos.push(`${ciclo} (ITA): ${n} resposta(s) de português sem nota de redação — esses alunos seguem Em andamento.`)
  }
  if (divergenciasQ.length) {
    avisos.push(
      `${divergenciasQ.length} divergência(s) entre o detalhamento por questão e o agregado declarado na planilha ` +
      `(gabarito desalinhado ou agregado desatualizado): ${divergenciasQ.slice(0, 5).join(' | ')}` +
      (divergenciasQ.length > 5 ? ` | … +${divergenciasQ.length - 5}` : ''),
    )
  }

  const comQuestoes = linhas.filter((l) => l.notas_questoes && Object.keys(l.notas_questoes).length).length
  if (comQuestoes) avisos.push(`${comQuestoes} de ${linhas.length} linha(s) com detalhamento por questão.`)

  // Validação de range de nota (invariante nº 1 do skill).
  for (const l of linhas) {
    for (const [k, v] of Object.entries(l)) {
      if (typeof v === 'number' && (k.startsWith('nota_') || k.startsWith('media_')) && (v < 0 || v > 10)) {
        fatais.push(`Nota fora de [0,10]: ${l.nome_aluno} / ${l.ciclo_nome} / ${l.fase} / ${k}=${v}`)
      }
    }
  }

  const ciclosPresentes = [...ciclosSet].sort((a, b) => numeroCiclo(a) - numeroCiclo(b))
  const cicloAtivo = ciclosPresentes.length
    ? ciclosPresentes.reduce((max, c) => (numeroCiclo(c) > numeroCiclo(max) ? c : max))
    : null

  return {
    ok: fatais.length === 0,
    fatais,
    avisos,
    linhas,
    declarados: [...declaradosMap.values()],
    ciclosPresentes,
    cicloAtivo,
  }
}
