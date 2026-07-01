'use client'

// Banner padrão de falha de carregamento (leitura do banco falhou → mostrar erro
// em vez de "0 registros" enganoso). Reaproveita o mesmo visual já usado em
// app/simulados e app/mentor.
export default function ErroLoad({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{msg}</div>
      <button
        onClick={onRetry}
        style={{ padding: '8px 20px', borderRadius: 10, background: '#f97316', color: 'white', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
      >
        Tentar novamente
      </button>
    </div>
  )
}
