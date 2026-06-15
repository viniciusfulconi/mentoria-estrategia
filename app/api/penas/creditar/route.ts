import { NextRequest, NextResponse } from 'next/server'

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function restFetch(path: string, method: string, body?: object, token?: string) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return res
}

export async function POST(req: NextRequest) {
  const { aluno_id, valor, tipo, descricao } = await req.json()

  if (!aluno_id || !valor || valor <= 0 || !tipo) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const token = req.headers.get('authorization')?.replace('Bearer ', '')

  // Upsert no saldo (cria linha ou incrementa)
  const saldoRes = await fetch(`${SUPA_URL}/rest/v1/moedas_saldo?aluno_id=eq.${aluno_id}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=merge-duplicates',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ aluno_id, saldo: valor, updated_at: new Date().toISOString() }),
  })

  // Se já existe, faz PATCH para incrementar
  if (!saldoRes.ok) {
    await restFetch(
      `moedas_saldo?aluno_id=eq.${aluno_id}`,
      'PATCH',
      { saldo: valor, updated_at: new Date().toISOString() },
      token ?? undefined
    )
  }

  // Registra transação
  await restFetch('moedas_transacoes', 'POST', {
    aluno_id,
    tipo,
    valor,
    descricao: descricao || `+${valor} penas`,
  }, token ?? undefined)

  return NextResponse.json({ ok: true })
}
