// Teste OFFLINE do parse da planilha — sem rede, sem banco.
// Roda lib/sheets-parse.ts contra o .xlsx local e faz o cross-check do ranking
// recalculado (lib/rankings.ts) contra os agregados declarados na planilha.
//
// Uso:  node scripts/test-sheets-parse.mjs ["caminho/para/planilha.xlsx"]
//
// .mjs (não .ts) de propósito: o tsc do projeto ignora, e o Node importa os
// módulos .ts nativamente (type-stripping) com extensão explícita.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseSimulados } from '../lib/sheets-parse.ts'
import { calcularRankings, ordenarEClassificar } from '../lib/rankings.ts'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const here = dirname(fileURLToPath(import.meta.url))
const xlsxPath = process.argv[2] || join(here, '..', 'AppSheet - Turma Presencial ITA IME 2026.xlsx')

const wb = XLSX.readFile(xlsxPath)
const sheet = (nome) => {
  const ws = wb.Sheets[nome]
  if (!ws) { console.error(`!! aba "${nome}" não existe na planilha`); return [] }
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

const input = {
  respostas: sheet('Respostas-Simulado'),
  simulados: sheet('Simulados'),
  cadastroAlunos: sheet('Cadastro Alunos'),
  usuarios: sheet('Usuarios'),
}

console.log('═'.repeat(72))
console.log('PARSE DA PLANILHA (offline)')
console.log('═'.repeat(72))
console.log(`Respostas lidas: ${input.respostas.length} | Simulados: ${input.simulados.length} | Alunos: ${input.cadastroAlunos.length}`)

const r = parseSimulados(input)

console.log(`\nok=${r.ok}`)
if (r.fatais.length) {
  console.log('\n❌ FATAIS (abortariam a escrita):')
  r.fatais.slice(0, 20).forEach((f) => console.log('  •', f))
  if (r.fatais.length > 20) console.log(`  … +${r.fatais.length - 20}`)
}
if (r.avisos.length) {
  console.log('\n⚠️  AVISOS (não bloqueiam):')
  r.avisos.forEach((a) => console.log('  •', a))
}

console.log(`\nLinhas de fase geradas: ${r.linhas.length}`)
const porFase = {}
for (const l of r.linhas) {
  const k = `${l.concurso} ${l.ciclo_nome} / ${l.fase}`
  porFase[k] = (porFase[k] || 0) + 1
}
console.log('Por concurso/ciclo/fase:')
Object.keys(porFase).sort().forEach((k) => console.log(`  ${k.padEnd(34)} ${porFase[k]}`))

console.log(`\nCiclos presentes: ${r.ciclosPresentes.join(', ')}`)
console.log(`Ciclo ATIVO (único sobrescrito): ${r.cicloAtivo}`)

// ── Cross-check: ranking recalculado vs declarado na planilha ──
console.log('\n' + '─'.repeat(72))
console.log('CROSS-CHECK — media_2fase recalculada (lib/rankings.ts) vs planilha')
console.log('─'.repeat(72))

const rankings = ordenarEClassificar(calcularRankings(r.linhas))
const recByChave = new Map(rankings.map((x) => [`${x.id_aluno}__${x.ciclo_nome}__${x.concurso}`, x]))

// Segmenta: só ciclos COMPLETOS (resultado != 'Em andamento') têm denominador
// idêntico ao da planilha — é aí que um mapeamento errado apareceria. Ciclos em
// andamento divergem por fórmula (planilha /5 fixo, rankings.ts /nº presentes),
// não por bug de mapeamento.
// Dois segmentos:
//  • completo (ITA+IME) → GATE de mapeamento: fórmulas inequívocas, têm que bater.
//  • em andamento       → esperado divergir: planilha usa /5 fixo, rankings.ts /nº presentes.
const seg = {
  gate: { cmp: 0, div: 0, ex: [] },
  andamento: { cmp: 0, div: 0 },
}
for (const d of r.declarados) {
  const rec = recByChave.get(`${d.id_aluno}__${d.ciclo_nome}__${d.concurso}`)
  if (!rec || rec.media_2fase == null || d.media_2fase_declarada == null) continue
  const diff = Math.abs(rec.media_2fase - d.media_2fase_declarada)
  const completo = rec.resultado_ciclo && rec.resultado_ciclo !== 'Em andamento'
  const bucket = completo ? seg.gate : seg.andamento
  bucket.cmp++
  if (diff > 0.05) {
    bucket.div++
    if (bucket.ex && bucket.ex.length < 12) {
      bucket.ex.push(`  ${d.ciclo_nome}/${d.concurso} ${d.id_aluno}: recalc=${rec.media_2fase.toFixed(3)} planilha=${d.media_2fase_declarada.toFixed(3)} (Δ${diff.toFixed(3)})`)
    }
  }
}
console.log(`Ciclos completos (GATE ITA+IME) — comparados: ${seg.gate.cmp} | divergentes Δ>0.05: ${seg.gate.div}`)
console.log(`Em andamento                    — comparados: ${seg.andamento.cmp} | divergentes Δ>0.05: ${seg.andamento.div}  [fórmula difere]`)
if (seg.gate.div > 0) {
  console.log('\n❌ DIVERGÊNCIAS EM CICLO COMPLETO — MAPEAMENTO ERRADO, investigar:')
  seg.gate.ex.forEach((e) => console.log(e))
  process.exitCode = 1
} else if (seg.gate.cmp > 0) {
  console.log('\n✅ Todos os ciclos completos (ITA e IME) batem com a planilha — mapeamento validado.')
}
