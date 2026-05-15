'use client'
export default function PageLoader() {
  return (
    <div style={{ padding: '16px', paddingBottom: 80 }}>
      {/* Header skeleton */}
      <div style={{
        background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        padding: '16px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        <div style={{ width: 120, height: 20, background: '#E8E8E8', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      </div>
      {/* Cards skeleton */}
      {[1,2,3,4].map(i => (
        <div key={i} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E8E8E8', flexShrink: 0, animation: 'pulse 1.5s infinite' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ width: '60%', height: 14, background: '#E8E8E8', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '40%', height: 11, background: '#F0F0F0', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
            </div>
            <div style={{ width: 40, height: 20, background: '#E8E8E8', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.5 }
        }
      `}</style>
    </div>
  )
}
