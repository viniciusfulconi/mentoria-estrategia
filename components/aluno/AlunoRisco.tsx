'use client'

export function calcularRisco(dados: any[], rankingAtivo: any, cicloAtivo: string | null) {
  if (!rankingAtivo || !cicloAtivo) return null
  const concurso: string | null = rankingAtivo.concurso
    || (String(cicloAtivo).includes('ITA') ? 'ITA' : String(cicloAtivo).includes('IME') ? 'IME' : null)
  if (concurso !== 'ITA' && concurso !== 'IME') return null

  const n = (v: any): number | null => v !== null && v !== undefined ? Number(v) : null
  const cicloNum = String(cicloAtivo).match(/\d+/)?.[0] || ''
  const reg1f = dados.find(r =>
    String(r.ciclo_nome || '').match(/\d+/)?.[0] === cicloNum && r.fase === '1fase'
  )
  const reg2fPort = dados.find(r =>
    String(r.ciclo_nome || '').match(/\d+/)?.[0] === cicloNum && r.fase === '2fase_port'
  )

  type C = { label: string; val: number; min: number; ac?: boolean }
  const c1: C[] = [], c2: C[] = []

  if (concurso === 'ITA') {
    if (reg1f?.acertos_mat_1f != null) c1.push({ label: 'Mat.', val: +reg1f.acertos_mat_1f, min: 5, ac: true })
    if (reg1f?.acertos_fis_1f != null) c1.push({ label: 'Fís.', val: +reg1f.acertos_fis_1f, min: 5, ac: true })
    if (reg1f?.acertos_qui_1f != null) c1.push({ label: 'Quí.', val: +reg1f.acertos_qui_1f, min: 5, ac: true })
    if (reg1f?.acertos_ing_1f != null) c1.push({ label: 'Ing.', val: +reg1f.acertos_ing_1f, min: 5, ac: true })
    if (n(rankingAtivo.media_1fase) !== null) c1.push({ label: 'Média 1ª', val: n(rankingAtivo.media_1fase)!, min: 5 })
    if (n(rankingAtivo.nota_matematica) !== null) c2.push({ label: 'Mat.', val: n(rankingAtivo.nota_matematica)!, min: 4 })
    if (n(rankingAtivo.nota_fisica) !== null) c2.push({ label: 'Fís.', val: n(rankingAtivo.nota_fisica)!, min: 4 })
    if (n(rankingAtivo.nota_quimica) !== null) c2.push({ label: 'Quí.', val: n(rankingAtivo.nota_quimica)!, min: 4 })
    if (n(reg2fPort?.nota_portugues) !== null) c2.push({ label: 'Port.', val: n(reg2fPort.nota_portugues)!, min: 6 })
    else if (n(rankingAtivo.media_linguagens) !== null) c2.push({ label: 'Port.', val: n(rankingAtivo.media_linguagens)!, min: 4 })
    if (n(reg2fPort?.nota_redacao) !== null) c2.push({ label: 'Red.', val: n(reg2fPort.nota_redacao)!, min: 4 })
    if (n(rankingAtivo.media_2fase) !== null) c2.push({ label: 'Média Final', val: n(rankingAtivo.media_2fase)!, min: 5 })
  } else {
    if (reg1f?.acertos_mat_1f != null) c1.push({ label: 'Mat.', val: +reg1f.acertos_mat_1f, min: 6, ac: true })
    if (reg1f?.acertos_fis_1f != null) c1.push({ label: 'Fís.', val: +reg1f.acertos_fis_1f, min: 6, ac: true })
    if (reg1f?.acertos_qui_1f != null) c1.push({ label: 'Quí.', val: +reg1f.acertos_qui_1f, min: 4, ac: true })
    if (n(rankingAtivo.media_1fase) !== null) c1.push({ label: 'Total', val: n(rankingAtivo.media_1fase)!, min: 5 })
    if (n(rankingAtivo.nota_matematica) !== null) c2.push({ label: 'Mat.', val: n(rankingAtivo.nota_matematica)!, min: 4 })
    if (n(rankingAtivo.nota_fisica) !== null) c2.push({ label: 'Fís.', val: n(rankingAtivo.nota_fisica)!, min: 4 })
    if (n(rankingAtivo.nota_quimica) !== null) c2.push({ label: 'Quí.', val: n(rankingAtivo.nota_quimica)!, min: 4 })
    if (n(rankingAtivo.media_linguagens) !== null) c2.push({ label: 'Port.', val: n(rankingAtivo.media_linguagens)!, min: 4 })
  }

  if (!c1.length && !c2.length) return null

  const falhas1 = c1.filter(c => c.val < c.min)
  const falhas2 = c2.filter(c => c.val < c.min)
  const cortado: '1ª Fase' | '2ª Fase' | null = falhas1.length ? '1ª Fase' : falhas2.length ? '2ª Fase' : null

  const borda = !cortado && [...c1, ...c2].some(c =>
    c.val >= c.min && (c.ac ? c.val - c.min <= 1 : c.val - c.min <= 0.5)
  )

  const falhasTexto = (cortado === '1ª Fase' ? falhas1 : falhas2)
    .map(c => `${c.label} (${c.ac ? c.val : c.val.toFixed(1)} < ${c.ac ? c.min : c.min.toFixed(1)})`)
    .join(' · ')

  const bordaTexto = borda ? [...c1, ...c2]
    .filter(c => c.val >= c.min && (c.ac ? c.val - c.min <= 1 : c.val - c.min <= 0.5))
    .map(c => c.label).join(', ') : ''

  return { concurso, cortado, borda, falhasTexto, bordaTexto }
}

