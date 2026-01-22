/**
 * LikenessComparisonView - DEPRECATED
 * This component previously used likeness_comparisons table which has been removed.
 * Likeness comparison functionality has been integrated into the QC system.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface LikenessComparisonViewProps {
  slotId: string;
}

export function LikenessComparisonView({ slotId }: LikenessComparisonViewProps) {
  // This component is deprecated - likeness checks are now done via QC system
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
          Likeness Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <p>
            La comparación de parecido ahora se realiza automáticamente 
            a través del sistema de QC integrado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
