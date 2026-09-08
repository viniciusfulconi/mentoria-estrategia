// Testes do motor de TRI (3PL + EAP) do módulo ENEM — sem rede, sem banco.
//
// Portados dos testes em vitest do Play Aprovação para o runner daqui
// (node --test). É o código mais delicado do módulo: se a psicometria quebrar,
// a nota do aluno sai errada sem ninguém perceber, porque não há valor "óbvio"
// para conferir a olho.
//
// Uso:  node --import ./scripts/alias-hooks.mjs --test scripts/test-tri.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prob3PL, eapTheta, scoreFromTheta, corrigirArea, notaGeral } from '@/lib/tri/index'
import { corrigirSimulado, idsDaArea, isAnulada } from '@/lib/tri/simulado'

const perto = (a, b, casas = 6, msg = '') =>
  assert.ok(Math.abs(a - b) < 0.5 * 10 ** -casas, `${msg} ${a} ≉ ${b} (${casas} casas)`)

// ── prob3PL ─────────────────────────────────────────────────────────────────
test('prob3PL: em θ=b vale (1+c)/2', () => {
  perto(prob3PL(1.5, 2, 1.5, 0.2), 0.6, 10)
  perto(prob3PL(0, 1, 0, 0.25), 0.625, 10)
})

test('prob3PL: tende a c quando θ→-∞ e a 1 quando θ→+∞', () => {
  perto(prob3PL(-20, 2, 1, 0.18), 0.18, 6)
  perto(prob3PL(20, 2, 1, 0.18), 1, 6)
})

test('prob3PL: é monotônica crescente em θ', () => {
  const [p1, p2, p3] = [-1, 0, 1].map(t => prob3PL(t, 1.5, 0.5, 0.2))
  assert.ok(p1 < p2 && p2 < p3, `${p1} < ${p2} < ${p3}`)
})

// ── escala ──────────────────────────────────────────────────────────────────
test('scoreFromTheta: escala 500 ± 100', () => {
  assert.equal(scoreFromTheta(0), 500)
  assert.equal(scoreFromTheta(1), 600)
  assert.equal(scoreFromTheta(-1), 400)
  assert.equal(scoreFromTheta(1.234), 623.4)
})

// Banco sintético do mais fácil (b baixo) ao mais difícil.
const BANCO = [
  { a: 1.8, b: -1.0, c: 0.18 }, { a: 2.0, b: -0.4, c: 0.18 }, { a: 2.2, b: 0.2, c: 0.18 },
  { a: 2.0, b: 0.8, c: 0.18 },  { a: 1.9, b: 1.4, c: 0.18 },  { a: 2.1, b: 2.2, c: 0.18 },
]
const item = (i, correct) => ({ ...BANCO[i], correct })

test('EAP: tudo certo dá nota alta, tudo errado dá nota baixa, sem divergir', () => {
  const certo = corrigirArea(BANCO.map((_, i) => item(i, true)))
  const errado = corrigirArea(BANCO.map((_, i) => item(i, false)))
  assert.ok(certo.nota > 640, `nota ${certo.nota} deveria passar de 640`)
  assert.ok(errado.nota < 400, `nota ${errado.nota} deveria ficar abaixo de 400`)
  assert.equal(certo.acertos, 6)
  assert.equal(errado.acertos, 0)
  assert.ok(Number.isFinite(certo.theta) && Number.isFinite(errado.theta), 'EAP não pode divergir nos extremos')
})

test('EAP: mais acertos ⇒ nota maior', () => {
  const tres  = corrigirArea([item(0, true), item(1, true), item(2, true), item(3, false), item(4, false), item(5, false)])
  const cinco = corrigirArea([item(0, true), item(1, true), item(2, true), item(3, true),  item(4, true),  item(5, false)])
  assert.ok(cinco.nota > tres.nota)
})

test('EAP: com o mesmo nº de acertos, padrão coerente vale mais que incoerente', () => {
  const coerente   = corrigirArea([item(0, true),  item(1, true),  item(2, true),  item(3, false), item(4, false), item(5, false)])
  const incoerente = corrigirArea([item(0, false), item(1, false), item(2, false), item(3, true),  item(4, true),  item(5, true)])
  assert.equal(coerente.acertos, incoerente.acertos)
  assert.ok(coerente.nota > incoerente.nota, 'errar fácil e acertar difícil cheira a chute e deve pagar')
})

test('EAP: área vazia devolve 500 sem quebrar', () => {
  const r = corrigirArea([])
  assert.equal(r.total, 0)
  assert.equal(r.nota, 500)
})

test('EAP: erro-padrão finito e positivo', () => {
  const { se } = eapTheta(BANCO.map((_, i) => item(i, i % 2 === 0)))
  assert.ok(se > 0 && Number.isFinite(se))
})

test('notaGeral: média das áreas, com e sem redação', () => {
  assert.equal(notaGeral([600, 700, 500, 800]), 650)
  assert.equal(notaGeral([600, 700, 500, 800], 900), 700)
  assert.equal(notaGeral([600, 600], null), 600)
})

