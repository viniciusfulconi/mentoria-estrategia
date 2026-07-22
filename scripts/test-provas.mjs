// Testes dos helpers de Provas Antigas (lib/provas.ts) — sem rede, sem banco.
//
// Uso:  node --test scripts/test-provas.mjs
//
// O que está em jogo: a tela do aluno e a tela de comentário do mentor decidem
// "questão fraca" pela MESMA função. Se o critério divergir, o mentor comenta
// questões que o aluno não vê marcadas — ou o contrário.
//
// .mjs (não .ts) de propósito: mesmo motivo de test-rankings.mjs — o tsc do
// projeto ignora e o Node importa o .ts nativamente com extensão explícita.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverTopicos, questoesFracas, topicosSugeridos, LIMITE_QUESTAO_FRACA } from '../lib/provas.ts'

const TOPICOS = [
  { id: 't1', materia: 'Matemática', topico: 'Trigonometria' },
  { id: 't2', materia: 'Física',     topico: 'Eletrostática' },
]
const q = (numero, materia, topicos = []) => ({ numero, materia, topicos })

test('resolverTopicos: descarta id que não existe mais sem quebrar', () => {
  // Prova cadastrada antes de alguém reorganizar a lista de tópicos.
  assert.deepEqual(resolverTopicos(['t1', 'apagado', 't2'], TOPICOS), ['Trigonometria', 'Eletrostática'])
  assert.deepEqual(resolverTopicos([], TOPICOS), [])
  assert.deepEqual(resolverTopicos(null, TOPICOS), [])
  assert.deepEqual(resolverTopicos(undefined, TOPICOS), [])
})

test('questoesFracas: o limite é exclusivo — 0.7 não é questão fraca', () => {
  const questoes = [q(1, 'Matemática'), q(2, 'Física'), q(3, 'Química')]
  const fracas = questoesFracas({ '1': 0.7, '2': 0.69, '3': 0 }, questoes)

  assert.deepEqual(fracas.map(f => f.numero), [2, 3], 'exatamente 0.7 fica de fora; abaixo entra')
  assert.equal(LIMITE_QUESTAO_FRACA, 0.7)
})

test('questoesFracas: questão sem nota lançada não entra', () => {
  // Correção incompleta não pode encher a lista de revisão com questões que
  // ninguém avaliou — ausência conta como acerto (`?? 1`).
  const questoes = [q(1, 'Matemática'), q(2, 'Física'), q(3, 'Química')]
  const fracas = questoesFracas({ '2': 0.2 }, questoes)

  assert.deepEqual(fracas.map(f => f.numero), [2])
})

test('questoesFracas: notas nulas ou objeto vazio não fabricam questão fraca', () => {
  const questoes = [q(1, 'Matemática'), q(2, 'Física')]

  assert.deepEqual(questoesFracas(null, questoes), [])
  assert.deepEqual(questoesFracas(undefined, questoes), [])
  assert.deepEqual(questoesFracas({}, questoes), [])
})

test('questoesFracas: devolve nota e tópicos resolvidos da questão', () => {
  const fracas = questoesFracas({ '1': 0.3 }, [q(1, 'Matemática', ['t1'])], TOPICOS)

  assert.equal(fracas.length, 1)
  assert.deepEqual(fracas[0], { numero: 1, materia: 'Matemática', nota: 0.3, topicos: ['Trigonometria'] })
})

test('topicosSugeridos: ids únicos, só das questões fracas', () => {
  const questoes = [
    q(1, 'Matemática', ['t1']),        // fraca
    q(2, 'Física',     ['t2', 't1']),  // fraca — t1 repetido não duplica
    q(3, 'Química',    ['t9']),        // foi bem: não sugere
    q(4, 'Química',    []),            // fraca, mas sem tópico marcado
  ]
  const ids = topicosSugeridos({ '1': 0.1, '2': 0.5, '3': 1, '4': 0 }, questoes)

  assert.deepEqual(ids, ['t1', 't2'])
})

test('topicosSugeridos: prova sem correção não pré-marca nada', () => {
  // Mentor abre a tela antes de o aluno corrigir: os três campos ficam vazios e
  // nenhum tópico vem marcado — nada de sugerir revisão sem dado.
  assert.deepEqual(topicosSugeridos(null, [q(1, 'Matemática', ['t1'])]), [])
})
