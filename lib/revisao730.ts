// Revisões 7-15-30 — lógica pura + criação com dedupe.
// Portado da mentoria-play (lib/pilares.ts + lib/revisao730.ts) para o modelo
// daqui: aluno_id text, wrappers REST de lib/supabase, rótulo livre por
// (materia, label) em vez de syllabus_topics.

import { dbQuery, dbInsert } from './supabase'

export type Revisao730 = {
  id: string
  aluno_id: string
  materia: string
  label: string
  topico_id: string | null
  origem: 'tarefa' | 'manual' | 'mapa'
  tarefa_id: string | null
  fechado_em: string
  r7_date: string
  r15_date: string
  r30_date: string
  r7_done_at: string | null
  r15_done_at: string | null
  r30_done_at: string | null
  note: string | null
}

export type RevisaoStep = {
  review: Revisao730
  step: 7 | 15 | 30
  date: string
  doneAt: string | null
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

/** Soma dias a um 'YYYY-MM-DD' sem tropeçar em fuso (UTC puro). */
export function addDaysISO(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

export function computeReviewDates(fechadoEm: string) {
  return {
    r7_date: addDaysISO(fechadoEm, 7),
    r15_date: addDaysISO(fechadoEm, 15),
    r30_date: addDaysISO(fechadoEm, 30),
  }
}

/** Achata os ciclos em passos individuais, ordenados por data. */
export function flattenRevisoes(reviews: Revisao730[]): RevisaoStep[] {
  const steps: RevisaoStep[] = []
  for (const r of reviews) {
    steps.push({ review: r, step: 7, date: r.r7_date, doneAt: r.r7_done_at })
    steps.push({ review: r, step: 15, date: r.r15_date, doneAt: r.r15_done_at })
    steps.push({ review: r, step: 30, date: r.r30_date, doneAt: r.r30_done_at })
  }
  return steps.sort((a, b) => a.date.localeCompare(b.date) || a.step - b.step)
}

export function stepColumn(step: 7 | 15 | 30): 'r7_done_at' | 'r15_done_at' | 'r30_done_at' {
  return step === 7 ? 'r7_done_at' : step === 15 ? 'r15_done_at' : 'r30_done_at'
}

const norm = (s: string) => s.trim().toLowerCase()

/** Filtra os conteúdos que já têm ciclo aberto nos últimos 30 dias. Pura. */
export function filtrarDuplicados<T extends { materia: string; label: string }>(
  candidatos: T[],
  existentes: { materia: string; label: string }[],
): T[] {
  const jaTem = new Set(existentes.map(e => `${norm(e.materia)}|${norm(e.label)}`))
  const vistos = new Set<string>()
  return candidatos.filter(c => {
    const k = `${norm(c.materia)}|${norm(c.label)}`
    if (jaTem.has(k) || vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

export type NovoCiclo = {
  materia: string
  label: string
  topico_id?: string | null
  origem?: 'tarefa' | 'manual' | 'mapa'
  tarefa_id?: string | null
  note?: string | null
}

/**
 * Cria os ciclos 7-15-30 do aluno, deduplicando contra os fechados nos
 * últimos 30 dias. Roda com as credenciais do chamador (aluno cria os
 * próprios; staff cria para o aluno).
 */
export async function criarRevisoes730(
  alunoId: string,
  ciclos: NovoCiclo[],
  fechadoEm?: string,
): Promise<{ criadas: number; erro?: string }> {
  const validos = ciclos.filter(c => c.materia && c.label)
  if (!validos.length) return { criadas: 0 }

  const hoje = fechadoEm || todayISO()
  const corte = addDaysISO(todayISO(), -30)
  const { data: existentes, error: e1 } = await dbQuery<Revisao730>(
    'revisoes_730',
    { aluno_id: `eq.${alunoId}`, fechado_em: `gte.${corte}` },
    'materia,label',
  )
  if (e1) return { criadas: 0, erro: e1 }

  const novos = filtrarDuplicados(validos, existentes || [])
  if (!novos.length) return { criadas: 0 }

  const rows = novos.map(c => ({
    aluno_id: alunoId,
    materia: c.materia,
    label: c.label,
    topico_id: c.topico_id ?? null,
    origem: c.origem ?? 'manual',
    tarefa_id: c.tarefa_id ?? null,
    fechado_em: hoje,
    ...computeReviewDates(hoje),
    note: c.note ?? null,
  }))
  const { error } = await dbInsert('revisoes_730', rows)
  if (error) return { criadas: 0, erro: error }
  return { criadas: rows.length }
}
