// ─────────────────────────────────────────────────────────────────────────────
// Orquestração do sync planilha → resultados. Junta as camadas puras:
//   parseSimulados (lib/sheets-parse) → gate de validação → diff → escrita → recalc.
//
// Duas operações, com posturas de risco DIFERENTES:
//
//   sincronizarManutencao()  — o CRON. Só MANTÉM o que já existe:
//     • nunca escreve null (nunca apaga dado);
//     • gap-fill em ciclos antigos (só preenche coluna nula);
//     • overwrite só no ciclo ATIVO (maior ciclo com resposta);
//     • nunca cria linha fase='ranking' → ciclo/aluno novo vira AVISO, não escrita.
//     Isso respeita a trava de recalcularCiclo (lib/notas.ts:127) e limita o
//     estrago máximo de um bug do cron.
//
//   importarCiclo()          — o BOTÃO da UI (gestor autenticado). Importa UM
//     ciclo por completo, incluindo criar linhas ranking — a operação "arriscada"
//     fica só no caminho supervisionado por humano.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import type { Db } from '@/lib/db-server'
import { parseSimulados, type SheetsInput, type ParseResult, type ResultadoFaseRow } from '@/lib/sheets-parse'
import { calcularRankings, ordenarEClassificar } from '@/lib/rankings'

const COLS_NOTA = [
  'media_1fase', 'acertos_mat_1f', 'acertos_fis_1f', 'acertos_qui_1f', 'acertos_ing_1f',
  'nota_matematica', 'nota_fisica', 'nota_quimica', 'media_linguagens',
  'nota_redacao', 'nota_portugues', 'nota_ingles',
] as const

// Colunas de nota definidas (não-undefined) numa linha de fase.
function colsDe(linha: ResultadoFaseRow): [string, number | null][] {
  return COLS_NOTA
    .filter((c) => (linha as any)[c] !== undefined)
    .map((c) => [c, (linha as any)[c] as number | null])
}

// Hash estável do conteúdo mapeado — para pular execução quando nada mudou.
export function hashLinhas(linhas: ResultadoFaseRow[]): string {
  const canon = [...linhas]
    .map((l) => JSON.stringify(l, Object.keys(l).sort()))
    .sort()
    .join('\n')
  return crypto.createHash('sha256').update(canon).digest('hex')
}

export type GateResultado = { ok: boolean; divergencias: string[]; comparados: number }

// GATE de mapeamento: em ciclos COMPLETOS (ITA e IME) a média recalculada tem que
// bater com a declarada na planilha — as duas fórmulas são inequívocas e estão
// verificadas contra os dados reais. Divergência = regressão de mapeamento (coluna
// renomeada, nota no lugar errado, estrutura de aba mudou) → ABORTA antes de
// escrever. Ciclos em andamento não entram (planilha usa /5 fixo, rankings.ts usa
// /nº presentes — diferença de fórmula esperada, não de mapeamento).
export function validarGate(parse: ParseResult): GateResultado {
  const rankings = ordenarEClassificar(calcularRankings(parse.linhas))
  const recPorChave = new Map(rankings.map((x) => [`${x.id_aluno}__${x.ciclo_nome}__${x.concurso}`, x]))
  const divergencias: string[] = []
  let comparados = 0
  for (const d of parse.declarados) {
    if (d.media_2fase_declarada == null) continue
    const rec = recPorChave.get(`${d.id_aluno}__${d.ciclo_nome}__${d.concurso}`)
    if (!rec || rec.media_2fase == null || rec.resultado_ciclo === 'Em andamento') continue
    comparados++
    if (Math.abs(rec.media_2fase - d.media_2fase_declarada) > 0.05) {
      divergencias.push(`${d.ciclo_nome}/${d.concurso}/${d.id_aluno}: recalc=${rec.media_2fase.toFixed(3)} planilha=${d.media_2fase_declarada.toFixed(3)}`)
    }
  }
  return { ok: divergencias.length === 0, divergencias, comparados }
}

const chaveCicloConcurso = (l: { ciclo_nome: string; concurso: string }) => `${l.ciclo_nome}__${l.concurso}`

