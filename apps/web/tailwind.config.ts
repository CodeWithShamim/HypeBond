import type { Config } from "tailwindcss";

/**
 * THE DROP — locked palette. Rules:
 *  - `volt` appears ONLY when money moves to the influencer (PAID wins).
 *  - the hype→pulse gradient is reserved for the seal, primary CTAs and
 *    the loader — never a full-page wash.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0D0B14",
        hype: "#FF3D8A",
        volt: "#D4FF3D",
        pulse: "#7A5CFF",
        heat: "#FF7A3D",
        bone: "#F4F2FF",
        static: "#2A2540",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        sticker: "4px 4px 0 0 #7A5CFF",
        stickerLift: "8px 8px 0 0 #7A5CFF",
        stickerHeat: "4px 4px 0 0 #FF7A3D",
      },
      backgroundImage: {
        bond: "linear-gradient(135deg, #FF3D8A 0%, #7A5CFF 100%)",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        marqueeReverse: {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        spinSlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        sheen: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        marquee: "marquee 22s linear infinite",
        marqueeReverse: "marqueeReverse 22s linear infinite",
        spinSlow: "spinSlow 24s linear infinite",
        sheen: "sheen 6s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
