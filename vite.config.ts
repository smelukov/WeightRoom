import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// `base` defaults to "/" so dev server and any preview works at the root.
// CI sets VITE_BASE=/WeightRoom/ when deploying to GitHub Pages (project page
// served from a subpath). Keeping it env-driven means switching to a custom
// domain later is just "drop the env var" — no source change needed.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
