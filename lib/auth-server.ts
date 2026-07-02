import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type Papel = 'coordenador' | 'direcao' | 'mentor' | 'professor' | 'aluno'

export type Status = 'pendente' | 'aprovado' | 'bloqueado'

export type AuthUser = {
  id: string
  email: string | null
  nome: string | null
  papel: Papel
  status: Status
  aluno_id: string | null
  mentor_nome: string | null
  vertical: 'ITA' | 'Medicina' | null
  token: string
}

function extractToken(req: NextRequest, fallbackBody?: any): string | null {
  const header = req.headers.get('authorization')
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null
  if (typeof fallbackBody?.token === 'string') return fallbackBody.token
  return null
}

async function fetchPerfil(userId: string, token: string): Promise<Omit<AuthUser, 'token'> | null> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/perfis?id=eq.${userId}&select=id,email,nome,papel,status,aluno_id,mentor_nome,vertical`,
    {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!resp.ok) return null
  const data = await resp.json()
  return Array.isArray(data) && data[0] ? data[0] : null
}

async function verifyTokenWithSupabase(token: string): Promise<{ id: string; email: string | null } | null> {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!resp.ok) return null
  const u = await resp.json()
  if (!u?.id) return null
  return { id: u.id, email: u.email ?? null }
}

export async function verifyAuth(
  req: NextRequest,
  fallbackBody?: any,
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const token = extractToken(req, fallbackBody)
  if (!token) return { error: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }

  const sessionUser = await verifyTokenWithSupabase(token)
  if (!sessionUser) return { error: NextResponse.json({ error: 'Sessão inválida' }, { status: 401 }) }

  const perfil = await fetchPerfil(sessionUser.id, token)
  if (!perfil) return { error: NextResponse.json({ error: 'Perfil não encontrado' }, { status: 403 }) }

  // Conta não aprovada (pendente/bloqueada) não acessa nenhuma rota de API,
  // mesmo com JWT válido — antes o gate de status existia só no cliente.
  if (perfil.status !== 'aprovado') {
    return { error: NextResponse.json({ error: 'Conta não aprovada' }, { status: 403 }) }
  }

  return { user: { ...perfil, email: perfil.email ?? sessionUser.email, token } }
}

export function requirePapel(user: AuthUser, papeis: Papel[]): NextResponse | null {
  if (!papeis.includes(user.papel)) {
    return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 })
  }
  return null
}
