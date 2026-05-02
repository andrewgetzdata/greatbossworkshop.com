import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://roygetz.com",
  base: "/",
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
