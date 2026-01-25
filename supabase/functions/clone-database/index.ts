import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.3/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory job storage (will reset on function cold start)
const activeJobs = new Map<string, {
  phase: string;
  current: number;
  total: number;
  currentItem: string;
  error?: string;
  cancelled: boolean;
  verification?: { table: string; sourceCount: number; targetCount: number; match: boolean }[];
  verificationPassed?: boolean;
}>();

// Tables to clone in order (respecting foreign key dependencies)
const TABLES_ORDER = [
  'profiles',
  'projects',
  'project_members',
  'project_locks',
  'project_outlines',
  'scripts',
  'episodes',
  'characters',
  'character_visual_dna',
  'character_pack_slots',
  'reference_anchors',
  'locations',
  'scenes',
  'scene_camera_plan',
  'scene_technical_docs',
  'shots',
  'micro_shots',
  'storyboard_panels',
  'generation_runs',
  'generation_blocks',
  'generation_logs',
  'generation_rate_limits',
  'decisions_log',
  'comments',
  'continuity_locks',
  'canon_packs',
  'canon_assets',
  'audio_layers',
  'audio_presets',
  'pre_render_validations',
  'cost_assumptions',
  'user_budgets',
  'user_usage',
  'user_roles',
  'prompt_cache',
  'editorial_rules_config',
  'ekb_animation_styles',
  'ekb_format_profiles',
  'ekb_industry_rules',
  'episode_qc',
  'background_tasks'
];

