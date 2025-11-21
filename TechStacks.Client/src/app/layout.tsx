import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Providers from '@/providers'
import { Header } from '@/components/layout/Header';
import '@/styles/globals.css';
import { GoogleAnalytics } from '@next/third-parties/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TechStacks - Technology Stack Sharing',
  description: 'Discover and share technology stacks used by the most popular startups and companies',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Force light mode by preventing dark class
              try {
                document.documentElement.classList.remove('dark');
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <Header />
          <main className="min-h-screen bg-gray-50">
            {children}
          </main>          
        </Providers>
        <GoogleAnalytics gaId="G-9EZHMS9ZM6" />
      </body>
    </html>
  );
}
