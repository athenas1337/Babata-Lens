import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#030712",
        canvas: {
          DEFAULT: "#030712",
          subtle: "#04070D",
          deep: "#080D16",
        },
        surface: {
          1: "#0C1420",
          2: "#111C2B",
          3: "#1A283C",
          border: "rgba(103, 232, 249, 0.12)",
          "border-hover": "rgba(103, 232, 249, 0.28)",
        },
        cyan: {
          neon: "#00F0FF",
          glow: "#22D3EE",
        },
        violet: {
          electric: "#7000FF",
          subtle: "#8B5CF6",
        },
        emerald: {
          cyber: "#10B981",
        },
        amber: {
          glow: "#F59E0B",
        },
        rose: {
          flare: "#F43F5E",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains)",
          "'JetBrains Mono'",
          "'Fira Code'",
          "monospace",
        ],
      },
      boxShadow: {
        "hud-cyan": "0 0 20px -5px rgba(0, 240, 255, 0.15)",
        "hud-card": "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "hud-glow": "0 0 15px rgba(34, 211, 238, 0.25)",
      },
      animation: {
        "pulse-subtle": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "hud-breathe": "breathe 4s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.02)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
