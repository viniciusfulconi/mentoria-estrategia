// ─────────────────────────────────────────────────────────────────────────────
// Edição manual de notas + recálculo de ranking (tela /gestao/notas).
//
// Nas fases com detalhamento por questão (Mat/Fís/Quí/Português) a edição é feita
// QUESTÃO A QUESTÃO: gravamos `notas_questoes` e derivamos a nota agregada dela.
// Assim o gráfico radar (que lê notas_questoes) e a nota bruta ficam sempre
// consistentes. Redação, 1ª fase e Inglês são valores diretos (sem questões).
//
// O RLS já garante que só coordenador/direcao escreve em `resultados`.
// ─────────────────────────────────────────────────────────────────────────────
import { dbQueryAll, dbUpdate, dbInsert } from '@/lib/supabase'
import { calcularRankings } from '@/lib/rankings'

export type FaseConfig = {
  fase: string
  label: string
  campoAgg: string   // coluna da nota agregada
  questoes: boolean  // tem detalhamento por questão (radar)?
}

// Fases na ordem de exibição. Redação é tratada à parte (mesma linha 2fase_port).
export const FASES: FaseConfig[] = [
  { fase: '1fase',      label: '1ª Fase',    campoAgg: 'media_1fase',     questoes: false },
  { fase: '2fase_mat',  label: 'Matemática', campoAgg: 'nota_matematica', questoes: true },
  { fase: '2fase_fis',  label: 'Física',     campoAgg: 'nota_fisica',     questoes: true },
  { fase: '2fase_qui',  label: 'Química',    campoAgg: 'nota_quimica',    questoes: true },
  { fase: '2fase_port', label: 'Português',  campoAgg: 'nota_portugues',  questoes: true },
  { fase: '2fase_ing',  label: 'Inglês',     campoAgg: 'nota_ingles',     questoes: false },
]

// Coluna agregada → fase onde mora (para escrita de valores diretos).
const COLUNA_FASE: Record<string, string> = {
  media_1fase: '1fase',
  nota_matematica: '2fase_mat',
  nota_fisica: '2fase_fis',
  nota_quimica: '2fase_qui',
  nota_portugues: '2fase_port',
  nota_redacao: '2fase_port',
  nota_ingles: '2fase_ing',
}

function arred(n: number, casas = 4): number {
  const f = Math.pow(10, casas)
  return Math.round(n * f) / f
}

// Nota agregada a partir do detalhamento: (soma das questões / nº de questões) * 10.
// Ex.: Física 10 questões → soma; Português 15 questões → soma*10/15.
export function notaDeQuestoes(q: Record<string, any>): number | null {
  const keys = Object.keys(q || {})
  if (keys.length === 0) return null
  const soma = keys.reduce((a, k) => a + (Number(q[k]) || 0), 0)
  return arred((soma / keys.length) * 10)
}

// Salva as notas editadas de um aluno num ciclo e recalcula o ranking.
//   questoesPorFase: fase → notas_questoes editado (grava notas_questoes + agregado)
//   valores: coluna → valor direto (media_1fase, nota_redacao, nota_ingles, ou
//            o agregado de uma fase de questões que não tenha detalhamento)
export async function salvarNotasAluno(opts: {
  ciclo: string
  concurso: string
  linhasAluno: any[]
  questoesPorFase: Record<string, Record<string, number>>
  valores: Record<string, number | null>
}): Promise<void> {
  const { ciclo, concurso, linhasAluno, questoesPorFase, valores } = opts
  const rowDe = (fase: string) => linhasAluno.find(l => l.fase === fase)

  // Monta um payload por fase juntando questões + valores diretos.
  const payloadPorFase: Record<string, any> = {}
  const merge = (fase: string, p: any) => { payloadPorFase[fase] = { ...(payloadPorFase[fase] || {}), ...p } }

  for (const [fase, q] of Object.entries(questoesPorFase)) {
    const cfg = FASES.find(f => f.fase === fase)
    if (!cfg) continue
    merge(fase, { notas_questoes: q, [cfg.campoAgg]: notaDeQuestoes(q) })
  }
  for (const [coluna, valor] of Object.entries(valores)) {
    const fase = COLUNA_FASE[coluna]
    if (!fase) continue
    merge(fase, { [coluna]: valor })
  }

  // Português: media_linguagens = (nota_portugues + nota_redacao) / 2 sempre que
  // a linha de português for tocada (por questões e/ou por redação).
  if (payloadPorFase['2fase_port']) {
    const portRow = rowDe('2fase_port')
    const p = payloadPorFase['2fase_port']
    const port = ('nota_portugues' in p) ? p.nota_portugues : (portRow?.nota_portugues ?? null)
    const red = ('nota_redacao' in p) ? p.nota_redacao : (portRow?.nota_redacao ?? null)
    p.media_linguagens = (port != null && red != null) ? arred((port + red) / 2) : (port ?? red)
  }

  // Aplica: UPDATE se a linha existe, senão INSERT.
  for (const [fase, payload] of Object.entries(payloadPorFase)) {
    const row = rowDe(fase)
    if (row) {
      const { error } = await dbUpdate('resultados', { id: `eq.${row.id}` }, payload)
      if (error) throw new Error(`Erro ao salvar ${fase}: ${error}`)
    } else {
      const ref = linhasAluno[0] || {}
      const { error } = await dbInsert('resultados', {
        id_aluno: ref.id_aluno, nome_aluno: ref.nome_aluno, mentor: ref.mentor ?? null,
        ciclo_nome: ciclo, concurso, fase, ...payload,
      })
      if (error) throw new Error(`Erro ao criar linha ${fase}: ${error}`)
    }
  }

  await recalcularCiclo(ciclo, concurso)
}

