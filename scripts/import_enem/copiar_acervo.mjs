#!/usr/bin/env node
// Copia o acervo de provas antigas do ENEM do Play Aprovação para a mentoria.
//
// Só linhas de banco: imagens e PDFs continuam servidos pelos buckets PÚBLICOS
// do Play (`questoes` e `simulado-enem-pdfs`). Os uuid das questões são
// preservados, senão o jsonb `areas` das provas deixa de casar.
//
//   node scripts/import_enem/copiar_acervo.mjs check  <caminho-do-.env.local-de-origem>
//   node scripts/import_enem/copiar_acervo.mjs insert <caminho-do-.env.local-de-origem>
//
// JÁ FOI EXECUTADO — o acervo está inteiro neste projeto e as figuras/cadernos
// foram trazidos para o Storage daqui por `desvincular_play.mjs`. Este arquivo
// fica só como registro de como o acervo entrou. O caminho da origem é
// argumento de propósito: a plataforma do trabalho não referencia projeto
// pessoal nenhum. Nada é escrito na origem.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MODO = process.argv[2] || 'check'
const PLAY = process.argv[3]
if (!PLAY) throw new Error('informe o caminho do .env.local do projeto de origem como 2º argumento')
const MENT = fileURLToPath(new URL('../../.env.local', import.meta.url))

const env = (p) => Object.fromEntries(
  readFileSync(p, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const p = env(PLAY), m = env(MENT)
const SRC = { url: p.NEXT_PUBLIC_SUPABASE_URL, key: p.SUPABASE_SERVICE_ROLE_KEY }
const DST = { url: m.NEXT_PUBLIC_SUPABASE_URL, key: m.SUPABASE_SERVICE_ROLE_KEY }
if (SRC.url === DST.url) throw new Error('origem e destino são o mesmo Supabase — abortado')

const hdr = c => ({ apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' })

async function getAll(c, path, pageSize = 500) {
  const out = []
  for (let from = 0; ; from += pageSize) {
    const r = await fetch(`${c.url}/rest/v1/${path}`, {
      headers: { ...hdr(c), Range: `${from}-${from + pageSize - 1}`, 'Range-Unit': 'items' },
    })
    if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`)
    const batch = await r.json()
    out.push(...batch)
    if (batch.length < pageSize) return out
  }
}

async function upsert(c, table, rows, onConflict) {
  const CH = 200
  for (let i = 0; i < rows.length; i += CH) {
    const r = await fetch(`${c.url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { ...hdr(c), Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(rows.slice(i, i + CH)),
    })
    if (!r.ok) throw new Error(`POST ${table} → ${r.status} ${await r.text()}`)
    process.stdout.write(`\r    ${table}: ${Math.min(i + CH, rows.length)}/${rows.length}`)
  }
  if (rows.length) process.stdout.write('\n')
}

// ── 1. provas (só as oficiais; o "inédito" não é prova antiga) ──────────────
const provasSrc = (await getAll(SRC, 'simulado_enem?select=*&order=titulo'))
  .filter(s => /ENEM\s+(\d{4})\s+—\s+caderno/i.test(s.titulo))

// ── 2. itens ────────────────────────────────────────────────────────────────
const itensSrc = await getAll(SRC,
  'questions?select=id,code,year,enem_area,co_item,co_habilidade,tp_lingua,tri_a,tri_b,tri_c,' +
  'answer,difficulty,subject,topic,subtopic,statement,alternatives,solution' +
  '&enem_area=not.is.null&order=code')

// Só os itens realmente usados pelas provas oficiais. O mesmo laço monta o
// mapa item → ano: `questions.year` vem nulo em parte do acervo, e a prova que
// usa o item é a fonte autoritativa do ano.
const usados = new Set()
const anoDoItem = new Map()
for (const s of provasSrc) {
  const ano = Number(s.titulo.match(/(\d{4})/)[1])
  for (const a of (s.areas || [])) {
    for (const k of ['question_ids', 'comuns', 'ingles', 'espanhol']) {
      (a[k] || []).forEach(id => { usados.add(id); anoDoItem.set(id, ano) })
    }
  }
}
const itens = itensSrc.filter(q => usados.has(q.id))
const semAnoProprio = itens.filter(q => !q.year).length
if (semAnoProprio) console.log(`  (year nulo em ${semAnoProprio} itens — ano vem da prova)`)

const anos = [...new Set(provasSrc.map(s => Number(s.titulo.match(/(\d{4})/)[1])))].sort()
console.log(`\nOrigem (Play):`)
console.log(`  provas oficiais ...... ${provasSrc.length}  (${anos.join(', ')})`)
console.log(`  itens com enem_area .. ${itensSrc.length}`)
console.log(`  itens usados ......... ${itens.length}`)
console.log(`  sem gabarito (anulados) ${itens.filter(q => !q.answer).length}`)
console.log(`  sem TRI .............. ${itens.filter(q => q.tri_b == null).length}`)
console.log(`  com figura ........... ${itens.filter(q => /!\[/.test(q.statement || '')).length}`)

const linhasItens = itens.map(q => ({
  id: q.id, code: q.code, ano: anoDoItem.get(q.id) ?? q.year, enem_area: q.enem_area,
  co_item: q.co_item, co_habilidade: q.co_habilidade, tp_lingua: q.tp_lingua,
  tri_a: q.tri_a, tri_b: q.tri_b, tri_c: q.tri_c,
  gabarito: q.answer, dificuldade: q.difficulty,
  materia: q.subject, topico: q.topic, subtopico: q.subtopic,
  enunciado: q.statement, alternativas: q.alternatives, solucao: q.solution,
}))
const linhasProvas = provasSrc.map(s => ({
  id: s.id, titulo: s.titulo, ano: Number(s.titulo.match(/(\d{4})/)[1]),
  descricao: s.descricao, status: s.status === 'published' ? 'published' : 'rascunho',
  pdf_url: s.pdf_url, areas: s.areas, calibracao: s.calibracao, vertical: 'Medicina',
}))

const semPdf = linhasProvas.filter(x => !x.pdf_url)
const semCal = linhasProvas.filter(x => !x.calibracao)
if (semPdf.length) console.log(`  ⚠ provas sem PDF: ${semPdf.map(x => x.ano).join(', ')}`)
if (semCal.length) console.log(`  ⚠ provas sem calibração: ${semCal.map(x => x.ano).join(', ')}`)

if (MODO !== 'insert') { console.log('\n(modo check — nada foi escrito)\n'); process.exit(0) }

console.log(`\nEscrevendo na mentoria:`)
await upsert(DST, 'enem_itens', linhasItens, 'id')
await upsert(DST, 'enem_provas', linhasProvas, 'id')

const [ti, tp] = await Promise.all([
  fetch(`${DST.url}/rest/v1/enem_itens?select=id`,  { headers: { ...hdr(DST), Prefer: 'count=exact', Range: '0-0' } }),
  fetch(`${DST.url}/rest/v1/enem_provas?select=id`, { headers: { ...hdr(DST), Prefer: 'count=exact', Range: '0-0' } }),
])
console.log(`\nVERIFICADO no destino:`)
console.log(`  enem_itens  → ${ti.headers.get('content-range')}`)
console.log(`  enem_provas → ${tp.headers.get('content-range')}\n`)
