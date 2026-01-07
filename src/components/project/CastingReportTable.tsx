import React, { useMemo, useState } from "react";
import { hydrateCharacters, getBreakdownPayload } from "@/lib/breakdown/hydrate";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Users } from "lucide-react";

type AnyObj = Record<string, any>;

type Row = {
  name: string;
  role: string;
  lines: number;
  rank: number;
  scenes: number;
};

function getDialogueLines(c: AnyObj): number {
  const candidates = [
    c.dialogue_lines,
    c.lines,
    c.dialogueLineCount,
    c.dialogue?.lines,
    c.dialogue?.count,
    c.counts?.dialogue_lines,
    c.counts?.lines,
  ];
  for (const v of candidates) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return 0;
}

function getScenesCount(c: AnyObj): number {
  return c.scenes_count ?? c.scene_count ?? c.scenes?.length ?? 0;
}

function getRole(c: AnyObj): string {
  return c.role ?? c.narrative_weight ?? c.classification ?? c.type ?? "unknown";
}

function getName(c: AnyObj): string {
  return c.name ?? c.character ?? c.id ?? "UNKNOWN";
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
};

interface CastingReportTableProps {
  scriptParsedJson: AnyObj;
}

export function CastingReportTable({ scriptParsedJson }: CastingReportTableProps) {
  const [q, setQ] = useState("");
  const [hideVoices, setHideVoices] = useState(true);
  const [hideFeaturedExtras, setHideFeaturedExtras] = useState(false);

  const { rows, totalLines } = useMemo(() => {
    const payload = getBreakdownPayload(scriptParsedJson) ?? scriptParsedJson;
    const chars = hydrateCharacters(payload) as AnyObj[];

    // Build rows
    let base = chars.map((c) => ({
      name: getName(c),
      role: getRole(c),
      lines: getDialogueLines(c),
      scenes: getScenesCount(c),
      rank: 0,
    }));

    // Calculate total before filtering
    const total = base.reduce((sum, r) => sum + r.lines, 0);

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

    return { rows: base, totalLines: total };
  }, [scriptParsedJson, q, hideVoices, hideFeaturedExtras]);

  const exportCSV = () => {
    const header = "Rank,Personaje,Líneas,%Total,Escenas,Rol\n";
    const csv = rows.map(r => 
      `${r.rank},"${r.name}",${r.lines},${totalLines > 0 ? ((r.lines / totalLines) * 100).toFixed(1) : 0}%,${r.scenes},${r.role}`
    ).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "casting_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold">Casting Report</span>
          <Badge variant="secondary">{rows.length} personajes</Badge>
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
                  <Badge variant="outline" className={ROLE_COLORS[r.role] || ""}>
                    {ROLE_LABELS[r.role] || r.role}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
