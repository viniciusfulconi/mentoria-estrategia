import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'
import { isAnulada } from '@/lib/tri/simulado'
import { prob3PL, D } from '@/lib/tri/index'
import type { EnemAreaEntry, EnemArea } from '@/lib/tri/tipos'
import STATS_2025 from '@/lib/tri/enem_stats_2025.json'
import STATS_2024 from '@/lib/tri/enem_stats_2024.json'
import STATS_2023 from '@/lib/tri/enem_stats_2023.json'
import STATS_2022 from '@/lib/tri/enem_stats_2022.json'
import STATS_2021 from '@/lib/tri/enem_stats_2021.json'
import STATS_2020 from '@/lib/tri/enem_stats_2020.json'
import STATS_2019 from '@/lib/tri/enem_stats_2019.json'
import STATS_2018 from '@/lib/tri/enem_stats_2018.json'
import STATS_2017 from '@/lib/tri/enem_stats_2017.json'
import STATS_2016 from '@/lib/tri/enem_stats_2016.json'
import STATS_2015 from '@/lib/tri/enem_stats_2015.json'

export const runtime = 'nodejs'

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = (path: string) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  }).then(r => r.json())

type StatRow = { n: number; gab: string | null; a: number; b: number; c: number; d: number; e: number; branco: number; pCorrect: number | null }
// Os `code` são únicos entre anos, então os bundles do microdado se mesclam.
const stats: Record<string, StatRow> = {
  ...(STATS_2025 as Record<string, StatRow>), ...(STATS_2024 as Record<string, StatRow>),
  ...(STATS_2023 as Record<string, StatRow>), ...(STATS_2022 as Record<string, StatRow>),
  ...(STATS_2021 as Record<string, StatRow>), ...(STATS_2020 as Record<string, StatRow>),
  ...(STATS_2019 as Record<string, StatRow>), ...(STATS_2018 as Record<string, StatRow>),
  ...(STATS_2017 as Record<string, StatRow>), ...(STATS_2016 as Record<string, StatRow>),
  ...(STATS_2015 as Record<string, StatRow>),
}

/** Ordem do cartão: em LC vem a língua escolhida (1–5) e depois as comuns. */
function linhasDaArea(entry: EnemAreaEntry, lingua: number | null): { n: number; qid: string }[] {
  const ids = entry.area === 'LC'
    ? [...((lingua === 1 ? entry.espanhol : entry.ingles) ?? []), ...(entry.comuns ?? [])]
    : (entry.question_ids ?? [])
  const base = entry.base ?? 0
  return ids.map((qid, i) => ({ n: base + i + 1, qid }))
}

/** Informação do item 3PL em θ — quanto aquela questão pesou na nota do aluno. */
function itemInfo(theta: number, a: number, b: number, c: number): number {
  const P = prob3PL(theta, a, b, c)
  if (P <= c + 1e-9 || P >= 1 - 1e-9) return 0
  const num = (P - c) * (P - c) * (1 - P)
  const den = (1 - c) * (1 - c) * P
  return D * D * a * a * (num / den)
}

