import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: "#f3f4f8",
        card: "#ffffff",
        border: "#d7dbe3",
        accent: "#5f46f5",
        accentSoft: "#e8e5ff"
      }
    }
  },
  plugins: []
};

export default config;
