import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, requirePapel } from '@/lib/auth-server'
import { serverDb } from '@/lib/db-server'
import { fetchAbas } from '@/lib/google-sheets'
import {
  sincronizarManutencao, importarCiclo, montarSheetsInput, ABAS_NECESSARIAS,
  type SyncReport,
} from '@/lib/sync-simulados'

// Sync diário roda em Node (crypto p/ JWT do Google); nunca em Edge.
// Timeout máximo do plano Hobby = 300s (confirmado na doc da Vercel).
export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function carregarSheets() {
  const abas = await fetchAbas([...ABAS_NECESSARIAS])
  return montarSheetsInput(abas)
}

// Grava uma linha em sync_log (best-effort — falha de log não derruba o sync).
async function registrarLog(row: Record<string, any>) {
  try { await serverDb.insert('sync_log', row) } catch { /* ignora */ }
}

function logRowDe(rep: SyncReport, status: string, duracaoMs: number, origem: string) {
  return {
    status,
    hash: rep.hash,
    ciclos_tocados: rep.ciclosTocados,
    linhas_inseridas: rep.inseridos,
    linhas_atualizadas: rep.atualizados,
    avisos: {
      origem,
      avisos: rep.avisos,
      ciclos_novos: rep.ciclosNovos,
      ignorados_aluno_novo: rep.ignoradosAlunoNovo,
      gate_divergencias: rep.gate.divergencias.slice(0, 20),
    },
    erro: rep.erro ?? null,
    duracao_ms: duracaoMs,
  }
}

// ─── GET: disparo do Vercel Cron ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const emProd = process.env.NODE_ENV === 'production'
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  // Em produção exige o CRON_SECRET (mecanismo oficial da Vercel). Local: libera
  // p/ testar com ?dry=1.
  if (emProd && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const t0 = Date.now()
  try {
    const sheets = await carregarSheets()

    // Skip se nada mudou desde a última execução OK (economiza escrita nos dias
    // sem simulado novo).
    const rep = await sincronizarManutencao({ sheets, db: serverDb, dry: true })
    const { data: ultima } = await serverDb.queryAll('sync_log',
      { status: 'eq.ok', order: 'executado_em.desc', limit: '1' }, 'hash')
    const hashAnterior = ultima?.[0]?.hash
    if (hashAnterior && hashAnterior === rep.hash) {
      await registrarLog(logRowDe(rep, 'skipped', Date.now() - t0, 'cron'))
      return NextResponse.json({ status: 'skipped', motivo: 'sem mudanças', hash: rep.hash })
    }

    // Executa de fato (a não ser que ?dry=1).
    const real = dry ? rep : await sincronizarManutencao({ sheets, db: serverDb, dry: false })
    const status = !real.ok ? 'erro' : real.ciclosNovos.length ? 'ciclo_novo' : 'ok'
    if (!dry) await registrarLog(logRowDe(real, status, Date.now() - t0, 'cron'))
    return NextResponse.json({ ...real, status }, { status: real.ok ? 200 : 500 })
  } catch (e: any) {
    await registrarLog({ status: 'erro', erro: e.message || String(e), duracao_ms: Date.now() - t0, avisos: { origem: 'cron' } })
    return NextResponse.json({ ok: false, erro: e.message || String(e) }, { status: 500 })
  }
}

// ─── POST: acionado pela UI (gestor autenticado) ─────────────────────────────
//   { acao: 'preview' }                 → dry-run de manutenção (mostra o que faria)
//   { acao: 'sincronizar' }             → roda a manutenção agora
//   { acao: 'importar-ciclo', ciclo }   → importa um ciclo novo por completo
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const auth = await verifyAuth(request, body)
  if ('error' in auth) return auth.error
  const semPapel = requirePapel(auth.user, ['coordenador', 'direcao'])
  if (semPapel) return semPapel

  const t0 = Date.now()
  try {
    const sheets = await carregarSheets()
    const acao = body?.acao ?? 'preview'

    if (acao === 'preview') {
      const rep = await sincronizarManutencao({ sheets, db: serverDb, dry: true })
      return NextResponse.json(rep)
    }
    if (acao === 'sincronizar') {
      const rep = await sincronizarManutencao({ sheets, db: serverDb, dry: false })
      const status = !rep.ok ? 'erro' : rep.ciclosNovos.length ? 'ciclo_novo' : 'ok'
      await registrarLog(logRowDe(rep, status, Date.now() - t0, `ui:${auth.user.nome ?? auth.user.id}`))
      return NextResponse.json({ ...rep, status }, { status: rep.ok ? 200 : 500 })
    }
    if (acao === 'importar-ciclo') {
      const ciclo = String(body?.ciclo ?? '').trim()
      if (!ciclo) return NextResponse.json({ error: 'ciclo obrigatório' }, { status: 400 })
      const dry = body?.dry === true
      const rep = await importarCiclo({ sheets, db: serverDb, ciclo, dry })
      if (!dry) await registrarLog(logRowDe(rep, rep.ok ? 'ok' : 'erro', Date.now() - t0, `ui-import:${auth.user.nome ?? auth.user.id}`))
      return NextResponse.json(rep, { status: rep.ok ? 200 : 500 })
    }
    return NextResponse.json({ error: 'ação desconhecida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message || String(e) }, { status: 500 })
  }
}
