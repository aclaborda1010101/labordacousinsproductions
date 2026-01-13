import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GitBranch, Layers } from 'lucide-react';

interface Thread {
  id: string;
  type: string;
  question: string;
  engine: string;
  stake: string;
  milestones?: string[];
  end_state?: string;
}

interface EpisodeBeat {
  episode: number;
  title?: string;
  thread_usage?: {
    A: string;
    B?: string;
    C?: string;
    crossover_event: string;
  };
}

interface ThreadsDisplayProps {
  threads: Thread[];
  episodeBeats?: EpisodeBeat[];
  compact?: boolean;
}

const THREAD_TYPE_COLORS: Record<string, string> = {
  main: 'bg-primary text-primary-foreground',
  subplot: 'bg-secondary text-secondary-foreground',
  relationship: 'bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30',
  ethical: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
  mystery: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  procedural: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  myth: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  entity: 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30',
};

const THREAD_TYPE_LABELS: Record<string, string> = {
  main: 'Principal',
  subplot: 'Secundaria',
  relationship: 'Relaciones',
  ethical: 'Dilema Moral',
  mystery: 'Misterio',
  procedural: 'Procedural',
  myth: 'Lore/Mito',
  entity: 'Entidad',
};

export default function ThreadsDisplay({ threads, episodeBeats, compact = false }: ThreadsDisplayProps) {
  if (!threads?.length) return null;

  return (
    <div className="space-y-4">
      {/* Threads Catalog */}
      <Card className="border-indigo-500/30 bg-indigo-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-500" />
            Tramas Narrativas ({threads.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {threads.map((thread, i) => (
            <div 
              key={thread.id || i} 
              className="p-3 bg-muted/30 rounded-lg border border-muted"
            >
              <div className="flex items-start gap-2 mb-2">
                <Badge 
                  variant="outline" 
                  className={`text-xs ${THREAD_TYPE_COLORS[thread.type] || 'bg-muted'}`}
                >
                  {THREAD_TYPE_LABELS[thread.type] || thread.type}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">{thread.id}</span>
              </div>
              
              {/* Question */}
              <p className="font-medium text-sm mb-1">{thread.question}</p>
              
              {/* Engine & Stake */}
              {!compact && (
                <div className="grid md:grid-cols-2 gap-2 mt-2 text-xs">
                  <div className="p-2 bg-background/50 rounded">
                    <span className="text-muted-foreground">Motor:</span>
                    <p className="mt-0.5">{thread.engine}</p>
                  </div>
                  <div className="p-2 bg-background/50 rounded">
                    <span className="text-muted-foreground">Stakes:</span>
                    <p className="mt-0.5">{thread.stake}</p>
                  </div>
                </div>
              )}
              
              {/* Milestones */}
              {!compact && thread.milestones && thread.milestones.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">Hitos:</span>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {thread.milestones.slice(0, 4).map((m, j) => (
                      <li key={j} className="flex items-start gap-1">
                        <span className="text-indigo-500">•</span>
                        <span>{m}</span>
                      </li>
                    ))}
                    {thread.milestones.length > 4 && (
                      <li className="text-indigo-500 italic">
                        +{thread.milestones.length - 4} más
                      </li>
                    )}
                  </ul>
                </div>
              )}
              
              {/* End State */}
              {!compact && thread.end_state && (
                <div className="mt-2 pt-2 border-t text-xs">
                  <span className="text-muted-foreground">Resolución:</span>
                  <p className="mt-0.5 italic">{thread.end_state}</p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Thread Usage per Episode */}
      {episodeBeats && episodeBeats.some(ep => ep.thread_usage) && (
        <Card className="border-indigo-500/30 bg-indigo-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              Uso de Tramas por Episodio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Ep</TableHead>
                    <TableHead>A (principal)</TableHead>
                    <TableHead>B</TableHead>
                    <TableHead>C</TableHead>
                    <TableHead className="min-w-[200px]">Cruce de Tramas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {episodeBeats.map((ep) => {
                    const tu = ep.thread_usage;
                    if (!tu) return null;
                    
                    return (
                      <TableRow key={ep.episode}>
                        <TableCell className="font-medium">{ep.episode}</TableCell>
                        <TableCell>
                          <Badge variant="default" className="text-xs">
                            {tu.A || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tu.B ? (
                            <Badge variant="secondary" className="text-xs">{tu.B}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tu.C ? (
                            <Badge variant="outline" className="text-xs">{tu.C}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[250px]">
                          {tu.crossover_event || <span className="italic text-amber-500">Sin cruce definido</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