/** POST { tentativa_id } → detalhe por questão + notas por matéria + ranking. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if ('error' in auth) return auth.error
  const { user } = auth

  let body: { tentativa_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.tentativa_id) return NextResponse.json({ error: 'Informe tentativa_id.' }, { status: 400 })

  const tentativa = (await admin(`enem_tentativas?id=eq.${body.tentativa_id}&select=*&limit=1`))?.[0]
  if (!tentativa) return NextResponse.json({ error: 'Tentativa não encontrada.' }, { status: 404 })
  if (tentativa.status !== 'enviada') {
    return NextResponse.json({ error: 'Prova ainda não enviada.' }, { status: 400 })
  }

  // Gabarito e resolução só saem daqui para quem tem direito: o próprio aluno,
  // a coordenação, ou o mentor DAQUELE aluno (não de qualquer um).
  const ehDono = user.papel === 'aluno' && user.aluno_id === tentativa.aluno_id
  const ehGestor = user.papel === 'coordenador' || user.papel === 'direcao'
  let permitido = ehDono || ehGestor
  if (!permitido && user.papel === 'mentor') {
    const m = await admin(`mentores?nome=eq.${encodeURIComponent(user.mentor_nome || user.nome || '')}&select=id`)
    const mentorId = m?.[0]?.id
    if (mentorId) {
      const meus = await admin(`alunos?mentor_id=eq.${mentorId}&id=eq.${tentativa.aluno_id}&select=id`)
      permitido = (meus?.length ?? 0) > 0
    }
  }
  if (!permitido) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })

  const prova = (await admin(`enem_provas?id=eq.${tentativa.prova_id}&select=id,areas&limit=1`))?.[0]
  if (!prova) return NextResponse.json({ error: 'Prova não encontrada.' }, { status: 404 })

  const areas = (prova.areas ?? []) as EnemAreaEntry[]
  const lingua = tentativa.lingua as number | null
  const respostas = (tentativa.respostas ?? {}) as Record<string, string>
  const resultado = tentativa.resultado ?? { areas: {} }

  const linhasPorArea = new Map<EnemArea, { n: number; qid: string }[]>()
  const todosIds: string[] = []
  for (const entry of areas) {
    const linhas = linhasDaArea(entry, lingua)
    linhasPorArea.set(entry.area, linhas)
    todosIds.push(...linhas.map(l => l.qid))
  }

  const byId = new Map<string, any>()
  for (let from = 0; from < todosIds.length; from += 300) {
    const lote = todosIds.slice(from, from + 300)
    const rows = await admin(`enem_itens?id=in.(${lote.join(',')})&select=id,code,enem_area,gabarito,enunciado,alternativas,solucao,materia,topico,subtopico,dificuldade,tri_a,tri_b,tri_c`)
    for (const q of rows) byId.set(q.id, q)
  }

  const detalhe: Record<string, unknown[]> = {}
  const materiasMap = new Map<string, { materia: string; area: EnemArea; acertos: number; total: number }>()

  for (const entry of areas) {
    const linhas = linhasPorArea.get(entry.area) ?? []
    const theta = resultado.areas?.[entry.area]?.theta ?? 0

    // Ranqueia o impacto dentro da área: a mesma questão pesa diferente para
    // alunos de θ diferente, então o tier é relativo a este aluno.
    const infos: { qid: string; info: number }[] = []
    for (const { qid } of linhas) {
      const q = byId.get(qid)
      if (q && q.gabarito != null && q.tri_a != null) {
        infos.push({ qid, info: itemInfo(theta, +q.tri_a, +q.tri_b, +q.tri_c) })
      }
    }
    const ordenado = [...infos].sort((x, y) => y.info - x.info)
    const tier = new Map<string, 'alto' | 'médio' | 'baixo'>()
    ordenado.forEach((it, i) => {
      const frac = ordenado.length > 1 ? i / (ordenado.length - 1) : 0
      tier.set(it.qid, frac <= 0.33 ? 'alto' : frac <= 0.66 ? 'médio' : 'baixo')
    })

    detalhe[entry.area] = linhas.map(({ n, qid }) => {
      const q = byId.get(qid)
      const marcada = (respostas[qid] || null)?.toLowerCase() || null
      const gab = q?.gabarito?.toLowerCase() || null
      const anulada = q ? isAnulada({ answer: q.gabarito, enem_area: q.enem_area, tri_a: q.tri_a, tri_b: q.tri_b, tri_c: q.tri_c, tags: null }) : false
      const acertou = anulada ? true : (marcada != null && gab != null ? marcada === gab : false)
      const st = q?.code != null ? stats[String(q.code)] : undefined

      if (q?.materia) {
        const m = materiasMap.get(q.materia) ?? { materia: q.materia, area: entry.area, acertos: 0, total: 0 }
        m.total++; if (acertou) m.acertos++
        materiasMap.set(q.materia, m)
      }

      return {
        n, qid, code: q?.code ?? null, area: entry.area,
        marcada, gabarito: gab, acertou, anulada, respondeu: marcada != null,
        dificuldade: q?.dificuldade ?? null,
        pCorrect: st?.pCorrect ?? null,
        dist: st ? { a: st.a, b: st.b, c: st.c, d: st.d, e: st.e, branco: st.branco } : null,
        nParticipantes: st?.n ?? null,
        impacto: tier.get(qid) ?? null,
        materia: q?.materia ?? null, topico: q?.topico ?? null, subtopico: q?.subtopico ?? null,
        enunciado: q?.enunciado ?? '', alternativas: q?.alternativas ?? [], solucao: q?.solucao ?? null,
      }
    })
  }

  // Ranking contra os outros alunos da mentoria que enviaram esta mesma prova.
  const enviadas = (await admin(`enem_tentativas?prova_id=eq.${tentativa.prova_id}&status=eq.enviada&select=id,resultado`))
    .filter((a: any) => a.resultado)

  const rankDe = (meu: number, valores: number[]) => {
    const validos = valores.filter(v => Number.isFinite(v))
    const melhores = validos.filter(v => v > meu).length
    const naoMelhores = validos.filter(v => v <= meu).length
    return { rank: melhores + 1, total: validos.length, percentil: validos.length ? Math.round(100 * naoMelhores / validos.length) : null }
  }

  const ranking: Record<string, { rank: number; total: number; percentil: number | null; nota: number }> = {}
  for (const area of ['LC', 'CH', 'CN', 'MT'] as EnemArea[]) {
    const minha = resultado.areas?.[area]?.nota
    if (minha == null) continue
    ranking[area] = { ...rankDe(minha, enviadas.map((a: any) => a.resultado?.areas?.[area]?.nota).filter((v: any) => v != null)), nota: minha }
  }
  const minhaGeral = resultado.nota_media_areas ?? 0
  ranking.GERAL = { ...rankDe(minhaGeral, enviadas.map((a: any) => a.resultado?.nota_media_areas).filter((v: any) => v != null)), nota: minhaGeral }

  const materias = [...materiasMap.values()]
    .map(m => ({ ...m, pct: m.total ? Math.round(100 * m.acertos / m.total) : 0 }))
    .sort((x, y) => x.area.localeCompare(y.area) || y.pct - x.pct)

  return NextResponse.json({
    detalhe, materias, ranking,
    theta: Object.fromEntries((['LC', 'CH', 'CN', 'MT'] as EnemArea[]).map(a => [a, resultado.areas?.[a]?.theta ?? null])),
  })
}
