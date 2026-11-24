import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' — GitHub Pages veya herhangi bir klasörden açılabilsin diye
export default defineConfig({
  base: './',
  plugins: [react()],
})
