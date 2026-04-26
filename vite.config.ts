import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return {
      root: 'demo',
      server: { port: 5174, open: true },
    };
  }
  return {
    build: {
      target: 'es2020',
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        formats: ['es'],
        fileName: 'index',
      },
      rollupOptions: {
        external: [],
        output: { exports: 'named' },
      },
      sourcemap: true,
      minify: 'esbuild',
    },
  };
});
