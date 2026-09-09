#!/usr/bin/env node
// Corta o vínculo de runtime com o projeto pessoal (Play Aprovação).
//
// O acervo do ENEM foi copiado do Play, mas as 944 figuras e os 11 cadernos
// continuavam sendo servidos pelos buckets DELE. Este script traz os binários
// para o Storage da própria mentoria e reescreve as URLs no banco, para que o
// app do trabalho não dependa de um projeto pessoal para funcionar.
//
//   node scripts/import_enem/desvincular_play.mjs check     # relata
//   node scripts/import_enem/desvincular_play.mjs copiar    # baixa e sobe (idempotente)
//   node scripts/import_enem/desvincular_play.mjs reescrever# troca as URLs no banco
//   node scripts/import_enem/desvincular_play.mjs verificar # 0 referências ao Play?
//
// Só lê do Play por URL pública — nenhuma credencial daquele projeto é usada.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MODO = process.argv[2] || 'check'
const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const env = Object.fromEntries(
  readFileSync(RAIZ + '.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'enem'
const HOST_PLAY = 'mgroarencrbgxrhiquau.supabase.co'
const hdr = { apikey: K, Authorization: `Bearer ${K}` }

const rest = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...init, headers: { ...hdr, 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`)
  const t = await r.text()
  return t ? JSON.parse(t) : null
}
const paginado = async (p) => {
  const out = []
  for (let f = 0; ; f += 500) {
    const r = await fetch(`${U}/rest/v1/${p}`, { headers: { ...hdr, Range: `${f}-${f + 499}`, 'Range-Unit': 'items' } })
    const b = await r.json(); out.push(...b)
    if (b.length < 500) return out
  }
}

/** Caminho de destino, preservando a organização por ano do Play. */
function destinoDe(url) {
  const m = url.match(/\/object\/public\/([^/]+)\/(.+)$/)
  if (!m) return null
  const [, bucket, caminho] = m
  return bucket === 'simulado-enem-pdfs' ? `cadernos/${caminho}` : `figuras/${decodeURIComponent(caminho)}`
}
const urlNova = (dest) => `${U}/storage/v1/object/public/${BUCKET}/${dest}`

// ── levanta tudo que aponta para o Play ─────────────────────────────────────
const itens = await paginado('enem_itens?select=id,code,ano,enunciado,alternativas,solucao&order=code')
const provas = await rest('enem_provas?select=id,ano,pdf_url&order=ano')
const IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/g

const alvos = new Map()   // urlOriginal → destino
for (const q of itens) {
  const txt = (q.enunciado || '') + JSON.stringify(q.alternativas ?? '') + (q.solucao || '')
  for (const m of txt.matchAll(IMG_RE)) {
    if (m[1].includes(HOST_PLAY)) alvos.set(m[1], destinoDe(m[1]))
  }
}
for (const p of provas) if (p.pdf_url?.includes(HOST_PLAY)) alvos.set(p.pdf_url, destinoDe(p.pdf_url))

console.log(`\nApontando para o Play: ${alvos.size} arquivos (${[...alvos.values()].filter(d => d.startsWith('cadernos/')).length} cadernos + ${[...alvos.values()].filter(d => d.startsWith('figuras/')).length} figuras)`)
console.log(`Itens do banco a reescrever: ${itens.filter(q => ((q.enunciado || '') + JSON.stringify(q.alternativas ?? '') + (q.solucao || '')).includes(HOST_PLAY)).length}`)
console.log(`Provas a reescrever: ${provas.filter(p => p.pdf_url?.includes(HOST_PLAY)).length}`)

if (MODO === 'check') { console.log('\n(modo check — nada foi alterado)\n'); process.exit(0) }

// ── copiar ──────────────────────────────────────────────────────────────────
if (MODO === 'copiar') {
  // bucket público: o conteúdo é prova oficial do INEP, e o aluno precisa abrir
  const cr = await fetch(`${U}/storage/v1/bucket`, {
    method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  })
  console.log(`\nbucket "${BUCKET}": ${cr.status === 200 ? 'criado' : cr.status === 409 ? 'já existia' : await cr.text()}`)

  const existentes = new Set()
  for (const pref of ['figuras', 'cadernos']) {
    for (let off = 0; ; off += 1000) {
      const r = await fetch(`${U}/storage/v1/object/list/${BUCKET}`, {
        method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: pref, limit: 1000, offset: off }),
      })
      const b = await r.json()
      if (!Array.isArray(b) || b.length === 0) break
      b.forEach(o => existentes.add(`${pref}/${o.name}`))
      if (b.length < 1000) break
    }
  }
  console.log(`já no destino: ${existentes.size}`)

  let ok = 0, pulados = 0, bytes = 0
  const falhas = []
  const lista = [...alvos.entries()]
  for (let i = 0; i < lista.length; i++) {
    const [origem, dest] = lista[i]
    if (existentes.has(dest)) { pulados++; continue }
    try {
      const bin = await fetch(origem)
      if (!bin.ok) { falhas.push([origem, `download ${bin.status}`]); continue }
      const buf = Buffer.from(await bin.arrayBuffer())
      const up = await fetch(`${U}/storage/v1/object/${BUCKET}/${dest}`, {
        method: 'POST',
        headers: { ...hdr, 'Content-Type': bin.headers.get('content-type') || 'application/octet-stream', 'x-upsert': 'true' },
        body: buf,
      })
      if (!up.ok) { falhas.push([origem, `upload ${up.status} ${(await up.text()).slice(0, 90)}`]); continue }
      ok++; bytes += buf.length
    } catch (e) { falhas.push([origem, String(e).slice(0, 80)]) }
    if ((i + 1) % 50 === 0 || i === lista.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${lista.length} · copiados ${ok} · já existiam ${pulados} · falhas ${falhas.length} · ${(bytes / 1048576).toFixed(1)} MB`)
    }
  }
  console.log()
  if (falhas.length) {
    console.log(`\n⚠ ${falhas.length} falha(s):`)
    falhas.slice(0, 10).forEach(([u, e]) => console.log(`   ${e}  ${u.slice(-60)}`))
    process.exit(1)
  }
  console.log('\ncópia completa — rode agora o modo "reescrever"\n')
}