export type SyncReport = {
  ok: boolean
  dry: boolean
  erro?: string
  hash: string
  fatais: string[]
  avisos: string[]
  gate: GateResultado
  cicloAtivo: string | null
  ciclosTocados: string[]
  ciclosNovos: string[]
  inseridos: number
  atualizados: number
  ignoradosAlunoNovo: number
}

function reportBase(parse: ParseResult, dry: boolean): SyncReport {
  return {
    ok: false, dry, hash: hashLinhas(parse.linhas),
    fatais: parse.fatais, avisos: [...parse.avisos],
    gate: { ok: true, divergencias: [], comparados: 0 },
    cicloAtivo: parse.cicloAtivo, ciclosTocados: [], ciclosNovos: [],
    inseridos: 0, atualizados: 0, ignoradosAlunoNovo: 0,
  }
}

// ─── CRON: manutenção ────────────────────────────────────────────────────────
export async function sincronizarManutencao(opts: { sheets: SheetsInput; db: Db; dry?: boolean }): Promise<SyncReport> {
  const { sheets, db, dry = false } = opts
  const parse = parseSimulados(sheets)
  const rep = reportBase(parse, dry)

  if (!parse.ok) { rep.erro = 'Validação de colunas/notas falhou.'; return rep }

  rep.gate = validarGate(parse)
  if (!rep.gate.ok) {
    rep.erro = `Cross-check ITA falhou (${rep.gate.divergencias.length} divergência(s)) — mapeamento suspeito, nada escrito.`
    return rep
  }

  // Agrupa linhas por ciclo+concurso.
  const porCiclo = new Map<string, ResultadoFaseRow[]>()
  for (const l of parse.linhas) {
    const k = chaveCicloConcurso(l)
    if (!porCiclo.has(k)) porCiclo.set(k, [])
    porCiclo.get(k)!.push(l)
  }

  const ciclosTocados = new Set<string>()

  for (const [, linhas] of porCiclo) {
    const ciclo_nome = linhas[0].ciclo_nome
    const concurso = linhas[0].concurso
    const ehAtivo = ciclo_nome === parse.cicloAtivo

    const { data: existentes, error } = await db.queryAll('resultados', {
      ciclo_nome: `eq.${ciclo_nome}`, concurso: `eq.${concurso}`,
    })
    if (error) { rep.erro = `Erro ao ler ${ciclo_nome}/${concurso}: ${error}`; return rep }

    // Aluno "conhecido" = tem linha de ranking (é o que o app exibe). Ciclo novo
    // = nenhum ranking → não escreve, só avisa.
    const rankingAlunos = new Set((existentes || []).filter((r) => r.fase === 'ranking').map((r) => r.id_aluno))
    if (rankingAlunos.size === 0) {
      rep.ciclosNovos.push(`${ciclo_nome} (${concurso})`)
      continue
    }

    const existentePorChave = new Map((existentes || []).map((r) => [`${r.id_aluno}__${r.fase}`, r]))
    let tocouCiclo = false

    for (const linha of linhas) {
      if (!rankingAlunos.has(linha.id_aluno)) { rep.ignoradosAlunoNovo++; continue }

      const existente = existentePorChave.get(`${linha.id_aluno}__${linha.fase}`)
      const payload: Record<string, number> = {}
      for (const [col, val] of colsDe(linha)) {
        if (val === null) continue                        // NUNCA escreve null
        if (existente) {
          if (ehAtivo || existente[col] == null) payload[col] = val   // overwrite ativo / gap-fill antigo
        } else {
          payload[col] = val                              // linha de fase nova p/ aluno conhecido
        }
      }
      if (Object.keys(payload).length === 0) continue

      if (dry) { if (existente) rep.atualizados++; else rep.inseridos++; tocouCiclo = true; continue }

      if (existente) {
        const { error: e } = await db.update('resultados', { id: `eq.${existente.id}` }, payload)
        if (e) { rep.erro = `Erro update ${linha.nome_aluno}/${linha.fase}: ${e}`; return rep }
        rep.atualizados++
      } else {
        const { error: e } = await db.insert('resultados', {
          id_aluno: linha.id_aluno, nome_aluno: linha.nome_aluno, mentor: linha.mentor,
          ciclo_nome, concurso, fase: linha.fase, ...payload,
        })
        if (e) { rep.erro = `Erro insert ${linha.nome_aluno}/${linha.fase}: ${e}`; return rep }
        rep.inseridos++
      }
      tocouCiclo = true
    }

    if (tocouCiclo) ciclosTocados.add(`${ciclo_nome}__${concurso}`)
  }

  // Recalcula ranking dos ciclos tocados (só UPDATE de rankings existentes).
  if (!dry) {
    const { recalcularCiclo } = await import('@/lib/notas')
    for (const chave of ciclosTocados) {
      const [ciclo_nome, concurso] = chave.split('__')
      try {
        await recalcularCiclo(ciclo_nome, concurso, db)
      } catch (e: any) {
        rep.erro = `Erro ao recalcular ${ciclo_nome}/${concurso}: ${e.message || e}`
        return rep
      }
    }
  }

  rep.ciclosTocados = [...ciclosTocados].map((k) => k.replace('__', ' / '))
  rep.ok = true
  return rep
}

