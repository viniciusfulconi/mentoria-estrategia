import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth, requirePapel } from '@/lib/auth-server'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function restFetch(path: string, method: string, body: object | undefined, token: string) {
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const auth = await verifyAuth(req, body)
  if ('error' in auth) return auth.error
  const { user } = auth

  // Só coordenador/direção credita penas — credito vem de validação de desafio
  const perm = requirePapel(user, ['coordenador', 'direcao'])
  if (perm) return perm

  const { aluno_id, valor, tipo, descricao } = body
  if (!aluno_id || !valor || valor <= 0 || !tipo) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  // Upsert no saldo (cria linha ou incrementa)
  const saldoRes = await restFetch(
    `moedas_saldo?aluno_id=eq.${aluno_id}`,
    'POST',
    { aluno_id, saldo: valor, updated_at: new Date().toISOString() },
    user.token,
  )

  // Se já existe, faz PATCH para incrementar
  if (!saldoRes.ok) {
    await restFetch(
      `moedas_saldo?aluno_id=eq.${aluno_id}`,
      'PATCH',
      { saldo: valor, updated_at: new Date().toISOString() },
      user.token,
    )
  }

  await restFetch('moedas_transacoes', 'POST', {
    aluno_id,
    tipo,
    valor,
    descricao: descricao || `+${valor} penas`,
  }, user.token)

  return NextResponse.json({ ok: true })
}
