import { Lock } from 'lucide-react';

interface ScenesProps { projectId: string; }

export default function Scenes({ projectId }: ScenesProps) {
  return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Scenes & Shots</h3>
        <p className="text-muted-foreground max-w-md">Scene management with shot planning, quality modes, and keyframe generation coming in the next iteration.</p>
      </div>
    </div>
  );
}
