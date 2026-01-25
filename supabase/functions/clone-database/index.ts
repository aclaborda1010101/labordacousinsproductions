import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.3/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// NOTE: This function uses step-based cloning for reliable progress.
// The frontend calls 'step' repeatedly until done.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Time budget per step (3 seconds - extremely conservative to avoid CPU limit)
const STEP_TIME_BUDGET_MS = 3_000;

type ClonePhase =
  | "idle"
  | "connecting"
  | "enums"
  | "schema"
  | "data"
  | "functions"
  | "policies"
  | "verification"
  | "done"
  | "error";

type VerificationResult = { table: string; sourceCount: number; targetCount: number; match: boolean };

type JobState = {
  phase: ClonePhase;
  current: number;
  total: number;
  currentItem: string;
  error?: string;
  cancelled: boolean;
  verification?: VerificationResult[];
  verificationPassed?: boolean;
};

// Checkpoint for resume support
type CloneCheckpoint = {
  completedPhases: ClonePhase[];      // Phases fully completed
  completedTables: string[];          // Tables fully copied (data phase)
  currentTable: string | null;        // Table in progress
  currentTableOffset: number;         // Offset within current table
  dataRowsCopied: number;             // Total rows copied so far
  tableCounts?: Record<string, number>; // Cached table counts
  totalRows?: number;                 // Cached total rows
};

type CloneTaskMetadata = {
  clone?: {
    progress: JobState;
    checkpoint?: CloneCheckpoint;
    options?: { includeData?: boolean; includeStorage?: boolean };
    targetUrl?: string;  // Stored for resume (RLS protected)
  };
};

function calculateProgressPercent(p: JobState): number {
  const phaseWeights: Record<ClonePhase, number> = {
    idle: 0,
    connecting: 5,
    enums: 10,
    schema: 25,
    data: 75,
    functions: 85,
    policies: 92,
    verification: 98,
    done: 100,
    error: 0,
  };

  const basePercent = phaseWeights[p.phase] ?? 0;

  if (p.phase === "data" && p.total > 0) {
    const dataProgress = (p.current / p.total) * 50;
    return Math.min(25 + dataProgress, 75);
  }

  return basePercent;
}

async function readCloneTask(jobId: string) {
  const { data, error } = await supabaseAdmin
    .from("background_tasks")
    .select("id,user_id,status,metadata,error,updated_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data as null | {
    id: string;
    user_id: string;
    status: string;
    metadata: CloneTaskMetadata;
    error: string | null;
    updated_at: string;
  };
}

