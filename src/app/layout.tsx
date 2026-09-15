import type { Metadata } from 'next';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'GEO AI OS — AI Search Infrastructure',
  description:
    'Generative Engine Optimization platform. Make your website easier for AI systems to understand, cite, and summarize.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