// Recalcula as linhas fase='ranking' de um ciclo+concurso a partir das linhas de
// fase atuais, reusando a mesma lógica do upload (lib/rankings.ts).
//
// IMPORTANTE — só faz UPDATE de linhas ranking que JÁ existem; nunca INSERT.
// Motivo: há dados legados (merges de alunos duplicados) em que a linha ranking
// tem concurso divergente das linhas de fase. Inserir recriaria essas duplicatas
// que merges manuais removeram. A classificação é renumerada apenas sobre os
// alunos que já constam no ranking (renumeração contígua, sem buracos).
export async function recalcularCiclo(ciclo: string, concurso: string): Promise<{ atualizados: number }> {
  const { data: rows, error } = await dbQueryAll('resultados', {
    ciclo_nome: `eq.${ciclo}`,
    concurso: `eq.${concurso}`,
  })
  if (error) throw new Error(`Erro ao ler ciclo: ${error}`)

  const todas = rows || []
  const fases = todas.filter(r => r.fase !== 'ranking')
  const rankingsExistentes = todas.filter(r => r.fase === 'ranking')

  const rec = calcularRankings(fases)
  const porAlunoRec = new Map(rec.map(r => [r.id_aluno, r]))

  // Ordena as linhas ranking existentes pela média recalculada (mantém a atual
  // se o aluno não tiver fases) e renumera. Desempate estável por id_aluno —
  // mesmo critério de ordenarEClassificar em lib/rankings.ts.
  const ordenadas = rankingsExistentes
    .map(r => ({ row: r, nr: porAlunoRec.get(r.id_aluno) }))
    .sort((a, b) => {
      const ma = a.nr ? a.nr.media_2fase : a.row.media_2fase
      const mb = b.nr ? b.nr.media_2fase : b.row.media_2fase
      const d = (mb ?? 0) - (ma ?? 0)
      if (Math.abs(d) > 1e-9) return d
      return String(a.row.id_aluno) < String(b.row.id_aluno) ? -1 : 1
    })

  let atualizados = 0
  for (let i = 0; i < ordenadas.length; i++) {
    const { row, nr } = ordenadas[i]
    const classificacao = i + 1
    const payload = nr
      ? {
          media_1fase: nr.media_1fase,
          nota_matematica: nr.nota_matematica,
          nota_fisica: nr.nota_fisica,
          nota_quimica: nr.nota_quimica,
          media_linguagens: nr.media_linguagens,
          nota_ingles: nr.nota_ingles,
          media_2fase: nr.media_2fase,
          resultado_ciclo: nr.resultado_ciclo,
          classificacao,
        }
      : { classificacao }
    const { error: e } = await dbUpdate('resultados', { id: `eq.${row.id}` }, payload)
    if (e) throw new Error(`Erro ao atualizar ranking de ${row.nome_aluno}: ${e}`)
    atualizados++
  }
  return { atualizados }
}
