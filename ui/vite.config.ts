import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// const tailwindcss = require('@tailwindcss/postcss'); // Using require
// const autoprefixer = require('autoprefixer'); // Using require

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // css: {
  //   postcss: {
  //     plugins: [
  //       tailwindcss,
  //       autoprefixer,
  //     ],
  //   },
  // },
})
