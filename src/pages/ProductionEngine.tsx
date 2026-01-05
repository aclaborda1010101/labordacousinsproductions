/**
 * ProductionEngine Page - Cinematic Production Engine view
 */

import { useParams } from 'react-router-dom';
import { CinematicProductionEngine } from '@/components/cpe';

export default function ProductionEngine() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">No project selected</p>
      </div>
    );
  }

  return <CinematicProductionEngine projectId={projectId} />;
}