export function BannerRisco({ dados, rankingAtivo, cicloAtivo }: { dados: any[], rankingAtivo: any, cicloAtivo: string | null }) {
  const r = calcularRisco(dados, rankingAtivo, cicloAtivo)
  if (!r) return null

  const isCortado = !!r.cortado
  const bg = isCortado ? '#FEF2F2' : r.borda ? '#FFFBEB' : '#DCFCE7'
  const bordaCor = isCortado ? '#DC2626' : r.borda ? '#D97706' : '#16A34A'
  const cor = isCortado ? '#991B1B' : r.borda ? '#78350F' : '#14532D'
  const icon = isCortado ? '🔴' : r.borda ? '🟡' : '🟢'
  const titulo = isCortado
    ? `Cortado na ${r.cortado} · ${r.concurso}`
    : r.borda ? `Próximo do corte · ${r.concurso}`
    : `Aprovado em todos os critérios · ${r.concurso}`

  return (
    <div style={{ background: bg, borderLeft: `4px solid ${bordaCor}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: cor }}>{titulo}</span>
      </div>
      {isCortado && r.falhasTexto && (
        <div style={{ fontSize: 11, color: cor, marginTop: 4, marginLeft: 24 }}>{r.falhasTexto}</div>
      )}
      {!isCortado && r.borda && r.bordaTexto && (
        <div style={{ fontSize: 11, color: cor, marginTop: 4, marginLeft: 24 }}>No limite: {r.bordaTexto}</div>
      )}
    </div>
  )
}

export type CriterioCorte = {
  label: string
  valor: number | null
  minimo: number
  escala: number
  isAcertos?: boolean
}

export function ItemCorte({ c }: { c: CriterioCorte }) {
  if (c.valor === null) return null
  const passou = c.valor >= c.minimo
  const cor = passou ? '#16A34A' : '#DC2626'
  const bgCor = passou ? '#DCFCE7' : '#FEF2F2'
  const diff = Math.abs(c.valor - c.minimo)
  const pctValor = Math.min((c.valor / c.escala) * 100, 100)
  const pctMin = Math.min((c.minimo / c.escala) * 100, 100)

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, color: cor, fontWeight: 700 }}>{passou ? '✓' : '✗'}</span>
          <span style={{ fontSize: 12, color: '#444' }}>{c.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#bbb' }}>mín. {c.isAcertos ? c.minimo : c.minimo.toFixed(1)}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: cor, background: bgCor, padding: '2px 8px', borderRadius: 8 }}>
            {c.isAcertos ? c.valor : c.valor.toFixed(1)}
            {c.isAcertos && <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>ac.</span>}
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 6, background: '#F1F5F9', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${pctValor}%`, background: cor, borderRadius: 3, transition: 'width 0.5s' }} />
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${pctMin}%`, width: 2, background: 'rgba(0,0,0,0.35)', borderRadius: 1 }} />
      </div>
      <div style={{ fontSize: 10, color: passou ? '#16A34A' : '#DC2626', marginTop: 3, textAlign: 'right' }}>
        {passou
          ? `+${c.isAcertos ? diff : diff.toFixed(1)} acima do mínimo`
          : `−${c.isAcertos ? diff : diff.toFixed(1)} abaixo do mínimo`}
      </div>
    </div>
  )
}

export function DiagnosticoCorte({ dados, rankingAtivo, cicloAtivo }: { dados: any[], rankingAtivo: any, cicloAtivo: string | null }) {
  if (!rankingAtivo || !cicloAtivo) return null

  const concurso: string | null = rankingAtivo.concurso
    || (cicloAtivo.includes('ITA') ? 'ITA' : cicloAtivo.includes('IME') ? 'IME' : null)
  if (concurso !== 'ITA' && concurso !== 'IME') return null

  const cicloNum = String(cicloAtivo).match(/\d+/)?.[0] || ''
  const reg1f = dados.find(r => {
    const num = String(r.ciclo_nome || '').match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === '1fase'
  })
  const reg2fPort = dados.find(r => {
    const num = String(r.ciclo_nome || '').match(/\d+/)?.[0] || ''
    return num === cicloNum && r.fase === '2fase_port'
  })

  const criterios1f: CriterioCorte[] = []
  const criterios2f: CriterioCorte[] = []

  const n = (v: any) => v !== null && v !== undefined ? Number(v) : null

  if (concurso === 'ITA') {
    const maxAc = 10
    if (reg1f?.acertos_mat_1f != null) criterios1f.push({ label: 'Matemática', valor: n(reg1f.acertos_mat_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (reg1f?.acertos_fis_1f != null) criterios1f.push({ label: 'Física', valor: n(reg1f.acertos_fis_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (reg1f?.acertos_qui_1f != null) criterios1f.push({ label: 'Química', valor: n(reg1f.acertos_qui_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (reg1f?.acertos_ing_1f != null) criterios1f.push({ label: 'Inglês', valor: n(reg1f.acertos_ing_1f), minimo: 5, escala: maxAc, isAcertos: true })
    if (n(rankingAtivo.media_1fase) !== null) criterios1f.push({ label: 'Média geral', valor: n(rankingAtivo.media_1fase), minimo: 5.0, escala: 10 })
    if (n(rankingAtivo.nota_matematica) !== null) criterios2f.push({ label: 'Matemática', valor: n(rankingAtivo.nota_matematica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_fisica) !== null) criterios2f.push({ label: 'Física', valor: n(rankingAtivo.nota_fisica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_quimica) !== null) criterios2f.push({ label: 'Química', valor: n(rankingAtivo.nota_quimica), minimo: 4.0, escala: 10 })
    if (n(reg2fPort?.nota_portugues) !== null) {
      criterios2f.push({ label: 'Português (obj.)', valor: n(reg2fPort.nota_portugues), minimo: 6.0, escala: 10 })
    } else if (n(rankingAtivo.media_linguagens) !== null) {
      criterios2f.push({ label: 'Port./Redação', valor: n(rankingAtivo.media_linguagens), minimo: 4.0, escala: 10 })
    }
    if (n(reg2fPort?.nota_redacao) !== null) criterios2f.push({ label: 'Redação', valor: n(reg2fPort.nota_redacao), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.media_2fase) !== null) criterios2f.push({ label: 'Média final', valor: n(rankingAtivo.media_2fase), minimo: 5.0, escala: 10 })
  }

  if (concurso === 'IME') {
    if (reg1f?.acertos_mat_1f != null) criterios1f.push({ label: 'Matemática', valor: n(reg1f.acertos_mat_1f), minimo: 6, escala: 15, isAcertos: true })
    if (reg1f?.acertos_fis_1f != null) criterios1f.push({ label: 'Física', valor: n(reg1f.acertos_fis_1f), minimo: 6, escala: 15, isAcertos: true })
    if (reg1f?.acertos_qui_1f != null) criterios1f.push({ label: 'Química', valor: n(reg1f.acertos_qui_1f), minimo: 4, escala: 10, isAcertos: true })
    if (n(rankingAtivo.media_1fase) !== null) criterios1f.push({ label: 'Total (≥ 20/40)', valor: n(rankingAtivo.media_1fase), minimo: 5.0, escala: 10 })
    if (n(rankingAtivo.nota_matematica) !== null) criterios2f.push({ label: 'Matemática', valor: n(rankingAtivo.nota_matematica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_fisica) !== null) criterios2f.push({ label: 'Física', valor: n(rankingAtivo.nota_fisica), minimo: 4.0, escala: 10 })
    if (n(rankingAtivo.nota_quimica) !== null) criterios2f.push({ label: 'Química', valor: n(rankingAtivo.nota_quimica), minimo: 4.0, escala: 10 })
    if (n(reg2fPort?.nota_portugues) !== null) {
      criterios2f.push({ label: 'Português (obj.)', valor: n(reg2fPort.nota_portugues), minimo: 6.0, escala: 10 })
    } else if (n(rankingAtivo.media_linguagens) !== null) {
      criterios2f.push({ label: 'Port./Redação', valor: n(rankingAtivo.media_linguagens), minimo: 4.0, escala: 10 })
    }
    if (n(reg2fPort?.nota_redacao) !== null) criterios2f.push({ label: 'Redação', valor: n(reg2fPort.nota_redacao), minimo: 4.0, escala: 10 })
  }

  if (!criterios1f.length && !criterios2f.length) return null

  const falhou1f = criterios1f.filter(c => c.valor !== null && c.valor < c.minimo)
  const falhou2f = criterios2f.filter(c => c.valor !== null && c.valor < c.minimo)
  const cortadoEm = falhou1f.length > 0 ? '1ª Fase' : falhou2f.length > 0 ? '2ª Fase' : null
  const passou = !cortadoEm

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Critérios de corte — {concurso}</div>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600,
          background: passou ? '#DCFCE7' : '#FEF2F2',
          color: passou ? '#14532D' : '#991B1B',
        }}>
          {passou ? '✓ Passou em tudo' : `✗ Cortado na ${cortadoEm}`}
        </span>
      </div>

      {!passou && (
        <div style={{ background: '#FFF7F7', border: '1px solid #F5C6C6', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#991B1B' }}>
          {cortadoEm === '1ª Fase'
            ? `Eliminado na 1ª fase: ${falhou1f.map(c => c.label).join(', ')}`
            : `Eliminado na 2ª fase: ${falhou2f.map(c => `${c.label} (${c.valor?.toFixed(1)} < ${c.minimo.toFixed(1)})`).join(' · ')}`}
        </div>
      )}

      {criterios1f.length > 0 && (
        <div style={{ marginBottom: criterios2f.length ? 14 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            1ª Fase
          </div>
          {criterios1f.map((c, i) => <ItemCorte key={i} c={c} />)}
        </div>
      )}

      {criterios2f.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            2ª Fase
          </div>
          {criterios2f.map((c, i) => <ItemCorte key={i} c={c} />)}
        </div>
      )}
    </div>
  )
}
