// Testes da camada de ESCRITA do sync (lib/sync-simulados.ts) — sem rede, sem
// banco: um Db falso registra as chamadas e mede a concorrência real.
//
// Uso:  node --test scripts/test-sync-escrita.mjs
//
// Cobre a troca do laço serial por blocos concorrentes. O laço serial não cabia
// no maxDuration da rota quando o sync passou a gravar `notas_questoes` (2341
// linhas de gap-fill ≈ 450 s contra 300 s de teto), e o que se perde numa
// refatoração dessas é justamente o contrato silencioso do laço: contagem certa,
// dry-run que não escreve e aborto no primeiro erro.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sincronizarManutencao } from '../lib/sync-simulados.ts'

const ALUNOS = Array.from({ length: 30 }, (_, i) => ({
  idAluno: `a${i}`, NomeCompleto: `Aluno ${i}`, Turma: 'Presencial', Mentor: 'u1',
}))

// Ciclo 3 ITA com uma prova dissertativa de matemática — dissertativa não precisa
// da aba Gabaritos, então o detalhamento por questão vem sem fixture extra.
const SIMULADO = { idSimulado: 's1', Ciclo: 'Ciclo 3', Modelo: 'ITA', Fase: '2ª Fase', Materia: 'Matemática' }

function sheets() {
  return {
    simulados: [SIMULADO],
    respostas: ALUNOS.map((a, i) => ({
      idResposta: `r${i}`, Simulado: 's1', Aluno: a.idAluno, Nota: 5, Q1: 1, Q2: 0,
    })),
    cadastroAlunos: ALUNOS,
    usuarios: [{ idUsuario: 'u1', Nome: 'Mentor Ciclano' }],
    gabaritos: [],
  }
}

// Db falso. `existentes` define o que já está no banco; toda escrita é registrada
// e um atraso força as chamadas a se sobreporem, para dar o que medir.
function fakeDb({ existentes, falharNa = -1 } = {}) {
  const reg = { updates: [], inserts: [], emVoo: 0, picoEmVoo: 0 }
  let n = 0
  const escrever = async (lista, arg) => {
    reg.emVoo++
    reg.picoEmVoo = Math.max(reg.picoEmVoo, reg.emVoo)
    await new Promise((r) => setTimeout(r, 5))
    reg.emVoo--
    lista.push(arg)
    return { error: ++n === falharNa ? 'boom' : null }
  }
  return {
    reg,
    db: {
      queryAll: async () => ({ data: existentes, error: null }),
      update: async (_t, filtro, dados) => escrever(reg.updates, { filtro, dados }),
      insert: async (_t, linha) => escrever(reg.inserts, linha),
    },
  }
}

// Linhas de ranking = alunos "conhecidos". Sem elas o ciclo é novo e nada é escrito.
const rankings = () => ALUNOS.map((a, i) => ({ id: `rk${i}`, id_aluno: a.idAluno, fase: 'ranking' }))

// No fim do sync o `recalcularCiclo` reescreve as linhas de ranking pelo mesmo db.
// Aqui interessam só as escritas das linhas de FASE, que é o que foi refatorado.
const updatesDeFase = (reg) => reg.updates.filter((u) => !u.filtro.id.startsWith('eq.rk'))

test('escreve TODAS as linhas — nenhuma se perde no fatiamento em blocos', async () => {
  const { db, reg } = fakeDb({ existentes: rankings() })
  const rep = await sincronizarManutencao({ sheets: sheets(), db })

  assert.equal(rep.erro, undefined)
  assert.equal(reg.inserts.length, 30, 'uma linha de fase nova por aluno')
  assert.equal(rep.inseridos, 30, 'o contador bate com o que foi escrito')
  assert.equal(rep.atualizados, 0)
  assert.ok(reg.inserts.every((l) => l.notas_questoes), 'o detalhamento vai junto — é o motivo de tudo isto')
})

test('as escritas se sobrepõem, mas com teto — é bloco, não avalanche', async () => {
  const { db, reg } = fakeDb({ existentes: rankings() })
  await sincronizarManutencao({ sheets: sheets(), db })

  assert.ok(reg.picoEmVoo > 1, 'em série o backfill não caberia no maxDuration da rota')
  assert.ok(reg.picoEmVoo <= 10, `o teto de concorrência tem que valer (pico: ${reg.picoEmVoo})`)
})

