import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Wrench,
  Play
} from 'lucide-react';

interface QCBlocker {
  type: string;
  severity: 'blocker' | 'warning';
  message: string;
  entity_id?: string;
  entity_type?: string;
  entity_name?: string;
  fix_action: string;
  auto_fixable: boolean;
}

interface ValidationResult {
  success: boolean;
  canRender: boolean;
  checks: {
    required_refs_present: boolean;
    audio_layers_valid: boolean;
    timestamps_present: boolean;
    continuity_locks_valid: boolean;
    keyframes_complete: boolean;
  };
  blockers: QCBlocker[];
  warnings: QCBlocker[];
  summary: {
    total_blockers: number;
    total_warnings: number;
    auto_fixable_blockers: number;
  };
}

interface PreRenderValidationProps {
  projectId: string;
  shotId: string;
  onValidationComplete?: (canRender: boolean) => void;
  onRenderStart?: () => void;
}

export default function PreRenderValidation({
  projectId,
  shotId,
  onValidationComplete,
  onRenderStart
}: PreRenderValidationProps) {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const runValidation = async () => {
    setValidating(true);
    try {
      const response = await supabase.functions.invoke('pre-render-qc-gate', {
        body: { projectId, shotId }
      });

      if (response.error) throw response.error;

      const data = response.data as ValidationResult;
      setResult(data);
      onValidationComplete?.(data.canRender);

      if (data.canRender) {
        toast.success('Validation passed! Ready to render');
      } else {
        toast.error(`${data.summary.total_blockers} blocker(s) found`);
        setShowDetails(true);
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast.error('Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRender = async () => {
    if (!result) {
      await runValidation();
      return;
    }

    if (result.canRender) {
      onRenderStart?.();
    } else {
      setShowDetails(true);
    }
  };

  const CheckIcon = ({ passed }: { passed: boolean }) => (
    passed 
      ? <CheckCircle2 className="w-4 h-4 text-qc-pass" />
      : <XCircle className="w-4 h-4 text-destructive" />
  );

  return (
    <>
      <div className="space-y-3">
        {/* Validation Status Summary */}
        {result && (
          <div className={`p-3 rounded-lg border ${
            result.canRender 
              ? 'bg-qc-pass/10 border-qc-pass/30' 
              : 'bg-destructive/10 border-destructive/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.canRender ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-qc-pass" />
                    <span className="font-medium text-qc-pass">Ready to Render</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-destructive" />
                    <span className="font-medium text-destructive">
                      {result.summary.total_blockers} Blocker{result.summary.total_blockers !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDetails(true)}
              >
                View Details
              </Button>
            </div>

            {/* Quick check status */}
            <div className="grid grid-cols-5 gap-2 mt-3">
              <div className="flex flex-col items-center text-xs">
                <CheckIcon passed={result.checks.required_refs_present} />
                <span className="mt-1 text-muted-foreground">Refs</span>
              </div>
              <div className="flex flex-col items-center text-xs">
                <CheckIcon passed={result.checks.audio_layers_valid} />
                <span className="mt-1 text-muted-foreground">Audio</span>
              </div>
              <div className="flex flex-col items-center text-xs">
                <CheckIcon passed={result.checks.timestamps_present} />
                <span className="mt-1 text-muted-foreground">Timing</span>
              </div>
              <div className="flex flex-col items-center text-xs">
                <CheckIcon passed={result.checks.continuity_locks_valid} />
                <span className="mt-1 text-muted-foreground">Continuity</span>
              </div>
              <div className="flex flex-col items-center text-xs">
                <CheckIcon passed={result.checks.keyframes_complete} />
                <span className="mt-1 text-muted-foreground">Keyframes</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={runValidation}
            disabled={validating}
            className="flex-1"
          >
            {validating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Shield className="w-4 h-4 mr-2" />
            )}
            {validating ? 'Validating...' : 'Validate'}
          </Button>
          <Button
            onClick={handleRender}
            disabled={validating}
            className="flex-1"
          >
            <Play className="w-4 h-4 mr-2" />
            Render Shot
          </Button>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Pre-Render QC Report
            </DialogTitle>
          </DialogHeader>

          {result && (
            <div className="space-y-4">
              {/* Blockers */}
              {result.blockers.length > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                      <XCircle className="w-4 h-4" />
                      Blockers ({result.blockers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.blockers.map((blocker, i) => (
                      <div key={i} className="p-3 bg-destructive/10 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <Badge variant="destructive" className="text-xs mb-1">
                              {blocker.type}
                            </Badge>
                            <p className="text-sm font-medium">{blocker.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Fix: {blocker.fix_action}
                            </p>
                          </div>
                          {blocker.auto_fixable && (
                            <Button size="sm" variant="outline" className="shrink-0">
                              <Wrench className="w-3 h-3 mr-1" />
                              Auto-Fix
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <Card className="border-amber-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="w-4 h-4" />
                      Warnings ({result.warnings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.warnings.map((warning, i) => (
                      <div key={i} className="p-3 bg-amber-500/10 rounded-lg">
                        <Badge variant="outline" className="text-xs mb-1 border-amber-500 text-amber-500">
                          {warning.type}
                        </Badge>
                        <p className="text-sm">{warning.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Suggestion: {warning.fix_action}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* All Passed */}
              {result.canRender && result.blockers.length === 0 && (
                <div className="text-center p-6 bg-qc-pass/10 rounded-lg">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-qc-pass mb-3" />
                  <p className="font-medium text-qc-pass">All Checks Passed</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This shot is ready for rendering
                  </p>
                </div>
              )}

              {/* Checks Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Validation Checks</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { key: 'required_refs_present', label: 'Required References' },
                      { key: 'audio_layers_valid', label: 'Audio Layers (2+ ambience, 2+ foley, room tone)' },
                      { key: 'timestamps_present', label: 'Blocking Timestamps' },
                      { key: 'continuity_locks_valid', label: 'Continuity Locks' },
                      { key: 'keyframes_complete', label: 'Keyframes' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <span className="text-sm">{label}</span>
                        <CheckIcon passed={result.checks[key as keyof typeof result.checks]} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
