import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  History, 
  RotateCcw, 
  Eye,
  GitCompare,
  Clock,
  User,
  ChevronRight,
  Plus,
  Minus,
  FileText,
  Film
} from 'lucide-react';

interface Version {
  id: string;
  entity_type: string;
  entity_id: string;
  version_number: number;
  data: Record<string, any>;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

interface VersionHistoryProps {
  projectId: string;
  entityType: 'script' | 'scene';
  entityId: string;
  currentData: Record<string, any>;
  onRollback?: () => void;
}

export default function VersionHistory({ 
  projectId, 
  entityType, 
  entityId, 
  currentData,
  onRollback 
}: VersionHistoryProps) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [compareVersion, setCompareVersion] = useState<Version | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    fetchVersions();
  }, [entityId]);

  async function fetchVersions() {
    const { data, error } = await supabase
      .from('entity_versions')
      .select('*')
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('Error fetching versions:', error);
      return;
    }

    setVersions((data || []) as Version[]);
    setLoading(false);
  }

  async function saveVersion(summary?: string) {
    const nextVersion = versions.length > 0 ? versions[0].version_number + 1 : 1;
    
    const { error } = await supabase
      .from('entity_versions')
      .insert({
        project_id: projectId,
        entity_type: entityType,
        entity_id: entityId,
        version_number: nextVersion,
        data: currentData,
        change_summary: summary || `Version ${nextVersion}`,
        created_by: user?.id
      });

    if (error) {
      console.error('Error saving version:', error);
      toast.error('Failed to save version');
      return;
    }

    toast.success('Version saved');
    fetchVersions();
  }

  async function rollbackToVersion(version: Version) {
    setRolling(true);
    
    const table = entityType === 'script' ? 'scripts' : 'scenes';
    const { error } = await supabase
      .from(table)
      .update(version.data)
      .eq('id', entityId);

    if (error) {
      console.error('Error rolling back:', error);
      toast.error('Failed to rollback');
      setRolling(false);
      return;
    }

    // Save current as a new version before rollback
    await saveVersion(`Rollback to version ${version.version_number}`);
    
    toast.success(`Rolled back to version ${version.version_number}`);
    setRolling(false);
    setSelectedVersion(null);
    onRollback?.();
  }

  function getDiff(oldData: Record<string, any>, newData: Record<string, any>) {
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    const changes: Array<{ key: string; type: 'added' | 'removed' | 'changed'; old?: any; new?: any }> = [];

    allKeys.forEach(key => {
      const oldVal = JSON.stringify(oldData[key]);
      const newVal = JSON.stringify(newData[key]);

      if (!(key in oldData)) {
        changes.push({ key, type: 'added', new: newData[key] });
      } else if (!(key in newData)) {
        changes.push({ key, type: 'removed', old: oldData[key] });
      } else if (oldVal !== newVal) {
        changes.push({ key, type: 'changed', old: oldData[key], new: newData[key] });
      }
    });

    return changes;
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-muted rounded w-32" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium text-foreground">Version History</h3>
          <Badge variant="outline">{versions.length} versions</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => saveVersion()}>
          <Plus className="w-4 h-4 mr-1" />
          Save Version
        </Button>
      </div>

      {versions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <History className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No versions saved yet</p>
            <Button variant="gold" size="sm" className="mt-3" onClick={() => saveVersion('Initial version')}>
              Save Initial Version
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[300px]">
          <div className="space-y-2 pr-4">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className="p-3 rounded-lg border border-border bg-card hover:bg-accent/5 transition-colors cursor-pointer"
                onClick={() => setSelectedVersion(version)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      {entityType === 'script' ? (
                        <FileText className="w-4 h-4 text-primary" />
                      ) : (
                        <Film className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        Version {version.version_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {version.change_summary || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(version.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                {index < versions.length - 1 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedVersion(version);
                        setCompareVersion(versions[index + 1]);
                        setShowDiff(true);
                      }}
                    >
                      <GitCompare className="w-3 h-3 mr-1" />
                      Compare with v{versions[index + 1].version_number}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Version detail dialog */}
      <Dialog open={!!selectedVersion && !showDiff} onOpenChange={() => setSelectedVersion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version {selectedVersion?.version_number}</DialogTitle>
            <DialogDescription>
              {selectedVersion?.change_summary || 'No description'} • {selectedVersion && new Date(selectedVersion.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ScrollArea className="h-[300px] rounded-lg border border-border bg-muted/30 p-4">
              <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                {JSON.stringify(selectedVersion?.data, null, 2)}
              </pre>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedVersion(null)}>
              Close
            </Button>
            <Button 
              variant="gold" 
              onClick={() => selectedVersion && rollbackToVersion(selectedVersion)}
              disabled={rolling}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {rolling ? 'Rolling back...' : 'Rollback to this version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff comparison dialog */}
      <Dialog open={showDiff} onOpenChange={() => { setShowDiff(false); setCompareVersion(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="w-5 h-5" />
              Comparing Versions
            </DialogTitle>
            <DialogDescription>
              v{compareVersion?.version_number} → v{selectedVersion?.version_number}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ScrollArea className="h-[400px]">
              {selectedVersion && compareVersion && (
                <div className="space-y-2">
                  {getDiff(compareVersion.data, selectedVersion.data).map((change, i) => (
                    <div 
                      key={i} 
                      className={`p-3 rounded-lg border ${
                        change.type === 'added' 
                          ? 'bg-qc-pass/10 border-qc-pass/30' 
                          : change.type === 'removed'
                            ? 'bg-destructive/10 border-destructive/30'
                            : 'bg-warning/10 border-warning/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {change.type === 'added' ? (
                          <Plus className="w-4 h-4 text-qc-pass" />
                        ) : change.type === 'removed' ? (
                          <Minus className="w-4 h-4 text-destructive" />
                        ) : (
                          <GitCompare className="w-4 h-4 text-warning" />
                        )}
                        <span className="font-medium text-sm">{change.key}</span>
                        <Badge variant="outline" className="text-xs">
                          {change.type}
                        </Badge>
                      </div>
                      <div className="text-xs font-mono">
                        {change.type === 'changed' && (
                          <>
                            <div className="text-destructive line-through">
                              - {JSON.stringify(change.old)}
                            </div>
                            <div className="text-qc-pass">
                              + {JSON.stringify(change.new)}
                            </div>
                          </>
                        )}
                        {change.type === 'added' && (
                          <div className="text-qc-pass">+ {JSON.stringify(change.new)}</div>
                        )}
                        {change.type === 'removed' && (
                          <div className="text-destructive">- {JSON.stringify(change.old)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {getDiff(compareVersion.data, selectedVersion.data).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No differences found
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDiff(false); setCompareVersion(null); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