// ── reescrever ──────────────────────────────────────────────────────────────
if (MODO === 'reescrever') {
  const troca = (s) => {
    if (!s) return s
    let out = s
    for (const [orig, dest] of alvos) out = out.split(orig).join(urlNova(dest))
    return out
  }
  let nItens = 0
  for (const q of itens) {
    const antes = JSON.stringify([q.enunciado, q.alternativas, q.solucao])
    const enunciado = troca(q.enunciado)
    const alternativas = q.alternativas ? JSON.parse(troca(JSON.stringify(q.alternativas))) : q.alternativas
    const solucao = troca(q.solucao)
    if (JSON.stringify([enunciado, alternativas, solucao]) === antes) continue
    await rest(`enem_itens?id=eq.${q.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ enunciado, alternativas, solucao }) })
    nItens++
    if (nItens % 50 === 0) process.stdout.write(`\r  itens reescritos: ${nItens}`)
  }
  console.log(`\r  itens reescritos: ${nItens}`)
  let nProvas = 0
  for (const p of provas) {
    if (!p.pdf_url?.includes(HOST_PLAY)) continue
    await rest(`enem_provas?id=eq.${p.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pdf_url: urlNova(destinoDe(p.pdf_url)) }) })
    nProvas++
  }
  console.log(`  provas reescritas: ${nProvas}\n`)
}

// ── verificar ───────────────────────────────────────────────────────────────
if (MODO === 'verificar' || MODO === 'reescrever') {
  const it2 = await paginado('enem_itens?select=id,enunciado,alternativas,solucao')
  const pr2 = await rest('enem_provas?select=id,ano,pdf_url')
  const sujos = it2.filter(q => ((q.enunciado || '') + JSON.stringify(q.alternativas ?? '') + (q.solucao || '')).includes(HOST_PLAY))
  const provasSujas = pr2.filter(p => p.pdf_url?.includes(HOST_PLAY))
  console.log('VERIFICAÇÃO')
  console.log(`  itens ainda citando o Play : ${sujos.length}`)
  console.log(`  provas ainda citando o Play: ${provasSujas.length}`)
  // amostra: as novas URLs respondem?
  const amostra = [pr2[0]?.pdf_url, (it2.find(q => /!\[[^\]]*\]\(/.test(q.enunciado || ''))?.enunciado || '').match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1]].filter(Boolean)
  for (const u of amostra) {
    const r = await fetch(u, { method: 'HEAD' })
    console.log(`  ${r.status} ${r.headers.get('content-type')}  ${u.slice(0, 88)}…`)
  }
  console.log(sujos.length === 0 && provasSujas.length === 0 ? '\n✓ nenhuma dependência do projeto pessoal\n' : '\n✗ ainda há vínculo\n')
}
