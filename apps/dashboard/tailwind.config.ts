import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-roboto)",
          "Roboto",
          "Google Sans",
          "ui-sans-serif",
          "system-ui",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "var(--font-roboto-mono)",
          "Roboto Mono",
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        /* MD3 color tokens as Tailwind utilities */
        primary: {
          DEFAULT: "#1A73E8",
          container: "#D3E4FD",
          on: "#FFFFFF",
          "on-container": "#001D36",
        },
        secondary: {
          DEFAULT: "#545F71",
          container: "#D8E3F8",
          on: "#FFFFFF",
          "on-container": "#111C2B",
        },
        tertiary: {
          DEFAULT: "#006E5A",
          container: "#80F8DC",
          on: "#FFFFFF",
          "on-container": "#002019",
        },
        error: {
          DEFAULT: "#B3261E",
          container: "#F9DEDC",
          on: "#FFFFFF",
          "on-container": "#410E0B",
        },
        surface: {
          DEFAULT: "#FAFBFF",
          variant: "#DFE2EB",
          "container-lowest": "#FFFFFF",
          "container-low": "#F2F3FB",
          container: "#E9EBF2",
          "container-high": "#E3E5EC",
          "container-highest": "#DDE0E7",
        },
        outline: {
          DEFAULT: "#73777F",
          variant: "#C3C7CF",
        },
        /* Legacy aliases */
        accent: { DEFAULT: "#006E5A", content: "#FFFFFF" },
        neutral: { DEFAULT: "#43474E", content: "#FFFFFF" },
        "base-100": "#FAFBFF",
        "base-200": "#FFFFFF",
        "base-300": "#E9EBF2",
        "base-content": "#191C20",
      },
      borderRadius: {
        "md-xs": "4px",
        "md-sm": "8px",
        "md-md": "12px",
        "md-lg": "16px",
        "md-xl": "28px",
        "md-full": "9999px",
      },
      boxShadow: {
        "md-1": "0px 1px 2px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)",
        "md-2": "0px 1px 2px rgba(0,0,0,0.3), 0px 2px 6px 2px rgba(0,0,0,0.15)",
        "md-3": "0px 4px 8px 3px rgba(0,0,0,0.15), 0px 1px 3px rgba(0,0,0,0.3)",
        "md-4": "0px 6px 10px 4px rgba(0,0,0,0.15), 0px 2px 3px rgba(0,0,0,0.3)",
      },
      scale: { 101: "1.01" },
    },
  },
  plugins: [],
};

export default config;
