import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlashStat — Football Scores & AI Betting Radar',
  description: 'Clone Flashscore integrat cu motor statistic Poisson, Dixon-Coles, ELO si Value Betting validat prin backtest zero data-leakage.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className="dark">
      <body className="min-h-screen bg-[#0f141c] text-[#edf2f7] antialiased selection:bg-flashGreen selection:text-black">
        {children}
      </body>
    </html>
  );
}