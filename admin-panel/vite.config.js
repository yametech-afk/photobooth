import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// outDir "build" so `firebase deploy --only hosting` (public: "build") works as-is
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'build', sourcemap: false },
});
