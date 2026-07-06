import { NextResponse } from 'next/server'

// Opções dos dropdowns do /cadastro (página pública, roda antes de existir
// sessão). Antes o client lia `resultados` e `mentores` direto com a anon key,
// o que exigia policies de leitura anônima nessas tabelas — removidas no
// RLS_HARDENING_PART3. Aqui a leitura roda no servidor com service role e só
// os campos necessários ao formulário saem para o browser.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const dynamic = 'force-dynamic'

// PostgREST devolve no máximo 1000 linhas por request — pagina até o fim.
async function fetchAll(path: string): Promise<any[]> {
  const all: any[] = []
  for (let offset = 0; ; offset += 1000) {
    const resp = await fetch(`${SUPA_URL}/rest/v1/${path}&limit=1000&offset=${offset}&order=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
    if (!resp.ok) throw new Error(await resp.text())
    const rows = await resp.json()
    all.push(...rows)
    if (rows.length < 1000) return all
  }
}

export async function GET() {
  try {
    const [ranking, mentoresMed] = await Promise.all([
      fetchAll('resultados?fase=eq.ranking&select=id,id_aluno,nome_aluno,mentor'),
      fetchAll('mentores?vertical=eq.Medicina&select=id,nome'),
    ])

    const mentoresITA = [...new Set(ranking.map(r => r.mentor).filter(Boolean))].sort() as string[]

    const seen = new Set<string>()
    const alunosITA = ranking
      .filter(r => {
        if (!r.id_aluno || seen.has(r.id_aluno)) return false
        seen.add(r.id_aluno)
        return true
      })
      .map(r => ({ id_aluno: r.id_aluno, nome_aluno: r.nome_aluno }))
      .sort((a, b) => (a.nome_aluno || '').localeCompare(b.nome_aluno || ''))

    mentoresMed.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))

    return NextResponse.json({ mentoresITA, mentoresMed, alunosITA })
  } catch {
    return NextResponse.json({ error: 'Falha ao carregar opções' }, { status: 500 })
  }
}
