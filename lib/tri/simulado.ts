// Correção de um simulado ENEM inteiro: agrupa por área, filtra a língua escolhida
// em LC, credita anuladas (fora do θ) e produz a nota por área via TRI (3PL/EAP).
// Lógica pura (sem DB) para ser testável e reutilizada pela rota de correção.

import { eapTheta, scoreFromTheta, LINKING_PADRAO, type RespostaItem } from './index'
import type { CalibracaoEnem, EnemAreaEntry, EnemArea } from './tipos'

export type QItem = {
  answer: string | null
  enem_area: string | null
  tri_a: number | null
  tri_b: number | null
  tri_c: number | null
  tags: string[] | null
}

export type AreaResultadoFull = {
  acertos: number
  total: number
  itens_tri: number
  theta: number
  erro_padrao: number
  nota: number
}

export type CorrecaoResultado = {
  areas: Partial<Record<EnemArea, AreaResultadoFull>>
  nota_media_areas: number
  itens_sem_parametro: number
}

// Questões que a área contabiliza nesta tentativa (LC depende da língua escolhida).
export function idsDaArea(entry: EnemAreaEntry, lingua: number | null): string[] {
  if (entry.area === 'LC') {
    const lang = lingua === 1 ? entry.espanhol : entry.ingles
    return [...(entry.comuns ?? []), ...(lang ?? [])]
  }
  return entry.question_ids ?? []
}

export function isAnulada(q: QItem): boolean {
  return q.answer == null || (q.tags ?? []).includes('anulada')
}

export function corrigirSimulado(
  areas: EnemAreaEntry[],
  questionsById: Map<string, QItem>,
  respostas: Record<string, string>,
  lingua: number | null,
  calibracao: CalibracaoEnem = {},
): CorrecaoResultado {
  const resultadoAreas: Partial<Record<EnemArea, AreaResultadoFull>> = {}
  const semParametro: string[] = []

  for (const entry of areas) {
    const ids = idsDaArea(entry, lingua)
    const cal = calibracao[entry.area] ?? LINKING_PADRAO
    let acertos = 0
    let total = 0
    const triItens: RespostaItem[] = []

    for (const qid of ids) {
      const q = questionsById.get(qid)
      if (!q) continue
      total += 1
      if (isAnulada(q)) { acertos += 1; continue } // anulada: crédito a todos, fora do θ
      const marcada = (respostas[qid] ?? '').trim().toLowerCase()
      const correct = marcada !== '' && marcada === (q.answer ?? '').trim().toLowerCase()
      if (correct) acertos += 1
      if (q.tri_a != null && q.tri_b != null && q.tri_c != null) {
        triItens.push({ a: Number(q.tri_a), b: Number(q.tri_b), c: Number(q.tri_c), correct })
      } else {
        semParametro.push(qid)
      }
    }

    const { theta, se } = triItens.length ? eapTheta(triItens) : { theta: 0, se: 1 }
    resultadoAreas[entry.area] = {
      acertos,
      total,
      itens_tri: triItens.length,
      theta: Math.round(theta * 1000) / 1000,
      erro_padrao: Math.round(se * 1000) / 1000,
      nota: scoreFromTheta(theta, cal),
    }
  }

  const notasAreas = Object.values(resultadoAreas).map(a => a.nota)
  const nota_media_areas = notasAreas.length
    ? Math.round((notasAreas.reduce((s, n) => s + n, 0) / notasAreas.length) * 10) / 10
    : 0

  return { areas: resultadoAreas, nota_media_areas, itens_sem_parametro: semParametro.length }
}
