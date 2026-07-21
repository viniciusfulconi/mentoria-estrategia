// Testes da regra de consolidação de ciclo em lib/rankings.ts — sem rede, sem banco.
//
// Uso:  node --test scripts/test-rankings.mjs
//
// Cobre o ponto onde o sync já quebrou uma vez: a nota de linguagens do ITA tem
// TRÊS estados (nota lançada / redação pendente / aluno ausente) e confundi-los
// fecha ciclo cedo demais ou zera aluno que só está esperando a correção.
//
// .mjs (não .ts) de propósito: mesmo motivo de test-sheets-parse.mjs — o tsc do
// projeto ignora e o Node importa o .ts nativamente com extensão explícita.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRankings } from '../lib/rankings.ts'

const aluno = (id, fase, campos) => ({
  id_aluno: id, nome_aluno: id, ciclo_nome: 'Ciclo X', concurso: 'ITA', fase, ...campos,
})
// As 4 fases fechadas de um ITA; só falta linguagens.
const quatroFases = (id) => [
  aluno(id, '1fase', { media_1fase: 6 }),
  aluno(id, '2fase_mat', { nota_matematica: 5 }),
  aluno(id, '2fase_fis', { nota_fisica: 7 }),
  aluno(id, '2fase_qui', { nota_quimica: 8 }),
]
const rankDe = (linhas, id) => calcularRankings(linhas).find((r) => r.id_aluno === id)

test('ITA: português lançado sem redação mantém o ciclo em andamento', () => {
  const r = rankDe([
    ...quatroFases('a'),
    aluno('a', '2fase_port', { nota_portugues: 5.33, nota_redacao: null, media_linguagens: null }),
  ], 'a')

  assert.equal(r.resultado_ciclo, 'Em andamento')
  assert.equal(r.media_linguagens, null, 'linguagens fica fora da média até a redação sair')
  assert.equal(r.media_2fase, 6.5, 'média das 4 fases fechadas: (6+5+7+8)/4')
})

test('ITA: redação de um aluno antes das dos outros não contamina ninguém', () => {
  const linhas = [
    ...quatroFases('adiantado'),
    aluno('adiantado', '2fase_port', { nota_portugues: 6, nota_redacao: 8, media_linguagens: 7 }),
    ...quatroFases('pendente'),
    aluno('pendente', '2fase_port', { nota_portugues: 6, nota_redacao: null, media_linguagens: null }),
  ]
  const adiantado = rankDe(linhas, 'adiantado')
  const pendente = rankDe(linhas, 'pendente')

  assert.equal(adiantado.resultado_ciclo, 'Aprovado')
  assert.equal(adiantado.media_2fase, 6.6, '(6+5+7+8+7)/5')

  // A regressão que a regra por ciclo causaria: a fase passa a "existir" por causa
  // do aluno adiantado e o pendente levaria 0 em linguagens.
  assert.equal(pendente.resultado_ciclo, 'Em andamento')
  assert.notEqual(pendente.media_linguagens, 0, 'pendente não pode ser zerado')
  assert.equal(pendente.media_2fase, 6.5)
})

test('ITA: aluno sem linha de português com a fase uploadada continua valendo 0', () => {
  const linhas = [
    ...quatroFases('presente'),
    aluno('presente', '2fase_port', { nota_portugues: 6, nota_redacao: 8, media_linguagens: 7 }),
    ...quatroFases('faltou'),   // sem linha 2fase_port nenhuma
  ]
  const r = rankDe(linhas, 'faltou')

  assert.equal(r.media_linguagens, 0, 'ausência na prova continua sendo 0, não pendência')
  assert.equal(r.resultado_ciclo, 'Reprovado', 'ciclo fecha: as 5 notas existem')
})

test('ITA legado: media_linguagens gravada com nota_redacao nula segue fechando o ciclo', () => {
  // Formato real de ciclos antigos em produção (Ciclo 5): a redação nunca entrou no
  // banco e media_linguagens ficou com o português puro. Ler nota_redacao em vez de
  // media_linguagens reabriria esses ciclos no próximo recálculo.
  const r = rankDe([
    ...quatroFases('legado'),
    aluno('legado', '2fase_port', { nota_portugues: 6.67, nota_redacao: null, media_linguagens: 6.67 }),
  ], 'legado')

  assert.equal(r.resultado_ciclo, 'Aprovado')
  assert.equal(r.media_linguagens, 6.67)
})

test('IME: redação nula é o normal e não pode abrir o ciclo', () => {
  const ime = (fase, campos) => ({
    id_aluno: 'i', nome_aluno: 'i', ciclo_nome: 'Ciclo X', concurso: 'IME', fase, ...campos,
  })
  const r = calcularRankings([
    ime('2fase_mat', { nota_matematica: 6 }),
    ime('2fase_fis', { nota_fisica: 6 }),
    ime('2fase_qui', { nota_quimica: 6 }),
    ime('2fase_ing', { nota_ingles: 6 }),
    // No IME a redação é só critério de eliminação: media_linguagens = português puro.
    ime('2fase_port', { nota_portugues: 6, nota_redacao: null, media_linguagens: 6 }),
  ])[0]

  assert.equal(r.resultado_ciclo, 'Aprovado')
  assert.equal(r.media_2fase, 6)
})
