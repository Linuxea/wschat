import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — resolved to CSS variables, swapped per theme via [data-theme]
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
        },
        background: 'var(--background)',
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        border: 'var(--border)',
        text: 'var(--text)',
        subtext: 'var(--subtext)',
        chatbg: 'var(--chatbg)',
        'bubble-self': 'var(--bubble-self)',
        'bubble-other': 'var(--bubble-other)',
        rail: 'var(--rail)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        bubble: 'var(--radius-bubble)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        'soft-md': 'var(--shadow-soft-md)',
        'soft-lg': 'var(--shadow-soft-lg)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
