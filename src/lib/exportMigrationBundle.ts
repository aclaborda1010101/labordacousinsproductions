import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';

export interface ExportProgress {
  phase: 'idle' | 'init' | 'migrations' | 'tables' | 'storage' | 'functions' | 'compressing' | 'done' | 'error';
  current: number;
  total: number;
  currentItem: string;
  error?: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

// Fetch all migration files from the repo
const MIGRATION_FILES_INFO = `
This folder contains the SQL migrations that define the database schema.
Run these in order using: supabase db push
Or apply directly with: psql $DATABASE_URL -f <filename>
`;

// List of edge functions to include
const EDGE_FUNCTIONS = [
  'analyze-character-references',
  'analyze-keyframe-coherence',
  'analyze-single-reference',
  'analyze-style-reference',
  'audio-design',
  'batch-generate',
  'batch-orchestrator',
  'breakdown-consolidate',
  'build-canon-pack',
  'calculate-identity-score',
  'density-precheck',
  'detect-canon-drift',
  'develop-structure',
  'disable-developer-mode',
  'engine-shootout',
  'entity-builder',
  'episode-consolidate',
  'episode-generate-batch',
  'expand-scene-card',
  'export-bible',
  'export-migration-bundle',
  'extract-wardrobe-lock',
  'force-unlock-project',
  'forge-analytics',
  'forge-analyze-image',
  'forge-generate-visual',
  'forge-stt',
  'forge-tts',
  'generate-angle-variants',
  'generate-camera-plan',
  'generate-character',
  'generate-dialogues-batch',
  'generate-episode-detailed',
  'generate-keyframe',
  'generate-keyframes-batch',
  'generate-location',
  'generate-microshot-keyframes',
  'generate-microshot-video',
  'generate-outfit',
  'generate-outline-direct',
  'generate-outline-light',
  'generate-production-script',
  'generate-run',
  'generate-scene-cards',
  'generate-scenes',
  'generate-script',
  'generate-shot',
  'generate-shot-details',
  'generate-storyboard',
  'generate-teasers',
  'generate-technical-doc',
  'generate-technical-prompt',
  'generate-visual-dna',
  'hollywood-smell-test',
  'hydrate-shot-from-technical',
  'identity-fix-panel',
  'improve-character-qc',
  'kling_poll',
  'kling_start',
  'lora-training-webhook',
  'materialize-entities',
  'materialize-scenes',
  'outline-enrich',
  'outline-patch',
  'outline-upgrade',
  'outline-watchdog',
  'outline-worker',
  'parse-script',
  'polish-episode',
  'pre-render-qc-gate',
  'producer-notes',
  'production-director',
  'production-engine',
  'qc-keyframe-constraints',
  'qc-storyboard-identity',
  'qc-visual-identity',
  'regenerate-storyboard-panel',
  'render-storyboard-batch',
  'rescue-block',
  'runway_poll',
  'runway_start',
  'script-breakdown',
  'script-breakdown-pro',
  'script-doctor',
  'script-freeze',
  'script-generate',
  'script-generate-episode',
  'script-generate-outline',
  'script-generate-screenplay',
  'script-qc-outline',
  'script-rewrite-outline',
  'shot-suggest',
  'train-character-lora',
  'unlock-developer-mode',
  'validate-continuity-locks',
  'validate-sequence',
  'veo_poll',
  'veo_start',
];

const SHARED_FILES = [
  'ai-fetch.ts',
  'anti-generic.ts',
  'auth.ts',
  'batch-planner.ts',
  'build-script-outline.ts',
  'cost-logging.ts',
  'density-validator.ts',
  'episode-contracts.ts',
  'extract-model-text.ts',
  'extraction-prompts.ts',
  'extraction-qc.ts',
  'format-profile.ts',
  'hollywood-writing-dna.ts',
  'image-generator.ts',
  'job-manager.ts',
  'llmJson.ts',
  'model-config.ts',
  'model-selector.ts',
  'narrative-profiles.ts',
  'normalize-outline-v11.ts',
  'normalizeBreakdown.ts',
  'outline-schemas-film.ts',
  'outline-schemas-v11.ts',
  'parse-json-robust.ts',
  'production-prompts.ts',
  'promptBuilder.ts',
  'provider-health.ts',
  'qc-validators.ts',
  'repair-prompts.ts',
  'screenplay-parser.ts',
  'script-qc.ts',
  'storyboard-prompt-builder.ts',
  'storyboard-serializer.ts',
  'storyboard-style-presets.ts',
  'v3-enterprise.ts',
];

export async function exportMigrationBundle(
  onProgress: ProgressCallback,
  options: {
    includeStorage?: boolean;
    includeData?: boolean;
  } = {}
): Promise<Blob> {
  const { includeStorage = true, includeData = true } = options;
  const zip = new JSZip();

  try {
    // Phase 1: Initialize
    onProgress({ phase: 'init', current: 0, total: 1, currentItem: 'Inicializando...' });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No authenticated session');
    }

    // Get table list from edge function
    const { data: tableInfo, error: tableError } = await supabase.functions.invoke(
      'export-migration-bundle',
      {
        body: { action: 'list_tables' },
      }
    );

    if (tableError) throw tableError;

    const tables: string[] = tableInfo.tables || [];
    const buckets: string[] = tableInfo.buckets || [];

    // Get templates
    const { data: templates } = await supabase.functions.invoke(
      'export-migration-bundle',
      {
        body: { action: 'get_templates' },
      }
    );

    // Add README
    zip.file('README.md', templates?.readme || '# LC Studio Migration Bundle');
    
    // Add manifest
    const manifest = {
      exportType: 'migration_bundle',
      exportedAt: new Date().toISOString(),
      version: '1.0',
      source: 'lovable-cloud',
      tables: tables.length,
      buckets: buckets.length,
      edgeFunctions: EDGE_FUNCTIONS.length,
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Add secrets template
    const configFolder = zip.folder('config')!;
    configFolder.file('secrets.template.env', templates?.secretsTemplate || '');

    // Phase 1.5: Fetch and add migrations
    onProgress({
      phase: 'migrations',
      current: 0,
      total: 1,
      currentItem: 'Obteniendo migraciones...',
    });

    const { data: migrationsData } = await supabase.functions.invoke(
      'export-migration-bundle',
      {
        body: { action: 'get_migrations' },
      }
    );

    const migrationsFolder = zip.folder('migrations')!;
    const migrations = migrationsData?.migrations || [];
    
    for (let i = 0; i < migrations.length; i++) {
      const mig = migrations[i];
      migrationsFolder.file(mig.name, mig.content);
      
      if (i % 10 === 0) {
        onProgress({
          phase: 'migrations',
          current: i + 1,
          total: migrations.length,
          currentItem: mig.name,
        });
      }
    }

    onProgress({
      phase: 'migrations',
      current: migrations.length,
      total: migrations.length,
      currentItem: `${migrations.length} migraciones incluidas`,
    });

    // Phase 2: Export table data (memory-optimized - no JSON, only SQL)
    if (includeData) {
      const dataFolder = zip.folder('data')!;
      
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        onProgress({
          phase: 'tables',
          current: i + 1,
          total: tables.length,
          currentItem: table,
        });

        try {
          const { data: tableData, error } = await supabase.functions.invoke(
            'export-migration-bundle',
            {
              body: { action: 'export_table', table },
            }
          );

          if (error) {
            console.warn(`Failed to export ${table}:`, error);
            dataFolder.file(`${table}.sql`, `-- Error exporting ${table}: ${error.message}\n`);
          } else if (tableData?.sql) {
            dataFolder.file(`${table}.sql`, tableData.sql);
          } else {
            dataFolder.file(`${table}.sql`, `-- No data in ${table}\n`);
          }
        } catch (err) {
          console.warn(`Failed to export ${table}:`, err);
          dataFolder.file(`${table}.sql`, `-- Error exporting ${table}\n`);
        }

        // Delay between requests to avoid memory buildup and rate limiting
        await new Promise(r => setTimeout(r, 150));
      }
    }

    // Phase 3: List storage files (metadata only - actual download would be too large)
    if (includeStorage) {
      onProgress({
        phase: 'storage',
        current: 0,
        total: buckets.length,
        currentItem: 'Listando archivos de storage...',
      });

      const { data: storageInfo } = await supabase.functions.invoke(
        'export-migration-bundle',
        {
          body: { action: 'list_storage' },
        }
      );

      const storageFolder = zip.folder('storage')!;
      
      // Create manifest of storage files
      const storageManifest: Record<string, any> = {};
      let totalFiles = 0;

      for (const bucket of buckets) {
        const files = storageInfo?.buckets?.[bucket] || [];
        storageManifest[bucket] = files.map((f: any) => ({
          name: f.name,
          size: f.metadata?.size,
          created: f.created_at,
        }));
        totalFiles += files.length;
      }

      storageFolder.file('manifest.json', JSON.stringify(storageManifest, null, 2));
      
      // Create download script
      const downloadScript = generateStorageDownloadScript(buckets, storageManifest);
      storageFolder.file('download-files.sh', downloadScript);

      onProgress({
        phase: 'storage',
        current: buckets.length,
        total: buckets.length,
        currentItem: `${totalFiles} archivos listados`,
      });
    }

    // Phase 4: Add edge functions info
    onProgress({
      phase: 'functions',
      current: 0,
      total: EDGE_FUNCTIONS.length,
      currentItem: 'Preparando edge functions...',
    });

    const functionsFolder = zip.folder('functions')!;
    
    // Add a README for functions
    functionsFolder.file('README.md', `# Edge Functions

This folder should contain the edge function source code.

## Functions List (${EDGE_FUNCTIONS.length} total)

${EDGE_FUNCTIONS.map(f => `- ${f}`).join('\n')}

## Shared Modules

${SHARED_FILES.map(f => `- _shared/${f}`).join('\n')}

## Deployment

\`\`\`bash
cd functions
supabase functions deploy --all
\`\`\`

## Note

The actual source code is in your project's \`supabase/functions/\` directory.
Copy those files here before deploying to your new Supabase project.
`);

    // Note: migrations already added in phase 1.5, just add functions README
    // Phase 5: Compress

    // Phase 5: Compress
    onProgress({
      phase: 'compressing',
      current: 0,
      total: 1,
      currentItem: 'Comprimiendo ZIP...',
    });

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    onProgress({
      phase: 'done',
      current: 1,
      total: 1,
      currentItem: 'Completado',
    });

    return blob;

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    onProgress({
      phase: 'error',
      current: 0,
      total: 0,
      currentItem: message,
      error: message,
    });
    throw error;
  }
}

function generateStorageDownloadScript(buckets: string[], manifest: Record<string, any[]>): string {
  const lines: string[] = [
    '#!/bin/bash',
    '# Storage Download Script',
    '# Run this after setting up your new Supabase project',
    '',
    '# Set your Supabase URL and key',
    'SUPABASE_URL="${SUPABASE_URL:-https://your-project.supabase.co}"',
    'SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"',
    '',
  ];

  for (const bucket of buckets) {
    const files = manifest[bucket] || [];
    if (files.length === 0) continue;

    lines.push(`# Bucket: ${bucket} (${files.length} files)`);
    lines.push(`mkdir -p ${bucket}`);
    
    for (const file of files.slice(0, 50)) { // Limit to first 50 per bucket
      lines.push(`curl -o "${bucket}/${file.name}" "$SUPABASE_URL/storage/v1/object/public/${bucket}/${file.name}"`);
    }
    
    if (files.length > 50) {
      lines.push(`# ... and ${files.length - 50} more files`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
