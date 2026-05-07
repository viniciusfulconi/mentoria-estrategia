import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mentoria Estratégia',
  description: 'Plataforma de coordenação de mentoria',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
