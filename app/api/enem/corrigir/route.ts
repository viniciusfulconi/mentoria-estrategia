import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'
import { corrigirSimulado, idsDaArea, type QItem } from '@/lib/tri/simulado'
import type { CalibracaoEnem, EnemAreaEntry } from '@/lib/tri/tipos'

export const runtime = 'nodejs'

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = (path: string, init?: RequestInit) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

type ItemRow = QItem & { id: string }

/**
 * POST { tentativa_id, respostas: { "<item id>": "a" }, lingua?: 0|1 }
 *
 * Corrige o cartão pela TRI (3PL/EAP) com a calibração do ano e grava o
 * resultado. O gabarito é lido só aqui, com service-role — nunca trafega para
 * o cliente, nem sob RLS (a policy de `enem_itens` já barra o aluno).
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if ('error' in auth) return auth.error
  const { user } = auth

  let body: { tentativa_id?: string; respostas?: Record<string, string>; lingua?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.tentativa_id) return NextResponse.json({ error: 'Informe tentativa_id.' }, { status: 400 })

  const respostas = body.respostas ?? {}
  const lingua = body.lingua === 0 || body.lingua === 1 ? body.lingua : null

  // 1. a tentativa tem de ser do próprio aluno (staff pode corrigir por ele)
  const tRes = await admin(`enem_tentativas?id=eq.${body.tentativa_id}&select=id,prova_id,aluno_id,status&limit=1`)
  const tentativa = (await tRes.json())?.[0]
  if (!tentativa) return NextResponse.json({ error: 'Tentativa não encontrada.' }, { status: 404 })

  const isStaff = ['coordenador', 'direcao', 'mentor'].includes(user.papel)
  const isDono = user.papel === 'aluno' && user.aluno_id === tentativa.aluno_id
  if (!isDono && !isStaff) return NextResponse.json({ error: 'Sem permissão para esta tentativa.' }, { status: 403 })
  if (tentativa.status === 'enviada' && !isStaff) {
    return NextResponse.json({ error: 'Esta prova já foi enviada.' }, { status: 409 })
  }

  // 2. definição da prova
  const pRes = await admin(`enem_provas?id=eq.${tentativa.prova_id}&select=id,areas,calibracao&limit=1`)
  const prova = (await pRes.json())?.[0]
  if (!prova) return NextResponse.json({ error: 'Prova não encontrada.' }, { status: 404 })
  const areas = (prova.areas ?? []) as EnemAreaEntry[]
  const calibracao = (prova.calibracao ?? {}) as CalibracaoEnem

  // 3. gabarito + parâmetros dos itens que contam (LC já filtrada pela língua)
  const ids = [...new Set(areas.flatMap(a => idsDaArea(a, lingua)))]
  if (ids.length === 0) return NextResponse.json({ error: 'Prova sem questões configuradas.' }, { status: 400 })

  const byId = new Map<string, ItemRow>()
  for (let from = 0; from < ids.length; from += 300) {
    const lote = ids.slice(from, from + 300)
    const r = await admin(`enem_itens?id=in.(${lote.join(',')})&select=id,gabarito,enem_area,tri_a,tri_b,tri_c`)
    for (const q of await r.json()) {
      // lib/tri fala a língua do Play (`answer`/`tags`); o acervo daqui usa
      // `gabarito` e marca anulada com gabarito null.
      byId.set(q.id, { id: q.id, answer: q.gabarito, enem_area: q.enem_area, tri_a: q.tri_a, tri_b: q.tri_b, tri_c: q.tri_c, tags: null })
    }
  }

  // 4. correção (lógica pura, coberta por scripts/test-tri.mjs)
  const correcao = corrigirSimulado(areas, byId, respostas, lingua, calibracao)
  const resultado = { ...correcao, corrigido_em: new Date().toISOString() }

  // 5. grava — service-role passa pelo trigger de proteção
  const up = await admin(`enem_tentativas?id=eq.${tentativa.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      respostas, lingua, resultado,
      status: 'enviada',
      enviada_em: new Date().toISOString(),
    }),
  })
  if (!up.ok) return NextResponse.json({ error: await up.text() }, { status: 500 })

  return NextResponse.json({ resultado })
}