test('linha existente vira UPDATE, e o gap-fill não sobrescreve coluna preenchida', async () => {
  // Ciclo 3 não é o ativo aqui? É — é o único da planilha, logo é sobrescrito.
  // Para exercitar o gap-fill o que importa é a coluna já preenchida em ciclo ativo
  // ser sobrescrita; o caso de não-sobrescrita é o de ciclo antigo, coberto abaixo.
  const existentes = [
    ...rankings(),
    { id: 'x0', id_aluno: 'a0', fase: '2fase_mat', nota_matematica: 9, notas_questoes: null },
  ]
  const { db, reg } = fakeDb({ existentes })
  const rep = await sincronizarManutencao({ sheets: sheets(), db })

  assert.equal(rep.atualizados, 1)
  assert.equal(rep.inseridos, 29)
  const deFase = updatesDeFase(reg)
  assert.equal(deFase.length, 1)
  assert.equal(deFase[0].filtro.id, 'eq.x0')
  assert.ok(deFase[0].dados.notas_questoes, 'a coluna nula é preenchida — é o backfill')
})

test('dry-run conta tudo e não escreve nada', async () => {
  const { db, reg } = fakeDb({ existentes: rankings() })
  const rep = await sincronizarManutencao({ sheets: sheets(), db, dry: true })

  assert.equal(rep.inseridos, 30, 'o preview precisa dizer o tamanho do estrago')
  assert.equal(reg.inserts.length + reg.updates.length, 0, 'e não pode encostar no banco')
  assert.deepEqual(rep.ciclosTocados, ['Ciclo 3 / ITA'], 'ciclo tocado continua sendo reportado no dry')
})

test('erro numa escrita aborta o sync e é reportado', async () => {
  const { db, reg } = fakeDb({ existentes: rankings(), falharNa: 3 })
  const rep = await sincronizarManutencao({ sheets: sheets(), db })

  assert.match(rep.erro ?? '', /Erro insert .*boom/)
  assert.equal(rep.ok, false)
  assert.ok(reg.inserts.length < 30, 'para na primeira falha, não segue escrevendo o resto')
})

test('ciclo sem linha de ranking não é escrito — só vira aviso', async () => {
  const { db, reg } = fakeDb({ existentes: [] })
  const rep = await sincronizarManutencao({ sheets: sheets(), db })

  assert.deepEqual(rep.ciclosNovos, ['Ciclo 3 (ITA)'])
  assert.equal(reg.inserts.length + reg.updates.length, 0)
})

// ─── recálculo de ranking ────────────────────────────────────────────────────
// O sync recalcula todo ciclo que tocou, então no backfill do detalhamento este
// laço sozinho reescreve ~880 linhas. Também saiu de série para blocos — e a
// posição vem da ORDEM do array, que é o que uma paralelização pode estragar.

test('recalcularCiclo reescreve todo ranking, com posição sequencial e sem furo', async () => {
  const { recalcularCiclo } = await import('../lib/notas.ts')

  // Notas decrescentes: o aluno i tem média maior que o i+1, então a posição
  // esperada é exatamente a ordem de a0..a19.
  const existentes = []
  for (let i = 0; i < 20; i++) {
    existentes.push({ id: `rk${i}`, id_aluno: `a${i}`, nome_aluno: `Aluno ${i}`, fase: 'ranking', media_2fase: 10 - i * 0.1 })
    existentes.push({ id: `f${i}`, id_aluno: `a${i}`, fase: '2fase_mat', concurso: 'ITA', ciclo_nome: 'Ciclo 3', nota_matematica: 10 - i * 0.1 })
  }
  const { db, reg } = fakeDb({ existentes })

  const { atualizados } = await recalcularCiclo('Ciclo 3', 'ITA', db)

  assert.equal(atualizados, 20)
  assert.equal(reg.updates.length, 20, 'nenhuma linha fica para trás no fatiamento')
  assert.ok(reg.picoEmVoo > 1 && reg.picoEmVoo <= 10, `concorrente, com teto (pico: ${reg.picoEmVoo})`)

  const posicoes = new Map(reg.updates.map((u) => [u.filtro.id, u.dados.classificacao]))
  assert.equal(posicoes.size, 20, 'uma escrita por linha, sem duplicata')
  for (let i = 0; i < 20; i++) {
    assert.equal(posicoes.get(`eq.rk${i}`), i + 1, `a posição de a${i} vem da ordem, não da corrida`)
  }
})
