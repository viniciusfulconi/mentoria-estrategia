// Motor de TRI (Teoria de Resposta ao Item) — modelo logístico de 3 parâmetros
// (3PL), o mesmo do ENEM. Estima a proficiência θ por EAP (Expected A Posteriori)
// e reporta na escala oficial nota = 500 + 100·θ.
//
// Os parâmetros a,b,c vêm do microdado do INEP (ITENS_PROVA_YYYY.csv) e estão na
// métrica θ padronizada (b=0 ⇒ 500 pontos). Com a equalização do INEP, itens de
// anos diferentes são combináveis na mesma área.
//
// Observação de escala: isto reproduz fielmente o 3PL/EAP; os números ficam
// próximos, não bit-idênticos ao INEP (não temos a quadratura/população deles).

export const D = 1.7 // constante de escalonamento logístico do 3PL do ENEM

export type ItemParam = { a: number; b: number; c: number }
export type RespostaItem = ItemParam & { correct: boolean }

// Probabilidade de acerto no 3PL: P(θ) = c + (1-c) / (1 + e^(-D·a·(θ-b)))
export function prob3PL(theta: number, a: number, b: number, c: number, d = D): number {
  const z = d * a * (theta - b)
  // forma numericamente estável do logístico (evita overflow em |z| grande)
  const logistic = z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z))
  return c + (1 - c) * logistic
}

export type EapOptions = {
  gridMin?: number
  gridMax?: number
  step?: number
  priorMean?: number
  priorSd?: number
}

export type EapResult = { theta: number; se: number }

// Densidade normal (constante multiplicativa é irrelevante pois normalizamos).
function normalPdf(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd
  return Math.exp(-0.5 * z * z)
}

// Estima θ por EAP: média da posterior sobre uma grade de θ, com prior N(mean,sd).
// Estável mesmo com prova toda certa/errada (a prior ancora a estimativa) e
// penaliza padrão incoerente (acertar difícil / errar fácil) via o termo c.
export function eapTheta(itens: RespostaItem[], opts: EapOptions = {}): EapResult {
  // grade larga: o topo da escala do ENEM chega a θ≈4.8 (nota ~980); [-4,4] capava em 900
  const gridMin = opts.gridMin ?? -6
  const gridMax = opts.gridMax ?? 6
  const step = opts.step ?? 0.02
  const priorMean = opts.priorMean ?? 0
  const priorSd = opts.priorSd ?? 1

  let sumW = 0 // Σ posterior
  let sumWT = 0 // Σ posterior·θ
  let sumWT2 = 0 // Σ posterior·θ²

  for (let theta = gridMin; theta <= gridMax + 1e-9; theta += step) {
    // verossimilhança em log para não estourar com muitos itens
    let logLik = 0
    for (const it of itens) {
      const p = prob3PL(theta, it.a, it.b, it.c)
      const eps = 1e-12
      const pc = Math.min(1 - eps, Math.max(eps, p))
      logLik += it.correct ? Math.log(pc) : Math.log(1 - pc)
    }
    const prior = normalPdf(theta, priorMean, priorSd)
    const w = Math.exp(logLik) * prior
    sumW += w
    sumWT += w * theta
    sumWT2 += w * theta * theta
  }

  if (sumW === 0 || !Number.isFinite(sumW)) {
    return { theta: priorMean, se: priorSd }
  }
  const mean = sumWT / sumW
  const variance = Math.max(0, sumWT2 / sumW - mean * mean)
  return { theta: mean, se: Math.sqrt(variance) }
}

// Constantes de linking por área: nota = A + B·θ. O padrão (500, 100) é a escala θ
// crua; a calibração real por ano/área (recuperada do microdado do INEP) sobrescreve.
export type Linking = { A: number; B: number }
export const LINKING_PADRAO: Linking = { A: 500, B: 100 }

// Converte θ para a nota na escala do ENEM. Com o linking calibrado (ver
// CALIBRACAO_ENEM em ./calibracao), a nota reproduz a oficial com R²≈0,98.
export function scoreFromTheta(theta: number, cal: Linking = LINKING_PADRAO): number {
  return Math.round((cal.A + cal.B * theta) * 10) / 10
}

export type AreaResultado = {
  acertos: number
  total: number
  theta: number
  erro_padrao: number
  nota: number
}

// Corrige uma área: estima θ pelos itens (anulados já devem vir de fora) e
// devolve acertos, θ, erro-padrão e a nota na escala 0–1000 (linking opcional).
export function corrigirArea(itens: RespostaItem[], cal: Linking = LINKING_PADRAO): AreaResultado {
  const total = itens.length
  const acertos = itens.filter(i => i.correct).length
  if (total === 0) {
    return { acertos: 0, total: 0, theta: 0, erro_padrao: 1, nota: scoreFromTheta(0, cal) }
  }
  const { theta, se } = eapTheta(itens)
  return {
    acertos,
    total,
    theta: Math.round(theta * 1000) / 1000,
    erro_padrao: Math.round(se * 1000) / 1000,
    nota: scoreFromTheta(theta, cal),
  }
}

// Média das notas das áreas (+ redação quando houver), como a nota geral do ENEM.
export function notaGeral(notasAreas: number[], notaRedacao?: number | null): number {
  const notas = [...notasAreas]
  if (notaRedacao != null && Number.isFinite(notaRedacao)) notas.push(notaRedacao)
  if (notas.length === 0) return 0
  const soma = notas.reduce((s, n) => s + n, 0)
  return Math.round((soma / notas.length) * 10) / 10
}