// Large tables that need smaller chunks
const LARGE_TABLES = ['scripts', 'generation_blocks', 'generation_logs', 'storyboard_panels'];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, jobId, targetUrl, options } = body;

    // Handle status check
    if (action === "status") {
      const job = activeJobs.get(jobId);
      if (!job) {
        // Cold start occurred - inform user to retry
        return new Response(
          JSON.stringify({ 
            error: "Job not found - la función se reinició", 
            progress: { 
              phase: 'error', 
              current: 0,
              total: 0,
              currentItem: '',
              error: 'Sesión expirada (cold start). Por favor intenta de nuevo.' 
            } 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ progress: job }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle cancel
    if (action === "cancel") {
      const job = activeJobs.get(jobId);
      if (job) {
        job.cancelled = true;
        activeJobs.delete(jobId);
      }
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle start
    if (action === "start") {
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ error: "Target URL is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate URL format - more permissive to allow special chars in password
      // Format: postgresql://user:password@host:port/database
      try {
        const url = new URL(targetUrl);
        if (!url.protocol.startsWith('postgres')) {
          throw new Error('Protocol must be postgres or postgresql');
        }
        if (!url.hostname || !url.port || !url.pathname.slice(1)) {
          throw new Error('Missing host, port, or database');
        }
      } catch (urlErr: any) {
        return new Response(
          JSON.stringify({ error: `Invalid PostgreSQL URL: ${urlErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate job ID
      const newJobId = crypto.randomUUID();
      
      // Initialize job
      activeJobs.set(newJobId, {
        phase: 'connecting',
        current: 0,
        total: 0,
        currentItem: 'Iniciando conexiones...',
        cancelled: false
      });

      // Start cloning in background (non-blocking)
      cloneDatabase(newJobId, targetUrl, options || {}).catch(console.error);

      return new Response(
        JSON.stringify({ jobId: newJobId, message: "Cloning started" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Clone database error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function cloneDatabase(jobId: string, targetUrl: string, options: { includeData?: boolean; includeStorage?: boolean }) {
  const job = activeJobs.get(jobId);
  if (!job) return;

  let sourceDb: ReturnType<typeof postgres> | null = null;
  let targetDb: ReturnType<typeof postgres> | null = null;

  try {
    const sourceUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!sourceUrl) {
      throw new Error("SUPABASE_DB_URL not configured");
    }

    // Sanitize target URL - properly encode password with special characters
    let cleanTargetUrl = targetUrl;
    try {
      const url = new URL(targetUrl);
      if (url.password) {
        // Decode first (in case partially encoded), then re-encode properly
        const decodedPassword = decodeURIComponent(url.password);
        url.password = encodeURIComponent(decodedPassword);
        cleanTargetUrl = url.toString();
      }
    } catch (urlParseErr) {
      console.warn("URL sanitization warning:", urlParseErr);
      // Continue with original URL if parsing fails
    }

    // Phase: Connecting
    job.phase = 'connecting';
    job.currentItem = 'Conectando a base de datos origen...';
    
    sourceDb = postgres(sourceUrl, { max: 1 });
    await sourceDb`SELECT 1`; // Test connection
    
    job.currentItem = 'Conectando a base de datos destino...';
    targetDb = postgres(cleanTargetUrl, { max: 1 });
    await targetDb`SELECT 1`; // Test connection

    if (job.cancelled) return cleanup();

    // Phase: Enums
    job.phase = 'enums';
    job.currentItem = 'Obteniendo tipos ENUM...';
    
    const enums = await sourceDb`
      SELECT t.typname, e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY t.typname, e.enumsortorder
    `;

    // Group enums by type name
    const enumsByType = new Map<string, string[]>();
    for (const row of enums) {
      if (!enumsByType.has(row.typname)) {
        enumsByType.set(row.typname, []);
      }
      enumsByType.get(row.typname)!.push(row.enumlabel);
    }

    job.total = enumsByType.size;
    job.current = 0;
    
    for (const [typeName, values] of enumsByType) {
      if (job.cancelled) return cleanup();
      job.currentItem = `Creando ENUM: ${typeName}`;
      
      try {
        // Drop if exists and recreate
        await targetDb.unsafe(`DROP TYPE IF EXISTS public.${typeName} CASCADE`);
        const valuesStr = values.map(v => `'${v}'`).join(', ');
        await targetDb.unsafe(`CREATE TYPE public.${typeName} AS ENUM (${valuesStr})`);
      } catch (enumErr: any) {
        console.warn(`Enum ${typeName} warning:`, enumErr.message);
      }
      job.current++;
    }

    if (job.cancelled) return cleanup();

    // Phase: Schema (tables)
    job.phase = 'schema';
    job.currentItem = 'Obteniendo estructura de tablas...';
    
    // Get table definitions
    const tables = await sourceDb`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
      ORDER BY table_name
    `;

    job.total = tables.length;
    job.current = 0;

    for (const table of tables) {
      if (job.cancelled) return cleanup();
      const tableName = table.table_name;
      job.currentItem = `Creando tabla: ${tableName}`;
      
      try {
        // Get column definitions
        const columns = await sourceDb`
          SELECT 
            column_name,
            data_type,
            udt_name,
            is_nullable,
            column_default,
            character_maximum_length
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${tableName}
          ORDER BY ordinal_position
        `;

        // Build CREATE TABLE statement
        const colDefs = columns.map(col => {
          let typeDef = col.data_type === 'USER-DEFINED' ? col.udt_name : col.data_type;
          if (col.data_type === 'ARRAY') {
            typeDef = `${col.udt_name.replace(/^_/, '')}[]`;
          }
          if (col.character_maximum_length) {
            typeDef = `${col.data_type}(${col.character_maximum_length})`;
          }
          
          let def = `"${col.column_name}" ${typeDef}`;
          if (col.is_nullable === 'NO') def += ' NOT NULL';
          if (col.column_default) def += ` DEFAULT ${col.column_default}`;
          return def;
        }).join(',\n  ');

        // Get primary key
        const pkResult = await sourceDb`
          SELECT a.attname
          FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = ${`public.${tableName}`}::regclass AND i.indisprimary
        `;
        
        let pkClause = '';
        if (pkResult.length > 0) {
          const pkCols = pkResult.map(r => `"${r.attname}"`).join(', ');
          pkClause = `,\n  PRIMARY KEY (${pkCols})`;
        }

        // Create table (drop first if exists)
        await targetDb.unsafe(`DROP TABLE IF EXISTS public."${tableName}" CASCADE`);
        await targetDb.unsafe(`CREATE TABLE public."${tableName}" (\n  ${colDefs}${pkClause}\n)`);
        
      } catch (tableErr: any) {
        console.warn(`Table ${tableName} error:`, tableErr.message);
      }
      job.current++;
    }

    if (job.cancelled) return cleanup();

    // Phase: Data
    if (options.includeData !== false) {
      job.phase = 'data';
      
      // Count total rows
      let totalRows = 0;
      const tableCounts = new Map<string, number>();
      
      for (const tableName of TABLES_ORDER) {
        try {
          const countResult = await sourceDb.unsafe(`SELECT COUNT(*) as count FROM public."${tableName}"`);
          const count = parseInt(countResult[0]?.count || '0');
          tableCounts.set(tableName, count);
          totalRows += count;
        } catch {
          tableCounts.set(tableName, 0);
        }
      }

      job.total = totalRows;
      job.current = 0;

      // Disable triggers on target
      try {
        await targetDb.unsafe(`SET session_replication_role = 'replica'`);
      } catch {}

      for (const tableName of TABLES_ORDER) {
        if (job.cancelled) return cleanup();
        
        const tableCount = tableCounts.get(tableName) || 0;
        if (tableCount === 0) continue;
        
        job.currentItem = `Copiando: ${tableName} (0/${tableCount})`;
        
        try {
          const chunkSize = LARGE_TABLES.includes(tableName) ? 10 : 100;
          let offset = 0;
          let copied = 0;

          while (copied < tableCount) {
            if (job.cancelled) return cleanup();

            const rows = await sourceDb.unsafe(
              `SELECT * FROM public."${tableName}" LIMIT ${chunkSize} OFFSET ${offset}`
            );

            if (rows.length === 0) break;

            // Insert rows
            for (const row of rows) {
              const columns = Object.keys(row);
              const values = columns.map(c => row[c]);
              const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
              const colNames = columns.map(c => `"${c}"`).join(', ');

              try {
                await targetDb.unsafe(
                  `INSERT INTO public."${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                  values
                );
              } catch (insertErr: any) {
                // Log but continue
                console.warn(`Insert error in ${tableName}:`, insertErr.message);
              }

              copied++;
              job.current++;
              job.currentItem = `Copiando: ${tableName} (${copied}/${tableCount})`;
            }

            offset += chunkSize;
            
            // Small delay to avoid overloading
            await new Promise(r => setTimeout(r, 50));
          }
        } catch (dataErr: any) {
          console.warn(`Data copy error for ${tableName}:`, dataErr.message);
        }
      }

      // Re-enable triggers
      try {
        await targetDb.unsafe(`SET session_replication_role = 'origin'`);
      } catch {}
    }

    if (job.cancelled) return cleanup();

    // Phase: Functions
    job.phase = 'functions';
    job.currentItem = 'Copiando funciones...';
    
    const functions = await sourceDb`
      SELECT 
        p.proname as name,
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
    `;

    job.total = functions.length;
    job.current = 0;

    for (const func of functions) {
      if (job.cancelled) return cleanup();
      job.currentItem = `Creando función: ${func.name}`;
      
      try {
        // Drop existing and recreate
        await targetDb.unsafe(`DROP FUNCTION IF EXISTS public.${func.name} CASCADE`);
        await targetDb.unsafe(func.definition);
      } catch (funcErr: any) {
        console.warn(`Function ${func.name} warning:`, funcErr.message);
      }
      job.current++;
    }

    if (job.cancelled) return cleanup();

    // Phase: Policies
    job.phase = 'policies';
    job.currentItem = 'Aplicando políticas RLS...';
    
    // Enable RLS on tables
    for (const tableName of TABLES_ORDER) {
      if (job.cancelled) return cleanup();
      
      try {
        await targetDb.unsafe(`ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY`);
      } catch {}
    }

    // Get and apply policies
    const policies = await sourceDb`
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
    `;

    job.total = policies.length;
    job.current = 0;

    for (const policy of policies) {
      if (job.cancelled) return cleanup();
      job.currentItem = `Política: ${policy.policyname}`;
      
      try {
        const permissive = policy.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE';
        const roles = policy.roles.join(', ');
        const using = policy.qual ? `USING (${policy.qual})` : '';
        const withCheck = policy.with_check ? `WITH CHECK (${policy.with_check})` : '';

        await targetDb.unsafe(`DROP POLICY IF EXISTS "${policy.policyname}" ON public."${policy.tablename}"`);
        await targetDb.unsafe(`
          CREATE POLICY "${policy.policyname}" 
          ON public."${policy.tablename}"
          AS ${permissive}
          FOR ${policy.cmd}
          TO ${roles}
          ${using}
          ${withCheck}
        `);
      } catch (polErr: any) {
        console.warn(`Policy ${policy.policyname} warning:`, polErr.message);
      }
      job.current++;
    }

    // Phase: Verification
    if (job.cancelled) return cleanup();
    
    job.phase = 'verification';
    job.currentItem = 'Verificando integridad de datos...';
    job.current = 0;
    job.total = TABLES_ORDER.length;
    
    const verificationResults: { table: string; sourceCount: number; targetCount: number; match: boolean }[] = [];
    
    for (const tableName of TABLES_ORDER) {
      if (job.cancelled) return cleanup();
      
      try {
        // Count in source
        const sourceResult = await sourceDb.unsafe(`SELECT COUNT(*) as count FROM public."${tableName}"`);
        const sourceCount = parseInt(sourceResult[0]?.count || '0');
        
        // Count in target
        const targetResult = await targetDb.unsafe(`SELECT COUNT(*) as count FROM public."${tableName}"`);
        const targetCount = parseInt(targetResult[0]?.count || '0');
        
        verificationResults.push({
          table: tableName,
          sourceCount,
          targetCount,
          match: sourceCount === targetCount
        });
        
        job.currentItem = `Verificando: ${tableName} (${sourceCount} → ${targetCount})`;
        job.current++;
      } catch {
        // Table might not exist in one of the databases
        job.current++;
      }
    }
    
    // Store verification results
    job.verification = verificationResults;
    job.verificationPassed = verificationResults.every(v => v.match);

    // Done!
    job.phase = 'done';
    job.currentItem = '¡Clonación completada!';
    job.current = job.total;

  } catch (err: any) {
    console.error("Clone error:", err);
    if (job) {
      job.phase = 'error';
      
      // Provide clearer error messages for common issues
      let errorMessage = err.message || 'Error durante la clonación';
      
      if (err.code === '28P01') {
        errorMessage = "Error de autenticación: verifica que la contraseña sea correcta. " +
          "Si contiene caracteres especiales (!, @, #, etc.), intenta cambiarla por una más simple.";
      } else if (err.code === '28000') {
        errorMessage = "Conexión rechazada: verifica que la URL sea correcta y el servidor acepte conexiones.";
      } else if (err.code === 'ENOTFOUND' || err.message?.includes('getaddrinfo')) {
        errorMessage = "No se pudo resolver el host. Verifica que la URL del servidor sea correcta.";
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = "Conexión rechazada. Verifica que el servidor esté activo y acepte conexiones externas.";
      }
      
      job.error = errorMessage;
      job.currentItem = '';
    }
  } finally {
    cleanup();
  }

  async function cleanup() {
    try {
      if (sourceDb) await sourceDb.end();
    } catch {}
    try {
      if (targetDb) await targetDb.end();
    } catch {}
  }
}
