import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface LikenessComparisonViewProps {
  slotId: string;
}

interface LikenessComparison {
  id: string;
  overall_likeness_score: number;
  scores: {
    face_structure: number;
    eye_match: number;
    nose_match: number;
    mouth_match: number;
    skin_tone_match: number;
    hair_match: number;
    overall_proportion: number;
  };
  issues: Array<{
    feature: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
  }>;
  passes_threshold: boolean;
  ai_analysis: string | null;
  reference_anchor: {
    image_url: string;
    anchor_type: string;
  } | null;
  generated_slot: {
    image_url: string | null;
  } | null;
}

export function LikenessComparisonView({ slotId }: LikenessComparisonViewProps) {
  const [comparison, setComparison] = useState<LikenessComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComparison();
  }, [slotId]);

  const loadComparison = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('likeness_comparisons')
        .select(`
          *,
          reference_anchors:reference_anchor_id (
            image_url,
            anchor_type
          ),
          character_pack_slots:generated_slot_id (
            image_url
          )
        `)
        .eq('generated_slot_id', slotId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setComparison({
          ...data,
          scores: data.scores as LikenessComparison['scores'],
          issues: data.issues as LikenessComparison['issues'],
          reference_anchor: data.reference_anchors as LikenessComparison['reference_anchor'],
          generated_slot: data.character_pack_slots as LikenessComparison['generated_slot']
        });
      }
    } catch (err) {
      console.error('Error loading comparison:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!comparison) return null;

  const score = comparison.overall_likeness_score || 0;
  const passed = comparison.passes_threshold;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            {passed ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            Likeness Comparison
          </span>
          <Badge variant={passed ? "default" : "destructive"}>
            {Math.round(score)}/100 {passed ? 'PASS' : 'FAIL'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Images side by side */}
        {comparison.reference_anchor && comparison.generated_slot?.image_url && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Reference</p>
              <img
                src={comparison.reference_anchor.image_url}
                alt="Reference"
                className="w-full h-24 object-cover rounded border"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Generated</p>
              <img
                src={comparison.generated_slot.image_url}
                alt="Generated"
                className="w-full h-24 object-cover rounded border"
              />
            </div>
          </div>
        )}

        {/* Detailed scores */}
        {comparison.scores && (
          <div className="space-y-2">
            <ScoreBar label="Face Structure" score={comparison.scores.face_structure} />
            <ScoreBar label="Eyes" score={comparison.scores.eye_match} />
            <ScoreBar label="Nose" score={comparison.scores.nose_match} />
            <ScoreBar label="Mouth" score={comparison.scores.mouth_match} />
            <ScoreBar label="Skin Tone" score={comparison.scores.skin_tone_match} />
            <ScoreBar label="Hair" score={comparison.scores.hair_match} />
          </div>
        )}

        {/* Issues */}
        {comparison.issues && comparison.issues.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Issues:</p>
            <div className="space-y-1">
              {comparison.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Badge
                    variant={issue.severity === 'high' ? 'destructive' : 'secondary'}
                    className="text-[10px] px-1"
                  >
                    {issue.severity}
                  </Badge>
                  <span>{issue.feature}: {issue.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Analysis */}
        {comparison.ai_analysis && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Analysis:</p>
            <p className="text-xs text-muted-foreground">{comparison.ai_analysis}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span>{Math.round(score)}/100</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(score)} transition-all`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
