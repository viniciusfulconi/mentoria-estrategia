// @ts-nocheck
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

function parseDuracao(dur: string): number {
  if (!dur) return 0
  const parts = dur.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 60 + parts[1]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function parseData(d: string): string | null {
  if (!d) return null
  const parts = d.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
  return null
}

export default function UploadAtendimentos() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [preview, setPreview] = useState<any[]>([])

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())

    const rows = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.replace(/"/g, '').trim())
      const obj: any = {}
      headers.forEach((h, i) => { obj[h] = vals[i] || '' })
      return obj
    }).filter(r => r['Mentor'] && r['Mentor'] !== '#N/A' && r['Data Mentoria'])

    setPreview(rows)
    addLog(`✅ ${rows.length} registros detectados`)
    const mentores = [...new Set(rows.map(r => r['Mentor']))].sort()
    addLog(`👥 Mentores: ${mentores.join(', ')}`)
    const psico = rows.filter(r => r['Encaminhamento Psicologico'] === 'Sim').length
    addLog(`🧠 Encaminhamentos psicológicos: ${psico}`)
  }

  async function importar() {
    if (!preview.length) return
    setLoading(true)
    addLog('\n🗑 Limpando dados anteriores...')
    await supabase.from('atendimentos_mentoria').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    const records = preview.map(r => {
      const min = parseDuracao(r['Duração Real'])
      const valor = Math.round((min / 60) * 200 * 100) / 100
      return {
        id_original: Number(r['idMentoria']) || null,
        mentor: r['Mentor'],
        tipo: r['Individual / Coletiva'] || 'Individual',
        aluno: r['Aluno'] || null,
        data_atendimento: parseData(r['Data Mentoria']),
        hora_inicio: r['Hora Inicio'] || null,
        hora_fim: r['Hora Fim'] || null,
        duracao_minutos: min,
        encaminhamento_psico: r['Encaminhamento Psicologico'] === 'Sim',
        solicitacao_aluno: r['Solicitacao Aluno'] || null,
        descricao: r['Descricao Atendimento'] || null,
        link_gravacao: r['Link da gravação da chamada'] || null,
        link_gemini: r['Link do Relatório do Gemini'] || null,
        mes: r['Mês'] || null,
        ano: Number(r['Ano']) || null,
        valor_pago: valor,
      }
    }).filter(r => r.data_atendimento)

    addLog(`📊 Importando ${records.length} atendimentos...`)

    // Insere em lotes de 100
    for (let i = 0; i < records.length; i += 100) {
      const lote = records.slice(i, i + 100)
      const { error } = await supabase.from('atendimentos_mentoria').insert(lote)
      if (error) { addLog(`❌ Erro no lote ${i/100 + 1}: ${error.message}`); break }
      addLog(`  ✅ Lote ${Math.floor(i/100) + 1}/${Math.ceil(records.length/100)} importado`)
    }

    const valorTotal = records.reduce((a, r) => a + r.valor_pago, 0)
    addLog(`\n💰 Valor total: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    addLog('🎉 Importação concluída!')
    setDone(true)
    setLoading(false)
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Importar atendimentos</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Planilha de atendimentos (.csv)</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 12, lineHeight: 1.6 }}>
            Exporte a planilha do AppSheet como CSV e faça o upload. Os dados anteriores serão substituídos.
          </div>
          <input type="file" accept=".csv" onChange={handleFile}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13 }} />
        </div>

        {log.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9, maxHeight: 300, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('❌') ? '#DC2626' : l.startsWith('✅') || l.startsWith('🎉') ? '#16A34A' : l.startsWith('💰') ? '#2563EB' : '#666' }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {preview.length > 0 && !done && (
          <button className="btn-primary" onClick={importar} disabled={loading}>
            {loading ? 'Importando...' : `Importar ${preview.length} atendimentos`}
          </button>
        )}
        {done && (
          <button className="btn-primary" onClick={() => router.push('/atendimentos')}>Ver atendimentos →</button>
        )}
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
