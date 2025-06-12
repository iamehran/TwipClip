import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Playfair_Display, Outfit } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ["400", "500", "600", "700", "800", "900"],
});

const antipasto = Outfit({ 
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-antipasto',
});

export const metadata: Metadata = {
  title: "TwipClip - Find relevant YouTube clips for your tweets",
  description: "TwipClip helps you find and extract relevant YouTube clips based on your tweet content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} ${antipasto.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
