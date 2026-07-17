// ─────────────────────────────────────────────────────────────────────────────
// Leitura da planilha do Google Sheets via API REST, autenticando com service
// account. SEM dependência externa: o JWT RS256 é assinado com o `crypto` nativo
// do Node e trocado por um access token no endpoint OAuth do Google. Segue o
// estilo do repo (REST cru, sem clients pesados — ver lib/supabase.ts).
//
// Escopo mínimo: spreadsheets.readonly (a service account só tem acesso de leitor).
// Só roda no servidor (Node runtime) — usa node:crypto.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto'
import type { Row } from '@/lib/sheets-parse'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

// Chave privada do JSON da service account vem com \n LITERAIS (barra+n) quando
// colada em env var — normaliza para quebras reais antes de assinar.
function normalizarChave(pk: string): string {
  return pk.includes('\\n') ? pk.replace(/\\n/g, '\n') : pk
}

function lerCredenciais() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!email || !key || !sheetId) {
    throw new Error('Credenciais do Google ausentes (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID).')
  }
  return { email, key: normalizarChave(key), sheetId }
}

// Assina o JWT e troca por access token (válido ~1h; pedimos e usamos na hora).
async function obterAccessToken(email: string, privateKey: string): Promise<string> {
  const agora = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: agora,
    exp: agora + 3600,
  }
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey)
  const assertion = `${unsigned}.${b64url(signature)}`

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!resp.ok) {
    throw new Error(`Falha ao obter token do Google (${resp.status}): ${await resp.text()}`)
  }
  const json = await resp.json()
  if (!json.access_token) throw new Error('Resposta do Google sem access_token.')
  return json.access_token as string
}

// Nome de aba em A1 notation: aspas simples se tiver caractere não alfanumérico
// (ex.: hífen em "Respostas-Simulado"). Aspas simples internas viram '' .
function rangeDeAba(nome: string): string {
  if (/^[A-Za-z0-9_]+$/.test(nome)) return nome
  return `'${nome.replace(/'/g, "''")}'`
}

// Converte a matriz de valores (Sheets API) em array de objetos {header: valor},
// mesmo shape de XLSX.utils.sheet_to_json — a camada de parse não distingue a fonte.
function valoresParaLinhas(values: any[][] | undefined): Row[] {
  if (!values || values.length < 2) return []
  const headers = (values[0] || []).map((h) => String(h ?? '').trim())
  const linhas: Row[] = []
  for (let i = 1; i < values.length; i++) {
    const raw = values[i] || []
    // linha totalmente vazia → ignora (sheet_to_json também pula)
    if (raw.every((c) => c === null || c === undefined || c === '')) continue
    const obj: Row = {}
    headers.forEach((h, j) => { if (h) obj[h] = raw[j] ?? null })
    linhas.push(obj)
  }
  return linhas
}

// Lê várias abas de uma vez (values:batchGet). Devolve mapa nomeAba → linhas.
export async function fetchAbas(nomes: string[]): Promise<Record<string, Row[]>> {
  const { email, key, sheetId } = lerCredenciais()
  const token = await obterAccessToken(email, key)

  const params = new URLSearchParams()
  for (const nome of nomes) params.append('ranges', rangeDeAba(nome))
  params.set('valueRenderOption', 'UNFORMATTED_VALUE')
  params.set('dateTimeRenderOption', 'FORMATTED_STRING')

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) {
    throw new Error(`Falha ao ler a planilha (${resp.status}): ${await resp.text()}`)
  }
  const json = await resp.json()
  const valueRanges: any[] = json.valueRanges || []

  // batchGet devolve os ranges na MESMA ORDEM pedida — casa por índice.
  const out: Record<string, Row[]> = {}
  nomes.forEach((nome, i) => { out[nome] = valoresParaLinhas(valueRanges[i]?.values) })
  return out
}
