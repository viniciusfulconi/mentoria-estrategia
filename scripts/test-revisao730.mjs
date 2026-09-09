// Testes da lógica pura das Revisões 7-15-30 — sem rede, sem banco.
//
// O ponto frágil é data: soma de dias cruzando mês/ano/bissexto sem fuso, e o
// dedupe que decide se um conteúdo fechado de novo gera ciclo ou não.
//
// Uso:  node --import ./scripts/alias-hooks.mjs --test scripts/test-revisao730.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDaysISO, computeReviewDates, flattenRevisoes, stepColumn, filtrarDuplicados,
} from '@/lib/revisao730'

test('addDaysISO: soma simples e cruzando mês', () => {
  assert.equal(addDaysISO('2026-09-09', 7), '2026-09-16')
  assert.equal(addDaysISO('2026-09-25', 7), '2026-10-02')
})

test('addDaysISO: cruza ano e respeita bissexto', () => {
  assert.equal(addDaysISO('2026-12-28', 7), '2027-01-04')
  assert.equal(addDaysISO('2028-02-27', 3), '2028-03-01')   // 2028 é bissexto
  assert.equal(addDaysISO('2027-02-27', 3), '2027-03-02')   // 2027 não é
})

test('addDaysISO: negativo (o corte do dedupe usa -30)', () => {
  assert.equal(addDaysISO('2026-01-15', -30), '2025-12-16')
})

test('computeReviewDates: 7/15/30 a partir do fechamento', () => {
  assert.deepEqual(computeReviewDates('2026-09-09'), {
    r7_date: '2026-09-16', r15_date: '2026-09-24', r30_date: '2026-10-09',
  })
})

const ciclo = (over = {}) => ({
  id: 'r1', aluno_id: 'a', materia: 'Biologia', label: 'Genética', topico_id: null,
  origem: 'manual', tarefa_id: null, fechado_em: '2026-09-01',
  r7_date: '2026-09-08', r15_date: '2026-09-16', r30_date: '2026-10-01',
  r7_done_at: null, r15_done_at: '2026-09-16T12:00:00Z', r30_done_at: null, note: null,
  ...over,
})

test('flattenRevisoes: 3 passos por ciclo, ordenados por data, done preservado', () => {
  const steps = flattenRevisoes([ciclo()])
  assert.equal(steps.length, 3)
  assert.deepEqual(steps.map(s => s.step), [7, 15, 30])
  assert.equal(steps[1].doneAt, '2026-09-16T12:00:00Z')
})

test('flattenRevisoes: intercala ciclos por data', () => {
  const a = ciclo({ id: 'A', fechado_em: '2026-09-01', r7_date: '2026-09-08', r15_date: '2026-09-16', r30_date: '2026-10-01' })
  const b = ciclo({ id: 'B', fechado_em: '2026-09-05', r7_date: '2026-09-12', r15_date: '2026-09-20', r30_date: '2026-10-05' })
  const datas = flattenRevisoes([a, b]).map(s => s.date)
  assert.deepEqual(datas, [...datas].sort())
})

test('stepColumn: mapeia para a coluna certa', () => {
  assert.equal(stepColumn(7), 'r7_done_at')
  assert.equal(stepColumn(15), 'r15_done_at')
  assert.equal(stepColumn(30), 'r30_done_at')
})

test('filtrarDuplicados: barra o que já tem ciclo recente (case/espaço-insensível)', () => {
  const out = filtrarDuplicados(
    [{ materia: 'Biologia', label: 'Genética' }, { materia: 'Física', label: 'Óptica' }],
    [{ materia: 'biologia', label: ' genética ' }],
  )
  assert.deepEqual(out.map(x => x.label), ['Óptica'])
})

test('filtrarDuplicados: dedupa também dentro do próprio lote', () => {
  const out = filtrarDuplicados(
    [{ materia: 'Química', label: 'pH' }, { materia: 'Química', label: 'pH' }],
    [],
  )
  assert.equal(out.length, 1)
})
