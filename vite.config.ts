import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimizaciones del build
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    
    // Configuración de chunks para reducir bundle principal
    rollupOptions: {
      output: {
        // Manual chunking para separar vendors y componentes grandes
        manualChunks: (id) => {
          // Vendor chunks - librerías grandes separadas
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@radix-ui')) {
              return 'vendor-ui';
            }
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
              return 'vendor-forms';
            }
            if (id.includes('@tanstack') || id.includes('@supabase')) {
              return 'vendor-data';
            }
            if (id.includes('date-fns') || id.includes('clsx') || id.includes('class-variance-authority') || id.includes('tailwind-merge') || id.includes('lucide-react')) {
              return 'vendor-utils';
            }
            if (id.includes('jspdf') || id.includes('pdf-parse')) {
              return 'vendor-pdf';
            }
            if (id.includes('puppeteer') || id.includes('jszip')) {
              return 'vendor-media';
            }
            // Otros vendors
            return 'vendor-other';
          }
          
          // Separar componentes grandes por categoría
          if (id.includes('/src/components/ui/')) {
            return 'components-ui';
          }
          
          // Project components - dividir por funcionalidades específicas
          if (id.includes('/src/components/project/')) {
            // Componentes super pesados - chunks individuales
            if (id.includes('ScriptImport.tsx')) {
              return 'project-script-import';
            }
            if (id.includes('CharacterPackBuilder.tsx')) {
              return 'project-character-builder';
            }
            if (id.includes('ScriptWorkspace.tsx')) {
              return 'project-script-workspace';
            }
            if (id.includes('Scenes.tsx')) {
              return 'project-scenes';
            }
            if (id.includes('CharacterVisualDNAEditor.tsx')) {
              return 'project-visual-dna';
            }
            if (id.includes('ScriptSummaryPanelAssisted.tsx') || id.includes('ScriptSummaryPanel.tsx')) {
              return 'project-script-summary';
            }
            if (id.includes('Characters.tsx') || id.includes('CharactersList.tsx') || id.includes('CharacterCreationWizard.tsx') || id.includes('CharacterQuickStart.tsx')) {
              return 'project-characters';
            }
            if (id.includes('ShotEditor.tsx') || id.includes('KeyframeManager.tsx') || id.includes('MicroShotManager.tsx')) {
              return 'project-shot-editing';
            }
            if (id.includes('LocationsList.tsx') || id.includes('LocationPackBuilder.tsx') || id.includes('Locations.tsx')) {
              return 'project-locations';
            }
            if (id.includes('StoryboardPanelView.tsx')) {
              return 'project-storyboard';
            }
            if (id.includes('TechnicalDocEditor.tsx') || id.includes('Props.tsx')) {
              return 'project-technical';
            }
            if (id.includes('CostDashboard.tsx')) {
              return 'project-cost';
            }
            if (id.includes('PreScriptWizard.tsx') || id.includes('ShowrunnerSurgeryDialog.tsx')) {
              return 'project-wizards';
            }
            // Resto de project components pequeños
            return 'project-common';
          }
          
          if (id.includes('/src/components/editorial/')) {
            return 'components-editorial';
          }
          if (id.includes('/src/components/generation/')) {
            return 'components-generation';
          }
          if (id.includes('/src/pages/')) {
            return 'pages';
          }
        },
        
        // Nombres de archivos optimizados
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name?.includes('vendor')) {
            return 'assets/vendors/[name]-[hash].js';
          }
          if (chunkInfo.name?.includes('components')) {
            return 'assets/components/[name]-[hash].js';
          }
          return 'assets/[name]-[hash].js';
        },
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
      
      // Optimizaciones adicionales
      external: (id) => {
        // Externalizar dependencias muy grandes en casos específicos
        return false;
      }
    },
    
    // Configuración del chunk size
    chunkSizeWarningLimit: 800, // Warning si chunk > 800kb
  },
  
  // Optimizaciones adicionales
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@supabase/supabase-js',
    ],
    exclude: [
      // Excluir dependencias problemáticas del pre-bundling
      'puppeteer',
    ]
  },
}));
