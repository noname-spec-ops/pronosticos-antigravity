import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cyberBg: '#050811',
        cyberCard: '#0a101f',
        cyberSurface: '#0f172a',
        cyberBorder: '#1e293b',
        cyberCyan: '#00f0ff',
        cyberEmerald: '#00ff9d',
        cyberAmber: '#ffb703',
        cyberViolet: '#a855f7',
        cyberRose: '#ff0055',
        flashBg: '#060a12',
        flashCard: '#0c1322',
        flashHover: '#141e33',
        flashBorder: '#1e2c45',
        flashGreen: '#00ff9d',
        flashRed: '#ff3366',
        flashYellow: '#ffb703',
        flashBlue: '#00f0ff',
        flashMuted: '#94a3b8',
      },
      boxShadow: {
        'glow-cyan': '0 0 20px -3px rgba(0, 240, 255, 0.35)',
        'glow-emerald': '0 0 20px -3px rgba(0, 255, 157, 0.35)',
        'glow-amber': '0 0 20px -3px rgba(255, 183, 3, 0.35)',
        'glow-violet': '0 0 20px -3px rgba(168, 85, 247, 0.35)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backgroundImage: {
        'cyber-grid': 'radial-gradient(rgba(0, 240, 255, 0.08) 1px, transparent 0)',
        'glow-radial': 'radial-gradient(circle at 50% 0%, rgba(0, 240, 255, 0.08) 0%, transparent 70%)',
      }
    },
  },
  plugins: [],
};
export default config;