import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        stem: {
          vocals: "#a855f7",
          drums: "#f97316",
          bass: "#3b82f6",
          other: "#22c55e",
          guitar: "#eab308",
          piano: "#ec4899",
          instrumental: "#06b6d4",
        },
      },
      keyframes: {
        glow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 15px rgba(251, 191, 36, 0.6)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 25px rgba(251, 191, 36, 0.9)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 10px rgba(59, 130, 246, 0.5)" },
          "50%": { boxShadow: "0 0 20px rgba(59, 130, 246, 0.8)" },
        },
      },
      animation: {
        glow: "glow 2s ease-in-out infinite",
        "pulse-glow": "pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
