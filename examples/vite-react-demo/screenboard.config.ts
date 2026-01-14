import { defineConfig } from "@screenboard/core";

export default defineConfig({
  app: {
    baseUrl: "http://localhost:5173",
    command: "pnpm dev"
  },
  output: {
    dir: "screenboard",
    title: "Vite React Demo"
  },
  viewports: [
    { id: "desktop", name: "Desktop", width: 1280, height: 720 },
    { id: "mobile", name: "Mobile", width: 390, height: 844 }
  ],
  screens: [
    { id: "home", name: "Home", url: "/" },
    { id: "pricing", name: "Pricing", url: "/pricing" },
    { id: "settings", name: "Settings", url: "/settings" }
  ]
});
