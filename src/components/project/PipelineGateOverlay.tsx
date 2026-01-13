import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PipelineGateOverlayProps {
  message: string;
  action: string;
  onAction: () => void;
}

export function PipelineGateOverlay({ message, action, onAction }: PipelineGateOverlayProps) {
  return (
    <Card className="border-dashed border-2 border-muted-foreground/20 bg-muted/30">
      <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-muted-foreground text-sm max-w-md">
            {message}
          </p>
        </div>
        <Button variant="outline" onClick={onAction}>
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}
