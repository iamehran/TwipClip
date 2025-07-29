import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'TwipClip - AI-Powered Video Clip Extractor',
  description: 'Extract relevant video clips from YouTube videos based on Twitter threads using AI',
}

// Global error handler for unhandled promise rejections
if (typeof window === 'undefined') {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process, let it recover
  });
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
