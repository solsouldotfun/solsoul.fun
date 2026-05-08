import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        soul: {
          ink: "#050505",
          glow: "#d7ff3f",
          mint: "#d7ff3f",
          purple: "#9b5cff",
          gas: "#7cff6b",
          marker: "#f8ff70",
        },
      },
    },
  },
  plugins: [],
};

export default config;
