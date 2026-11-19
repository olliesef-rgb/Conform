import type { Metadata } from 'next'
import { Inter, Archivo } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap' })
const archivo = Archivo({ subsets: ['latin'], weight: ['900'], style: ['italic'], display: 'swap', variable: '--font-wordmark' })

export const metadata: Metadata = { title: 'Conform', description: 'ITP & SWMS Platform' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} ${archivo.variable}`}>
      <body style={{ margin: 0, padding: 0, background: '#FFFBF5' }}>{children}</body>
    </html>
  )
}
