import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { componentTagger } from 'lovable-tagger';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [react(), mode === 'development' && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split heavy vendor libraries into separate cacheable chunks
          if (id.includes('node_modules')) {
            // Mapbox is ~1.7MB - isolate it so it doesn't block other chunks
            if (id.includes('mapbox-gl')) return 'vendor-mapbox';
            // Recharts + D3 dependencies are ~400KB+
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-recharts';
            // TipTap rich text editor
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-tiptap';
            // xlsx/SheetJS is ~334KB - only needed for spreadsheet import
            if (id.includes('xlsx')) return 'vendor-xlsx';
            // Radix UI primitives
            if (id.includes('@radix-ui')) return 'vendor-radix';
            // React core
            if (id.includes('react-dom')) return 'vendor-react-dom';
            // Supabase client
            if (id.includes('@supabase')) return 'vendor-supabase';
            // DnD kit
            if (id.includes('@dnd-kit')) return 'vendor-dnd';
            // Date utilities
            if (id.includes('date-fns')) return 'vendor-date-fns';
          }
          return undefined;
        },
      },
    },
  },
  esbuild: {
    // N11 FIX: Only strip console.log (keep console.error/warn for error reporting)
    // Previous config used drop:['console'] which removed ALL console output
    pure: mode === 'production' ? ['console.log'] : [],
    drop: mode === 'production' ? ['debugger'] : [],
  },
}));