// ── montagem do simulado ────────────────────────────────────────────────────
const Q = (answer, extra = {}) => ({ answer, enem_area: null, tri_a: 2, tri_b: 0.5, tri_c: 0.18, tags: null, ...extra })

test('idsDaArea: LC junta comuns + a língua escolhida', () => {
  const lc = { area: 'LC', comuns: ['c1', 'c2'], ingles: ['i1'], espanhol: ['e1'] }
  assert.deepEqual(idsDaArea(lc, 0), ['c1', 'c2', 'i1'])
  assert.deepEqual(idsDaArea(lc, 1), ['c1', 'c2', 'e1'])
  assert.deepEqual(idsDaArea({ area: 'MT', question_ids: ['a', 'b'] }, null), ['a', 'b'])
})

test('isAnulada: gabarito null ou tag anulada', () => {
  assert.equal(isAnulada(Q(null)), true)
  assert.equal(isAnulada(Q('a', { tags: ['anulada'] })), true)
  assert.equal(isAnulada(Q('a')), false)
})

test('corrigirSimulado: corrige por área e tira a média', () => {
  const areas = [{ area: 'MT', question_ids: ['m1', 'm2', 'm3'] }, { area: 'CH', question_ids: ['h1', 'h2', 'h3'] }]
  const byId = new Map([['m1', Q('a')], ['m2', Q('b')], ['m3', Q('c')], ['h1', Q('a')], ['h2', Q('b')], ['h3', Q('c')]])
  const r = corrigirSimulado(areas, byId, { m1: 'a', m2: 'b', m3: 'c', h1: 'a', h2: 'x', h3: 'x' }, null)
  assert.equal(r.areas.MT.acertos, 3)
  assert.equal(r.areas.CH.acertos, 1)
  assert.ok(r.areas.MT.nota > r.areas.CH.nota)
  assert.equal(r.itens_sem_parametro, 0)
})

test('corrigirSimulado: em LC conta só a língua escolhida', () => {
  const areas = [{ area: 'LC', comuns: ['c1'], ingles: ['i1'], espanhol: ['e1'] }]
  const byId = new Map([['c1', Q('a')], ['i1', Q('b')], ['e1', Q('c')]])
  const resp = { c1: 'a', i1: 'b', e1: 'c' }
  for (const lingua of [0, 1]) {
    const r = corrigirSimulado(areas, byId, resp, lingua)
    assert.equal(r.areas.LC.total, 2, 'não pode somar as duas línguas')
    assert.equal(r.areas.LC.acertos, 2)
  }
})

test('corrigirSimulado: anulada credita todo mundo e fica fora do θ', () => {
  const areas = [{ area: 'CN', question_ids: ['a1', 'a2'] }]
  const byId = new Map([['a1', Q(null)], ['a2', Q('b')]])
  const r = corrigirSimulado(areas, byId, { a2: 'x' }, null)
  assert.equal(r.areas.CN.acertos, 1)
  assert.equal(r.areas.CN.total, 2)
  assert.equal(r.areas.CN.itens_tri, 1)
})

test('corrigirSimulado: item sem parâmetro conta acerto mas não entra no θ', () => {
  const areas = [{ area: 'CN', question_ids: ['a1', 'a2'] }]
  const byId = new Map([['a1', Q('a')], ['a2', Q('b', { tri_a: null })]])
  const r = corrigirSimulado(areas, byId, { a1: 'a', a2: 'b' }, null)
  assert.equal(r.areas.CN.acertos, 2)
  assert.equal(r.areas.CN.itens_tri, 1)
  assert.equal(r.itens_sem_parametro, 1)
})

test('corrigirSimulado: questão ausente do mapa é ignorada', () => {
  const r = corrigirSimulado([{ area: 'MT', question_ids: ['m1', 'fantasma'] }], new Map([['m1', Q('a')]]), { m1: 'a' }, null)
  assert.equal(r.areas.MT.total, 1)
  assert.equal(r.areas.MT.acertos, 1)
})

test('corrigirSimulado: a calibração do ano muda a escala (nota = A + B·θ)', () => {
  const areas = [{ area: 'MT', question_ids: ['m1', 'm2', 'm3'] }]
  const byId = new Map([['m1', Q('a')], ['m2', Q('b')], ['m3', Q('c')]])
  const resp = { m1: 'a', m2: 'b', m3: 'c' }
  const sem = corrigirSimulado(areas, byId, resp, null)
  const com = corrigirSimulado(areas, byId, resp, null, { MT: { A: 487.5, B: 135.8 } })
  perto(com.areas.MT.theta, sem.areas.MT.theta, 3, 'θ não muda com a escala')
  assert.ok(com.areas.MT.nota > sem.areas.MT.nota)
  perto(com.areas.MT.nota, 487.5 + 135.8 * com.areas.MT.theta, 0)
})
