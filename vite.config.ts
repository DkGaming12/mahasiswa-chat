import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Kita HAPUS baris "base: './'" agar Vercel bisa mengatur halaman dengan benar
  // Jika nanti mau balik ke Android Studio, baris ini perlu ditambahkan lagi.
})