// ─────────────────────────────────────────────────────────────────────────────
// Acesso ao Supabase no SERVIDOR, com service_role (bypass de RLS). Usado pelo
// cron/sync, que não tem JWT de usuário. Mesmo padrão já adotado em
// app/api/coruja e app/api/resumo-atendimentos.
//
// Expõe o mesmo shape `Db` que lib/notas.ts consome, para que `recalcularCiclo`
// e `salvarNotasAluno` rodem tanto no browser (token do usuário) quanto no
// servidor (service_role) sem duplicar lógica.
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Contrato mínimo de banco que a lógica compartilhada precisa. O browser tem sua
// própria implementação (lib/notas.ts → browserDb, via token do localStorage).
export type Db = {
  queryAll: (table: string, params?: Record<string, string>, select?: string) => Promise<{ data: any[] | null; error: string | null }>
  insert: (table: string, rows: any) => Promise<{ error: string | null }>
  update: (table: string, filter: Record<string, string>, data: Record<string, any>) => Promise<{ error: string | null }>
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function queryPage(table: string, params: Record<string, string>, select: string) {
  const qs = new URLSearchParams({ select, ...params }).toString()
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers: headers() })
  if (!resp.ok) return { data: null as any[] | null, error: await resp.text() }
  return { data: (await resp.json()) as any[], error: null as string | null }
}

// SELECT paginado — mesmo contorno do teto de 1000 linhas do PostgREST que
// lib/supabase.dbQueryAll faz, com desempate por id.
async function queryAll(table: string, params: Record<string, string> = {}, select = '*') {
  const { limit: _l, offset: _o, ...rest } = params
  const orderCols = (rest.order || '').split(',').map((s) => s.trim().split('.')[0]).filter(Boolean)
  if (!orderCols.includes('id')) rest.order = rest.order ? `${rest.order},id` : 'id'

  const all: any[] = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await queryPage(table, { ...rest, limit: String(pageSize), offset: String(offset) }, select)
    if (error) return { data: null, error }
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return { data: all, error: null }
}

async function insert(table: string, rows: any) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rows),
  })
  if (!resp.ok) return { error: await resp.text() }
  return { error: null }
}

async function update(table: string, filter: Record<string, string>, data: Record<string, any>) {
  const qs = new URLSearchParams(filter).toString()
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(data),
  })
  if (!resp.ok) return { error: await resp.text() }
  return { error: null }
}

export const serverDb: Db = { queryAll, insert, update }
