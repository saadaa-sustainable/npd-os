import './globals.css'
import { AuthProvider } from '@/lib/auth-context'

export const metadata = {
  title: 'SAADAA NPD OS',
  description: 'New Product Development Operating System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