// ─── UI: importar um ciclo por completo (inclui criar ranking) ───────────────
// Usado pelo botão "Importar da planilha" quando um ciclo novo é detectado.
// Só é chamado por gestor autenticado. Retorna preview quando dry=true.
export async function importarCiclo(opts: { sheets: SheetsInput; db: Db; ciclo: string; dry?: boolean }): Promise<SyncReport> {
  const { sheets, db, ciclo, dry = false } = opts
  const parse = parseSimulados(sheets)
  const rep = reportBase(parse, dry)
  if (!parse.ok) { rep.erro = 'Validação de colunas/notas falhou.'; return rep }

  rep.gate = validarGate(parse)
  // No import manual o gate é informativo (não aborta) — o gestor vê e decide.

  const linhas = parse.linhas.filter((l) => l.ciclo_nome === ciclo)
  if (!linhas.length) { rep.erro = `Ciclo "${ciclo}" não tem linhas na planilha.`; return rep }

  const porConcurso = new Map<string, ResultadoFaseRow[]>()
  for (const l of linhas) {
    if (!porConcurso.has(l.concurso)) porConcurso.set(l.concurso, [])
    porConcurso.get(l.concurso)!.push(l)
  }

  for (const [concurso, ls] of porConcurso) {
    if (!dry) {
      for (const l of ls) {
        const payload: Record<string, number> = {}
        for (const [col, val] of colsDe(l)) if (val !== null) payload[col] = val
        const { error } = await db.insert('resultados', {
          id_aluno: l.id_aluno, nome_aluno: l.nome_aluno, mentor: l.mentor,
          ciclo_nome: ciclo, concurso, fase: l.fase, ...payload,
        })
        if (error) { rep.erro = `Erro insert ${l.nome_aluno}/${l.fase}: ${error}`; return rep }
        rep.inseridos++
      }
      // Cria as linhas de ranking do ciclo (operação que o cron NÃO faz).
      const rankings = ordenarEClassificar(calcularRankings(ls))
      for (const rk of rankings) {
        const { error } = await db.insert('resultados', { ...rk })
        if (error) { rep.erro = `Erro insert ranking ${rk.nome_aluno}: ${error}`; return rep }
      }
    } else {
      rep.inseridos += ls.length
    }
  }

  rep.ciclosTocados = [`${ciclo}`]
  rep.ok = true
  return rep
}

// Nomes das abas necessárias (a rota busca e monta o SheetsInput).
export const ABAS_NECESSARIAS = ['Respostas-Simulado', 'Simulados', 'Cadastro Alunos', 'Usuarios'] as const

export function montarSheetsInput(abas: Record<string, any[]>): SheetsInput {
  return {
    respostas: abas['Respostas-Simulado'] || [],
    simulados: abas['Simulados'] || [],
    cadastroAlunos: abas['Cadastro Alunos'] || [],
    usuarios: abas['Usuarios'] || [],
  }
}
