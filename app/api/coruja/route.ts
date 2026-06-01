import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

const SCHEMA = `
Tabelas disponíveis no banco de dados (PostgreSQL):

1. resultados (notas dos simulados)
   - id_aluno text
   - nome_aluno text
   - mentor text
   - ciclo_nome text  (ex: 'Ciclo 1', 'Ciclo 4')
   - concurso text    ('ITA' ou 'IME')
   - fase text        ('ranking', '1fase', '2fase_mat', '2fase_fis', '2fase_qui', '2fase_port')
   - media_1fase numeric
   - nota_matematica numeric
   - nota_fisica numeric
   - nota_quimica numeric
   - media_linguagens numeric
   - nota_ingles numeric
   - media_2fase numeric
   - resultado_ciclo text ('Aprovado', 'Reprovado', 'Em andamento')

2. atendimentos_mentoria
   - id uuid
   - aluno text
   - mentor text
   - data_atendimento date
   - duracao_minutos integer
   - valor_pago numeric
   - resumo text
   - encaminhamento_psico boolean
   - arquivo_gemini_url text

3. alunos_dados
   - id_aluno text
   - nome text
   - mentor text
   - turma text
   - email text

4. respostas_csat (avaliações de satisfação dos mentores)
   - id uuid
   - pesquisa_id uuid
   - pesquisa_nome text
   - aluno text
   - mentor text
   - qualidade_atendimento smallint  (1-5)
   - organizacao_planejamento smallint
   - diferencial_mentoria smallint
   - clareza_orientacoes smallint
   - acompanhamento_cobranca smallint
   - comunicacao_relacao smallint

5. respostas_professor (avaliações dos professores)
   - id uuid
   - avaliacao_id uuid
   - professor text
   - materia text
   - dominio_conteudo smallint (1-5)
   - clareza_explicacao smallint
   - ritmo_aula smallint
   - teoria_exercicios smallint
   - organizacao_quadro smallint
   - respeito_alunos smallint
   - acessibilidade_duvidas smallint
   - cumprimento_horarios smallint
   - contribuicao_aprendizado smallint
   - adequacao_listas smallint
   - comentario text

6. perfis (mentores)
   - id uuid
   - nome text
   - mentor_nome text
   - papel text ('mentor', 'coordenador', 'aluno')
   - email text
`

async function executarQuery(sql: string): Promise<any[]> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/coruja_query`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_text: sql }),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(err)
  }
  const data = await resp.json()
  return Array.isArray(data) ? data : []
}

// Mantém apenas as últimas N mensagens do histórico para não explodir o contexto
function truncarHistorico(historico: any[], maxMensagens = 6) {
  return historico.slice(-maxMensagens)
}

export async function POST(req: NextRequest) {
  try {
    const { pergunta, historico = [], token } = await req.json()

    if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 500 })
    if (!ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada.' }, { status: 500 })

    const historicoTruncado = truncarHistorico(historico)

    // ── Passo 1: Claude gera o SQL (com histórico para entender perguntas de acompanhamento) ──
    const systemSQL = `Você converte perguntas em SQL para um banco PostgreSQL de uma plataforma de mentoria para vestibulares ITA/IME.

${SCHEMA}

Regras:
- Gere APENAS a query SQL, sem explicações, sem markdown, sem código fence
- Use apenas SELECT — nunca INSERT, UPDATE, DELETE, DROP etc.
- Limite sempre a no máximo 100 linhas com LIMIT 100
- Para médias, use ROUND(AVG(campo)::numeric, 2)
- Para nomes, use ilike para buscas case-insensitive
- A fase 'ranking' em resultados contém a nota final consolidada de cada aluno por ciclo
- Para ranking geral use a tabela resultados WHERE fase = 'ranking'
- Em perguntas de acompanhamento (ex: "sim", "pode mostrar", "quais são"), gere o SQL adequado com base no contexto anterior
- Para perguntas analíticas, de estimativa ou opinativas (ex: "quem tem chance de passar?", "estime os aprovados"), gere SQL para buscar os dados relevantes — o outro sistema fará a análise com os dados retornados
- Retorne NAO_SQL APENAS quando a pergunta não precisar de NENHUM dado do banco (ex: "o que é o ITA?", "quanto é 2+2")
- Para buscar dados completos de um aluno específico: use SEMPRE a tabela resultados com nome_aluno ILIKE '%nome%', sem JOINs — JOINs com atendimentos_mentoria podem retornar 0 linhas por diferença de grafia
- Prefira queries simples e diretas; se precisar de dados de múltiplas tabelas, priorize a tabela resultados que tem todas as notas`

    const sqlResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: systemSQL,
        messages: [...historicoTruncado, { role: 'user', content: pergunta }],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!sqlResp.ok) {
      const errText = await sqlResp.text()
      console.error('[coruja] erro Anthropic SQL:', errText)
      return NextResponse.json({ error: 'Erro ao gerar SQL.' }, { status: 500 })
    }
    const sqlData = await sqlResp.json()
    const sql = sqlData.content?.[0]?.text?.trim() ?? ''

    let dados: any[] = []
    let erroQuery: string | null = null

    if (sql && sql !== 'NAO_SQL') {
      try {
        dados = await executarQuery(sql)
      } catch (e: any) {
        erroQuery = e.message
        console.error('[coruja] erro na query:', erroQuery)
      }
    }

    // ── Passo 2: Claude interpreta e responde ─────────────────────────────────
    const contextoResultado = erroQuery
      ? `Tentei executar a query mas ocorreu um erro: ${erroQuery}`
      : sql === 'NAO_SQL'
      ? 'Esta pergunta não requer consulta ao banco de dados.'
      : dados.length === 0
      ? 'A query retornou zero resultados.'
      : `Resultado da query (${dados.length} linhas):\n${JSON.stringify(dados, null, 2)}`

    const mensagens = [
      ...historicoTruncado,
      {
        role: 'user',
        content: `Pergunta: ${pergunta}\n\n${contextoResultado}\n\nResponda de forma direta e objetiva em português. Se houver dados, organize-os de forma clara. Se não houver dados suficientes, diga.`,
      },
    ]

    const respostaResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: 'Você é a Coruja, assistente inteligente de uma plataforma de mentoria para vestibulares ITA/IME. Responda sempre em português, de forma direta e objetiva. Você tem acesso aos dados reais da plataforma.',
        messages: mensagens,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!respostaResp.ok) {
      const errText = await respostaResp.text()
      console.error('[coruja] erro Anthropic resposta:', errText)
      return NextResponse.json({ error: 'Erro ao gerar resposta.' }, { status: 500 })
    }
    const respostaData = await respostaResp.json()
    const resposta = respostaData.content?.[0]?.text ?? 'Sem resposta.'

    return NextResponse.json({ resposta, sql: sql !== 'NAO_SQL' ? sql : null, linhas: dados.length })

  } catch (e: any) {
    console.error('[coruja] erro inesperado:', e)
    return NextResponse.json({ error: `Erro interno: ${e?.message ?? 'desconhecido'}` }, { status: 500 })
  }
}
