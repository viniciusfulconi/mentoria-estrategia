'use client'
import { useEffect, useRef } from 'react'
import DailyIframe from '@daily-co/daily-js'

type Props = {
  roomUrl: string
  token: string
  onLeft?: () => void
  onError?: (msg: string) => void
}

// Daily Prebuilt via createFrame (em vez de <iframe> cru): mantém a mesma UI mas
// expõe eventos do ciclo de vida da chamada — usados para auto-encerrar a sala
// quando o mentor sai (evento 'left-meeting') e para surfacing de erro.
export default function DailyCall({ roomUrl, token, onLeft, onError }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const callRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null)

  useEffect(() => {
    const parent = wrapRef.current
    if (!parent) return

    // O Daily só permite uma instância por vez — destrói qualquer resíduo antes.
    const existing = DailyIframe.getCallInstance()
    if (existing) { try { existing.destroy() } catch { /* noop */ } }

    const frame = DailyIframe.createFrame(parent, {
      showLeaveButton: true,
      iframeStyle: { width: '100%', height: '100%', border: '0', display: 'block' },
    })
    callRef.current = frame

    frame
      .on('left-meeting', () => onLeft?.())
      .on('error', (ev: any) => onError?.(ev?.errorMsg || 'Erro na chamada'))

    frame.join({ url: roomUrl, token }).catch((e: any) => onError?.(e?.message || 'Falha ao entrar na chamada'))

    return () => {
      callRef.current = null
      try { frame.destroy() } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomUrl, token])

  return <div ref={wrapRef} style={{ width: '100%', height: '100%' }} />
}
