import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ─── REST direto — evita lock do cliente JS ───────────────────────────────────

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const ref = supabaseUrl.replace('https://', '').replace('.supabase.co', '')
    const raw = localStorage.getItem(`sb-${ref}-auth-token`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.expires_at && parsed.expires_at < Math.floor(Date.now() / 1000)) return null
    return parsed.access_token ?? null
  } catch { return null }
}

// Versão que lança erro — usar em mutations onde sessão é obrigatória
export function getToken(): string {
  const token = getAccessToken()
  if (!token) throw new Error('Sessão expirada. Faça login novamente.')
  return token
}

function restHeaders(token: string | null, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

type MutResult = { error: string | null }
type QueryResult<T> = { data: T | null; error: string | null }

// SELECT
export async function dbQuery<T = any>(
  table: string,
  params: Record<string, string> = {},
  select = '*'
): Promise<QueryResult<T[]>> {
  const token = getAccessToken()
  const qs = new URLSearchParams({ select, ...params }).toString()
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?${qs}`, {
      headers: restHeaders(token),
    })
    if (!resp.ok) return { data: null, error: await resp.text() }
    return { data: await resp.json(), error: null }
  } catch (e: any) {
    return { data: null, error: e.message }
  }
}

// INSERT — returning=true devolve os registros criados
export async function dbInsert<T = any>(
  table: string,
  rows: Record<string, any> | Record<string, any>[],
  returning = false
): Promise<QueryResult<T[]>> {
  const token = getAccessToken()
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: restHeaders(token, { Prefer: returning ? 'return=representation' : 'return=minimal' }),
      body: JSON.stringify(rows),
    })
    if (!resp.ok) return { data: null, error: await resp.text() }
    const data = returning ? await resp.json() : null
    return { data, error: null }
  } catch (e: any) {
    return { data: null, error: e.message }
  }
}

// UPSERT (INSERT … ON CONFLICT DO UPDATE)
export async function dbUpsert(
  table: string,
  rows: Record<string, any> | Record<string, any>[],
  onConflict: string
): Promise<MutResult> {
  const token = getAccessToken()
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: restHeaders(token, { Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify(rows),
    })
    if (!resp.ok) return { error: await resp.text() }
    return { error: null }
  } catch (e: any) {
    return { error: e.message }
  }
}

// UPDATE — filter usa sintaxe PostgREST: { col: 'eq.valor' }
export async function dbUpdate(
  table: string,
  filter: Record<string, string>,
  data: Record<string, any>
): Promise<MutResult> {
  const token = getAccessToken()
  const qs = new URLSearchParams(filter).toString()
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?${qs}`, {
      method: 'PATCH',
      headers: restHeaders(token, { Prefer: 'return=minimal' }),
      body: JSON.stringify(data),
    })
    if (!resp.ok) return { error: await resp.text() }
    return { error: null }
  } catch (e: any) {
    return { error: e.message }
  }
}

// DELETE — filter usa sintaxe PostgREST: { col: 'eq.valor' }
export async function dbDelete(
  table: string,
  filter: Record<string, string>
): Promise<MutResult> {
  const token = getAccessToken()
  const qs = new URLSearchParams(filter).toString()
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?${qs}`, {
      method: 'DELETE',
      headers: restHeaders(token, { Prefer: 'return=minimal' }),
    })
    if (!resp.ok) return { error: await resp.text() }
    return { error: null }
  } catch (e: any) {
    return { error: e.message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, flowType: 'implicit' },
  global: {
    fetch: (url, options = {}) => {
      const urlStr = url instanceof Request ? url.url : String(url)
      const isAuth = urlStr.includes('/auth/v1/')
      // Timeout em todas as requests: 10s para auth, 30s para dados
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), isAuth ? 10000 : 30000)
      return fetch(url, { ...options, signal: options.signal ?? ctrl.signal, keepalive: !isAuth })
        .finally(() => clearTimeout(tid))
    },
  },
})

export type Turma = {
  id: string
  nome: string
  tipo: 'ITA' | 'Medicina'
  ano: number
  orcamento_total: number
  created_at: string
}

export type Mentor = {
  id: string
  nome: string
  email: string
  turma_id: string
  materia: string
  valor_por_atendimento: number
  nota_media: number
  total_atendimentos: number
  created_at: string
  turma?: Turma
}

export type Aluno = {
  id: string
  nome: string
  email: string
  turma_id: string
  mentor_id: string | null
  created_at: string
  turma?: Turma
  mentor?: Mentor
}

export type Simulado = {
  id: string
  aluno_id: string
  turma_id: string
  titulo: string
  data: string
  nota: number
  materias: Record<string, number>
  created_at: string
  aluno?: Aluno
}

export type Aula = {
  id: string
  titulo: string
  turma_id: string | null
  materia: string
  duracao: string
  youtube_url: string | null
  youtube_id: string | null
  pdf_url: string | null
  imagem_url: string | null
  created_at: string
  turma?: Turma
}

export type Atendimento = {
  id: string
  mentor_id: string
  aluno_id: string
  data: string
  nota: number
  observacao: string
  created_at: string
  mentor?: Mentor
  aluno?: Aluno
}

export type AtendimentoMentoria = {
  id: string
  mentor: string
  aluno: string | null
  data_atendimento: string
  tipo: string
  duracao_minutos: number
  valor_pago: number
  descricao: string | null
  encaminhamento_psico: boolean
  arquivo_gemini_url: string | null
  link_gemini: string | null
  link_gravacao: string | null
  solicitacao_aluno: string | null
}

export type PesquisaCsat = {
  id: string
  nome: string
  data: string
}

export type RespostaCsat = {
  id: string
  pesquisa_id: string
  mentor: string
  qualidade_atendimento: number
  organizacao_planejamento: number
  diferencial_mentoria: number
  clareza_orientacoes: number
  acompanhamento_cobranca: number
  comunicacao_relacao: number
}