async function writeCloneTask(
  jobId: string,
  userId: string,
  job: JobState,
  taskStatus: string,
  checkpoint?: CloneCheckpoint,
  options?: { includeData?: boolean },
  targetUrl?: string | null
) {
  const metadata: CloneTaskMetadata = {
    clone: {
      progress: job,
      checkpoint,
      options,
      targetUrl: targetUrl ?? undefined,
    },
  };
  const overall = Math.round(calculateProgressPercent(job));

  const { error } = await supabaseAdmin
    .from("background_tasks")
    .update({
      status: taskStatus,
      progress: overall,
      metadata,
      error: job.error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("user_id", userId);

  if (error) throw error;
}

// Tables to clone in order (respecting foreign key dependencies)
// IMPORTANT: background_tasks is EXCLUDED to avoid copying sensitive targetUrl
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
  // 'background_tasks' - EXCLUDED for security
];

// Tables that need smaller chunks (JSON-heavy or many columns)
const LARGE_TABLES = ['scripts', 'generation_blocks', 'generation_logs', 'storyboard_panels', 'generation_runs'];

// Stale threshold: job not updated in 60 seconds
const STALE_THRESHOLD_MS = 60_000;

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: "jobId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const task = await readCloneTask(jobId);
      if (!task) {
        return new Response(
          JSON.stringify({
            error: "Job not found",
            progress: {
              phase: "error",
              current: 0,
              total: 0,
              currentItem: "",
              error: "No se encontró el job. Vuelve a iniciar la clonación.",
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (task.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const progress = task.metadata?.clone?.progress;
      if (!progress) {
        return new Response(
          JSON.stringify({
            error: "Job progress missing",
            progress: {
              phase: "error",
              current: 0,
              total: 0,
              currentItem: "",
              error: "El job existe pero no tiene progreso guardado.",
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if job is stale (running but no update in 60s)
      const lastUpdate = new Date(task.updated_at).getTime();
      const isStale = task.status === "running" && Date.now() - lastUpdate > STALE_THRESHOLD_MS;

      return new Response(
        JSON.stringify({ 
          progress,
          isStale,
          checkpoint: task.metadata?.clone?.checkpoint,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle cancel
    if (action === "cancel") {
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: "jobId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const task = await readCloneTask(jobId);
      if (task && task.user_id === user.id) {
        const existing = task.metadata?.clone?.progress;
        const cancelledJob: JobState = {
          ...(existing ?? { phase: "error", current: 0, total: 0, currentItem: "", cancelled: true }),
          cancelled: true,
          phase: "error",
          currentItem: "",
          error: "Clonación cancelada",
        };

        // Clear targetUrl on cancel for security
        const { error } = await supabaseAdmin
          .from("background_tasks")
          .update({
            status: "cancelled",
            metadata: { clone: { progress: cancelledJob, targetUrl: null } },
            error: "Clonación cancelada",
          })
          .eq("id", jobId)
          .eq("user_id", user.id);

        if (error) throw error;
      }
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle clean - drop all tables in target before cloning
    if (action === "clean") {
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ error: "Target URL is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Sanitize target URL
        let cleanTargetUrl = targetUrl;
        try {
          const url = new URL(targetUrl);
          if (url.password) {
            const decodedPassword = decodeURIComponent(url.password);
            url.password = encodeURIComponent(decodedPassword);
            cleanTargetUrl = url.toString();
          }
        } catch {
          // Continue with original URL
        }

        const targetDb = postgres(cleanTargetUrl, { max: 1 });
        
        // Drop and recreate public schema
        await targetDb.unsafe(`
          DROP SCHEMA public CASCADE;
          CREATE SCHEMA public;
          GRANT ALL ON SCHEMA public TO postgres;
          GRANT ALL ON SCHEMA public TO public;
          GRANT ALL ON SCHEMA public TO anon;
          GRANT ALL ON SCHEMA public TO authenticated;
          GRANT ALL ON SCHEMA public TO service_role;
        `);

        await targetDb.end();

        return new Response(
          JSON.stringify({ ok: true, message: "Target database cleaned successfully" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (cleanErr: any) {
        console.error("Clean target error:", cleanErr);
        return new Response(
          JSON.stringify({ error: `Failed to clean target: ${cleanErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Handle resume - just validates and marks running, step does the work
    if (action === "resume") {
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: "jobId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const task = await readCloneTask(jobId);
      if (!task) {
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (task.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const savedTargetUrl = task.metadata?.clone?.targetUrl;
      const checkpoint = task.metadata?.clone?.checkpoint;

      if (!savedTargetUrl) {
        return new Response(
          JSON.stringify({ error: "Cannot resume: target URL not saved. Please start a new clone." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as running again
      await supabaseAdmin
        .from("background_tasks")
        .update({
          status: "running",
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      return new Response(
        JSON.stringify({
          resumed: true,
          jobId,
          fromPhase: checkpoint?.completedPhases?.slice(-1)[0] || "connecting",
          fromTable: checkpoint?.currentTable,
          completedTables: checkpoint?.completedTables?.length || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle start - only creates the job, step does the work
    if (action === "start") {
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ error: "Target URL is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate URL format
      let cleanTargetUrl = targetUrl;
      try {
        const url = new URL(targetUrl);
        if (!url.protocol.startsWith('postgres')) {
          throw new Error('Protocol must be postgres or postgresql');
        }
        if (!url.hostname || !url.port || !url.pathname.slice(1)) {
          throw new Error('Missing host, port, or database');
        }
        // Sanitize password
        if (url.password) {
          const decodedPassword = decodeURIComponent(url.password);
          url.password = encodeURIComponent(decodedPassword);
          cleanTargetUrl = url.toString();
        }
      } catch (urlErr: any) {
        return new Response(
          JSON.stringify({ error: `Invalid PostgreSQL URL: ${urlErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate job ID
      const newJobId = crypto.randomUUID();
      
      const initialJob: JobState = {
        phase: "connecting",
        current: 0,
        total: 0,
        currentItem: "Esperando primer paso...",
        cancelled: false,
      };

      const initialCheckpoint: CloneCheckpoint = {
        completedPhases: [],
        completedTables: [],
        currentTable: null,
        currentTableOffset: 0,
        dataRowsCopied: 0,
      };

      // Persist job state with target URL for resume capability
      const { error: insertError } = await supabaseAdmin.from("background_tasks").insert({
        id: newJobId,
        user_id: user.id,
        status: "running",
        title: "Clonación de base de datos",
        type: "clone_database",
        progress: 0,
        metadata: {
          clone: {
            progress: initialJob,
            checkpoint: initialCheckpoint,
            options: options || {},
            targetUrl: cleanTargetUrl, // Store for resume
          },
        },
      });

      if (insertError) throw insertError;

      // NO BACKGROUND CLONING - step action will do the work
      return new Response(
        JSON.stringify({ jobId: newJobId, message: "Job created. Call step to begin cloning." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle step - the main workhorse that advances cloning incrementally
    if (action === "step") {
      if (!jobId) {
        return new Response(
          JSON.stringify({ error: "jobId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await executeCloneStep(jobId, user.id);
      return new Response(
        JSON.stringify(result),
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

// Execute one step of cloning with time budget
async function executeCloneStep(jobId: string, userId: string): Promise<{
  ok: boolean;
  needsMore: boolean;
  progress: JobState;
  checkpoint?: CloneCheckpoint;
  error?: string;
}> {
  const deadline = Date.now() + STEP_TIME_BUDGET_MS;
  
  const task = await readCloneTask(jobId);
  if (!task) {
    return {
      ok: false,
      needsMore: false,
      progress: { phase: "error", current: 0, total: 0, currentItem: "", error: "Job not found", cancelled: false },
      error: "Job not found"
    };
  }

  if (task.user_id !== userId) {
    return {
      ok: false,
      needsMore: false,
      progress: { phase: "error", current: 0, total: 0, currentItem: "", error: "Forbidden", cancelled: false },
      error: "Forbidden"
    };
  }

  const savedMeta = task.metadata?.clone;
  const savedTargetUrl = savedMeta?.targetUrl;
  const savedOptions = savedMeta?.options || {};

  if (!savedTargetUrl) {
    return {
      ok: false,
      needsMore: false,
      progress: { phase: "error", current: 0, total: 0, currentItem: "", error: "No target URL", cancelled: false },
      error: "No target URL saved"
    };
  }

  const job: JobState = savedMeta?.progress ?? {
    phase: "connecting",
    current: 0,
    total: 0,
    currentItem: "Iniciando...",
    cancelled: false,
  };

  const checkpoint: CloneCheckpoint = savedMeta?.checkpoint ?? {
    completedPhases: [],
    completedTables: [],
    currentTable: null,
    currentTableOffset: 0,
    dataRowsCopied: 0,
  };

  // Check if already done or error
  if (job.phase === "done" || job.phase === "error") {
    return { ok: true, needsMore: false, progress: job, checkpoint };
  }

  // Check cancelled
  if (task.status === "cancelled" || job.cancelled) {
    job.cancelled = true;
    job.phase = "error";
    job.error = "Clonación cancelada";
    await writeCloneTask(jobId, userId, job, "cancelled", checkpoint, savedOptions, null);
    return { ok: true, needsMore: false, progress: job, checkpoint };
  }

  let sourceDb: ReturnType<typeof postgres> | null = null;
  let targetDb: ReturnType<typeof postgres> | null = null;

  try {
    const sourceUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!sourceUrl) {
      throw new Error("SUPABASE_DB_URL not configured");
    }

    // Connect to databases
    sourceDb = postgres(sourceUrl, { max: 1 });
    targetDb = postgres(savedTargetUrl, { max: 1 });

    // Test connections if first step
    if (!checkpoint.completedPhases.includes("connecting")) {
      job.phase = "connecting";
      job.currentItem = "Conectando a bases de datos...";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

      await sourceDb`SELECT 1`;
      await targetDb`SELECT 1`;

      checkpoint.completedPhases.push("connecting");
      job.currentItem = "Conexiones establecidas";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

      // Check time budget
      if (Date.now() > deadline) {
        await cleanup();
        return { ok: true, needsMore: true, progress: job, checkpoint };
      }
    }

    // Phase: Enums
    if (!checkpoint.completedPhases.includes("enums")) {
      job.phase = "enums";
      job.currentItem = "Obteniendo tipos ENUM...";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

      const enums = await sourceDb`
        SELECT t.typname, e.enumlabel
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        ORDER BY t.typname, e.enumsortorder
      `;

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
        if (Date.now() > deadline) {
          await cleanup();
          return { ok: true, needsMore: true, progress: job, checkpoint };
        }

        job.currentItem = `Creando ENUM: ${typeName}`;
        
        try {
          await targetDb.unsafe(`DROP TYPE IF EXISTS public.${typeName} CASCADE`);
          const valuesStr = values.map(v => `'${v}'`).join(', ');
          await targetDb.unsafe(`CREATE TYPE public.${typeName} AS ENUM (${valuesStr})`);
        } catch (enumErr: any) {
          console.warn(`Enum ${typeName} warning:`, enumErr.message);
        }
        job.current++;
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
      }

      checkpoint.completedPhases.push("enums");
      job.currentItem = "ENUMs completados";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
    }

    // Check time budget
    if (Date.now() > deadline) {
      await cleanup();
      return { ok: true, needsMore: true, progress: job, checkpoint };
    }

    // Phase: Schema
    if (!checkpoint.completedPhases.includes("schema")) {
      job.phase = "schema";
      job.currentItem = "Obteniendo estructura de tablas...";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

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
        if (Date.now() > deadline) {
          await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
          await cleanup();
          return { ok: true, needsMore: true, progress: job, checkpoint };
        }

        const tableName = table.table_name;
        job.currentItem = `Creando tabla: ${tableName}`;

        try {
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

          await targetDb.unsafe(`DROP TABLE IF EXISTS public."${tableName}" CASCADE`);
          await targetDb.unsafe(`CREATE TABLE public."${tableName}" (\n  ${colDefs}${pkClause}\n)`);
          
        } catch (tableErr: any) {
          console.warn(`Table ${tableName} error:`, tableErr.message);
        }
        job.current++;
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
      }

      checkpoint.completedPhases.push("schema");
      job.currentItem = "Schema completado";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
    }

    // Check time budget
    if (Date.now() > deadline) {
      await cleanup();
      return { ok: true, needsMore: true, progress: job, checkpoint };
    }

    // Phase: Data
    if (savedOptions.includeData !== false && !checkpoint.completedPhases.includes("data")) {
      job.phase = "data";

      // Calculate table counts once and cache them
      if (!checkpoint.tableCounts || !checkpoint.totalRows) {
        job.currentItem = "Contando registros...";
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

        let totalRows = 0;
        const tableCounts: Record<string, number> = {};

        for (const tableName of TABLES_ORDER) {
          try {
            const countResult = await sourceDb.unsafe(`SELECT COUNT(*) as count FROM public."${tableName}"`);
            const count = parseInt(countResult[0]?.count || '0');
            tableCounts[tableName] = count;
            totalRows += count;
          } catch {
            tableCounts[tableName] = 0;
          }
        }

        checkpoint.tableCounts = tableCounts;
        checkpoint.totalRows = totalRows;
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
      }

      job.total = checkpoint.totalRows || 0;
      job.current = checkpoint.dataRowsCopied;

      // Disable triggers on target (once per step is fine)
      try {
        await targetDb.unsafe(`SET session_replication_role = 'replica'`);
      } catch {}

      // Process tables
      for (const tableName of TABLES_ORDER) {
        if (checkpoint.completedTables.includes(tableName)) {
          continue;
        }

        if (Date.now() > deadline) {
          await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
          await cleanup();
          return { ok: true, needsMore: true, progress: job, checkpoint };
        }

        const tableCount = checkpoint.tableCounts?.[tableName] || 0;
        if (tableCount === 0) {
          checkpoint.completedTables.push(tableName);
          continue;
        }

        checkpoint.currentTable = tableName;
        // Extremely small chunks to avoid CPU limit
        const chunkSize = LARGE_TABLES.includes(tableName) ? 3 : 10;
        
        // Start from saved offset
        let offset = checkpoint.currentTableOffset;
        let copied = offset;
        let rowsThisStep = 0;
        const maxRowsPerStep = 20; // Very aggressive limit per step to avoid CPU exhaustion

        while (copied < tableCount) {
          // Aggressive time check + row limit check
          if (Date.now() > deadline || rowsThisStep >= maxRowsPerStep) {
            job.currentItem = `Copiando: ${tableName} (${copied}/${tableCount})`;
            checkpoint.currentTableOffset = copied;
            await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
            await cleanup();
            return { ok: true, needsMore: true, progress: job, checkpoint };
          }

          const rows = await sourceDb.unsafe(
            `SELECT * FROM public."${tableName}" LIMIT ${chunkSize} OFFSET ${offset}`
          );

          if (rows.length === 0) break;

          // Batch insert all rows in this chunk at once (much more efficient)
          if (rows.length > 0) {
            const columns = Object.keys(rows[0]);
            const colNames = columns.map(c => `"${c}"`).join(', ');
            
            // Build multi-row INSERT
            const valueSets: string[] = [];
            const allValues: any[] = [];
            let paramIndex = 1;
            
            for (const row of rows) {
              const rowValues = columns.map(c => row[c]);
              const rowPlaceholders = rowValues.map(() => `$${paramIndex++}`).join(', ');
              valueSets.push(`(${rowPlaceholders})`);
              allValues.push(...rowValues);
            }
            
            try {
              await targetDb.unsafe(
                `INSERT INTO public."${tableName}" (${colNames}) VALUES ${valueSets.join(', ')} ON CONFLICT DO NOTHING`,
                allValues
              );
              copied += rows.length;
              rowsThisStep += rows.length;
              job.current += rows.length;
              checkpoint.dataRowsCopied += rows.length;
            } catch (insertErr: any) {
              console.warn(`Batch insert error in ${tableName}:`, insertErr.message);
              // Fallback: try row-by-row for this chunk
              for (const row of rows) {
                const values = columns.map(c => row[c]);
                const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                try {
                  await targetDb.unsafe(
                    `INSERT INTO public."${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                    values
                  );
                  copied++;
                  rowsThisStep++;
                  job.current++;
                  checkpoint.dataRowsCopied++;
                } catch (rowErr: any) {
                  console.warn(`Row insert error in ${tableName}:`, rowErr.message);
                }
              }
            }
          }

          offset += chunkSize;
          checkpoint.currentTableOffset = copied;
          job.currentItem = `Copiando: ${tableName} (${copied}/${tableCount})`;
          // Only persist every chunk, not every row
        }
        
        // Persist after completing table
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

        // Table completed
        checkpoint.completedTables.push(tableName);
        checkpoint.currentTable = null;
        checkpoint.currentTableOffset = 0;
        job.currentItem = `Tabla completada: ${tableName}`;
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
      }

      // Re-enable triggers
      try {
        await targetDb.unsafe(`SET session_replication_role = 'origin'`);
      } catch {}

      checkpoint.completedPhases.push("data");
      job.currentItem = "Datos copiados";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
    }

    // Check time budget
    if (Date.now() > deadline) {
      await cleanup();
      return { ok: true, needsMore: true, progress: job, checkpoint };
    }

    // Phase: Functions
    if (!checkpoint.completedPhases.includes("functions")) {
      job.phase = "functions";
      job.currentItem = "Copiando funciones...";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

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
        if (Date.now() > deadline) {
          await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
          await cleanup();
          return { ok: true, needsMore: true, progress: job, checkpoint };
        }

        job.currentItem = `Creando función: ${func.name}`;

        try {
          await targetDb.unsafe(`DROP FUNCTION IF EXISTS public.${func.name} CASCADE`);
          await targetDb.unsafe(func.definition);
        } catch (funcErr: any) {
          console.warn(`Function ${func.name} warning:`, funcErr.message);
        }
        job.current++;
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
      }

      checkpoint.completedPhases.push("functions");
      job.currentItem = "Funciones completadas";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
    }

    // Check time budget
    if (Date.now() > deadline) {
      await cleanup();
      return { ok: true, needsMore: true, progress: job, checkpoint };
    }

    // Phase: Policies
    if (!checkpoint.completedPhases.includes("policies")) {
      job.phase = "policies";
      job.currentItem = "Aplicando políticas RLS...";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

      // Enable RLS on all tables (except background_tasks which isn't cloned)
      for (const tableName of TABLES_ORDER) {
        try {
          await targetDb.unsafe(`ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY`);
        } catch {}
      }

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
        if (Date.now() > deadline) {
          await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
          await cleanup();
          return { ok: true, needsMore: true, progress: job, checkpoint };
        }

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
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
      }

      checkpoint.completedPhases.push("policies");
      job.currentItem = "Políticas completadas";
      await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
    }

    // Check time budget
    if (Date.now() > deadline) {
      await cleanup();
      return { ok: true, needsMore: true, progress: job, checkpoint };
    }

    // Phase: Verification
    job.phase = "verification";
    job.currentItem = "Verificando integridad de datos...";
    job.current = 0;
    job.total = TABLES_ORDER.length;
    await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);

    const verificationResults: VerificationResult[] = [];

    for (const tableName of TABLES_ORDER) {
      if (Date.now() > deadline) {
        // Save partial verification and continue later
        job.verification = verificationResults;
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
        await cleanup();
        return { ok: true, needsMore: true, progress: job, checkpoint };
      }

      try {
        const sourceResult = await sourceDb.unsafe(`SELECT COUNT(*) as count FROM public."${tableName}"`);
        const sourceCount = parseInt(sourceResult[0]?.count || '0');

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
        await writeCloneTask(jobId, userId, job, "running", checkpoint, savedOptions, savedTargetUrl);
      } catch {
        job.current++;
      }
    }

    job.verification = verificationResults;
    job.verificationPassed = verificationResults.every(v => v.match);

    // Done! Clear targetUrl for security
    job.phase = "done";
    job.currentItem = "¡Clonación completada!";
    job.current = job.total;
    
    await writeCloneTask(jobId, userId, job, "completed", checkpoint, savedOptions, null);
    await cleanup();

    return { ok: true, needsMore: false, progress: job, checkpoint };

  } catch (err: any) {
    console.error("Step error:", err);
    job.phase = "error";

    let errorMessage = err.message || 'Error durante la clonación';
    
    if (err.code === '28P01') {
      errorMessage = "Error de autenticación: verifica que la contraseña sea correcta.";
    } else if (err.code === '28000') {
      errorMessage = "Conexión rechazada: verifica que la URL sea correcta.";
    } else if (err.code === 'ENOTFOUND' || err.message?.includes('getaddrinfo')) {
      errorMessage = "No se pudo resolver el host.";
    } else if (err.code === 'ECONNREFUSED') {
      errorMessage = "Conexión rechazada.";
    }
    
    job.error = errorMessage;
    job.currentItem = '';
    
    try {
      await writeCloneTask(jobId, userId, job, "failed", checkpoint, savedOptions, savedTargetUrl);
    } catch {}

    await cleanup();
    return { ok: false, needsMore: false, progress: job, checkpoint, error: errorMessage };
  }

  async function cleanup() {
    try { if (sourceDb) await sourceDb.end(); } catch {}
    try { if (targetDb) await targetDb.end(); } catch {}
  }
}
