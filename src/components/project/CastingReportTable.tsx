import React, { useMemo, useState } from "react";
import { hydrateCharacters, hydrateScenes, getBreakdownPayload } from "@/lib/breakdown/hydrate";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Users, Info, AlertTriangle, FileText, Film } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type AnyObj = Record<string, any>;

type Row = {
  name: string;
  role: string;
  lines: number;
  rank: number;
  scenes: number;
  confidence: "high" | "medium" | "low";
  reason: string;
};

type ScriptCompleteness = "full_screenplay" | "outline" | "empty";

function getDialogueLines(c: AnyObj): number {
  const candidates = [
    c.dialogue_lines,
    c.dialogueLineCount,
    c.dialogue_line_count,
    c.lines,
    c.dialogue?.lines,
    c.dialogue?.count,
    c.dialogue?.line_count,
    c.counts?.dialogue_lines,
    c.counts?.lines,
    // Also check nested objects
    c.metrics?.dialogue_lines,
    c.stats?.dialogue_lines,
    c.dialogue_words ? Math.ceil(c.dialogue_words / 10) : null,
  ];
  for (const v of candidates) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function getScenesCount(c: AnyObj): number {
  return c.scenes_count ?? c.scene_count ?? c.scenes?.length ?? c.scene_ids?.length ?? 0;
}

function getRole(c: AnyObj): string {
  return c.role ?? c.narrative_weight ?? c.classification ?? c.type ?? "unknown";
}

function getName(c: AnyObj): string {
  return c.name ?? c.character ?? c.id ?? "UNKNOWN";
}

function getConfidence(c: AnyObj): { level: "high" | "medium" | "low"; reason: string } {
  const hasDialogue = getDialogueLines(c) > 0;
  const hasScenes = getScenesCount(c) > 0;
  const hasSlugline = !!c.detected_in_slugline || !!c.in_slugline;
  const hasDialogueBlock = !!c.has_dialogue_block || hasDialogue;
  
  if (hasDialogueBlock && hasScenes) {
    return { level: "high", reason: `Diálogo: ${getDialogueLines(c)} líneas, ${getScenesCount(c)} escenas` };
  }
  if (hasDialogue || hasSlugline) {
    return { level: "medium", reason: hasDialogue ? "Detectado en diálogo" : "Detectado en acción" };
  }
  return { level: "low", reason: "Inferido del outline" };
}

// Determine script completeness based on content quality
function analyzeScriptCompleteness(payload: AnyObj): { level: ScriptCompleteness; details: string } {
  const scenes = hydrateScenes(payload);
  const chars = hydrateCharacters(payload);
  
  if (scenes.length === 0) {
    return { level: "empty", details: "Sin escenas detectadas" };
  }
  
  // Check for real sluglines (not placeholders)
  const realSluglines = scenes.filter((sc: any) => {
    const slugline = sc.slugline || "";
    const isPlaceholder = 
      slugline === "INT Escena -" || 
      slugline === "EXT Escena -" ||
      slugline.match(/^(INT|EXT)\s+Escena\s*-?\s*$/i) ||
      slugline.match(/^(INT|EXT)\.\s+UBICACIÓN/i) ||
      !slugline.includes(" - ") ||
      slugline.length < 10;
    return !isPlaceholder;
  });
  
  // Check for dialogue data
  const charsWithDialogue = chars.filter((c: any) => getDialogueLines(c) > 0);
  const totalDialogueLines = chars.reduce((sum: number, c: any) => sum + getDialogueLines(c), 0);
  
  // Full screenplay: most sluglines are real AND has significant dialogue
  const sluglineRatio = scenes.length > 0 ? realSluglines.length / scenes.length : 0;
  const hasSignificantDialogue = totalDialogueLines > 50;
  
  if (sluglineRatio > 0.7 && hasSignificantDialogue) {
    return { 
      level: "full_screenplay", 
      details: `${realSluglines.length}/${scenes.length} sluglines completos, ${totalDialogueLines} líneas de diálogo` 
    };
  }
  
  return { 
    level: "outline", 
    details: `${realSluglines.length}/${scenes.length} sluglines completos, ${charsWithDialogue.length} personajes con diálogo` 
  };
}

const ROLE_COLORS: Record<string, string> = {
  protagonist: "bg-amber-500/20 text-amber-700 border-amber-500/30",
  "co-protagonist": "bg-amber-400/20 text-amber-600 border-amber-400/30",
  major_supporting: "bg-blue-500/20 text-blue-700 border-blue-500/30",
  supporting: "bg-sky-500/20 text-sky-700 border-sky-500/30",
  minor_speaking: "bg-slate-500/20 text-slate-700 border-slate-500/30",
  featured_extra: "bg-gray-400/20 text-gray-600 border-gray-400/30",
  voice: "bg-purple-500/20 text-purple-700 border-purple-500/30",
  functional: "bg-purple-400/20 text-purple-600 border-purple-400/30",
  unknown: "bg-gray-300/20 text-gray-500 border-gray-300/30",
};

const ROLE_LABELS: Record<string, string> = {
  protagonist: "Protagonista",
  "co-protagonist": "Co-Protagonista",
  major_supporting: "Secundario Principal",
  supporting: "Secundario",
  minor_speaking: "Menor con Diálogo",
  featured_extra: "Extra Destacado",
  voice: "Voz",
  functional: "Funcional",
  unknown: "Desconocido",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-red-500",
};

interface CastingReportTableProps {
  scriptParsedJson: AnyObj;
}

export function CastingReportTable({ scriptParsedJson }: CastingReportTableProps) {
  const [q, setQ] = useState("");
  const [hideVoices, setHideVoices] = useState(true);
  const [hideFeaturedExtras, setHideFeaturedExtras] = useState(false);

  const { rows, totalLines, totalChars, filteredCount } = useMemo(() => {
    const payload = getBreakdownPayload(scriptParsedJson) ?? scriptParsedJson;
    const chars = hydrateCharacters(payload) as AnyObj[];

    // Build rows with confidence
    let base = chars.map((c) => {
      const conf = getConfidence(c);
      return {
        name: getName(c),
        role: getRole(c),
        lines: getDialogueLines(c),
        scenes: getScenesCount(c),
        rank: 0,
        confidence: conf.level,
        reason: conf.reason,
      };
    });

    // Calculate total before filtering
    const total = base.reduce((sum, r) => sum + r.lines, 0);
    const allChars = base.length;

    // Filters
    if (hideVoices) {
      base = base.filter((r) => r.role !== "voice" && r.role !== "voices_and_functional" && r.role !== "functional");
    }
    if (hideFeaturedExtras) {
      base = base.filter((r) => r.role !== "featured_extra" && r.role !== "featured_extras_with_lines");
    }

    // Search
    const qq = q.trim().toLowerCase();
    if (qq) base = base.filter((r) => r.name.toLowerCase().includes(qq));

    // Sort by lines desc, then name
    base.sort((a, b) => (b.lines - a.lines) || a.name.localeCompare(b.name));

    // Assign ranks
    base.forEach((r, idx) => (r.rank = idx + 1));

    return { rows: base, totalLines: total, totalChars: allChars, filteredCount: base.length };
  }, [scriptParsedJson, q, hideVoices, hideFeaturedExtras]);

  const exportCSV = () => {
    const header = "Rank,Personaje,Líneas,%Total,Escenas,Rol,Confianza\n";
    const csv = rows.map(r => 
      `${r.rank},"${r.name}",${r.lines},${totalLines > 0 ? ((r.lines / totalLines) * 100).toFixed(1) : 0}%,${r.scenes},${r.role},${r.confidence}`
    ).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "casting_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Analyze script completeness
  const completeness = useMemo(() => {
    const payload = getBreakdownPayload(scriptParsedJson) ?? scriptParsedJson;
    return analyzeScriptCompleteness(payload);
  }, [scriptParsedJson]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Script Completeness Alert */}
        {completeness.level === "outline" && (
          <Alert variant="default" className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200 flex items-center gap-2">
              Análisis basado en Outline
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-300">
                <FileText className="w-3 h-3 mr-1" />
                Outline
              </Badge>
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300 space-y-3">
              <p className="text-sm">
                <strong>¿Por qué ves estimaciones?</strong> Tu guion actual contiene descripciones generales 
                de escenas (outline), pero no tiene los diálogos escritos línea por línea.
              </p>
              <div>
                <p className="text-sm font-medium mb-1">¿Qué significan los datos?</p>
                <ul className="list-disc list-inside text-xs space-y-0.5 ml-1 text-amber-600 dark:text-amber-400">
                  <li><strong>Líneas = 0:</strong> El personaje aparece pero no tiene diálogos escritos</li>
                  <li><strong>% = 0%:</strong> Sin diálogos, no hay peso calculable</li>
                  <li><strong>Escenas:</strong> Este dato SÍ es preciso (detectado del outline)</li>
                  <li><strong>Rol:</strong> Estimado por frecuencia, puede cambiar con diálogos reales</li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Para obtener datos precisos:</p>
                <ol className="list-decimal list-inside text-xs space-y-0.5 ml-1 text-amber-600 dark:text-amber-400">
                  <li>Ve a la pestaña <strong>"Guion"</strong> de tu proyecto</li>
                  <li>Pulsa <strong>"Generar Screenplay"</strong> para crear los diálogos completos</li>
                  <li>Vuelve aquí para ver el Casting Report actualizado</li>
                </ol>
              </div>
              <div className="text-xs pt-2 border-t border-amber-300/50 text-amber-600/70 dark:text-amber-400/70">
                Detección: {completeness.details}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {completeness.level === "full_screenplay" && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Film className="w-4 h-4" />
            <span>Guion completo detectado</span>
            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300">
              Screenplay
            </Badge>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-muted-foreground" />
            <span className="font-semibold">Casting Report</span>
            <Badge variant="secondary">
              {filteredCount === totalChars 
                ? `${totalChars} personajes` 
                : `${filteredCount} de ${totalChars} personajes`}
            </Badge>
            {totalLines > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                {totalLines} líneas totales
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" />
            CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar personaje…"
            className="max-w-xs"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="hide-voices"
              checked={hideVoices}
              onCheckedChange={(v) => setHideVoices(!!v)}
            />
            <Label htmlFor="hide-voices" className="text-sm cursor-pointer">Ocultar voces</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="hide-extras"
              checked={hideFeaturedExtras}
              onCheckedChange={(v) => setHideFeaturedExtras(!!v)}
            />
            <Label htmlFor="hide-extras" className="text-sm cursor-pointer">Ocultar extras</Label>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-16 text-center">#</TableHead>
                <TableHead>Personaje</TableHead>
                <TableHead className="w-24 text-center">Líneas</TableHead>
                <TableHead className="w-20 text-center">%</TableHead>
                <TableHead className="w-24 text-center">Escenas</TableHead>
                <TableHead className="w-40">Rol</TableHead>
                <TableHead className="w-16 text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center justify-center gap-1 cursor-help">
                        <Info className="w-3 h-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Confianza de detección</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="text-center font-mono text-muted-foreground">{r.rank}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-center font-mono">{r.lines}</TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {totalLines > 0 ? ((r.lines / totalLines) * 100).toFixed(1) : 0}%
                  </TableCell>
                  <TableCell className="text-center font-mono">{r.scenes}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ROLE_COLORS[r.role] || ROLE_COLORS.unknown}>
                      {ROLE_LABELS[r.role] || r.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${CONFIDENCE_COLORS[r.confidence]}`} />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{r.reason}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No hay resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Alto (diálogo verificado)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" /> Medio (en acción/diálogo)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Bajo (inferido)
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
