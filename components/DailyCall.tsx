'use client'

type Props = {
  roomUrl: string
  token: string
}

export default function DailyCall({ roomUrl, token }: Props) {
  return (
    <iframe
      src={`${roomUrl}?t=${token}`}
      allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      title="Videochamada"
    />
  )
}
