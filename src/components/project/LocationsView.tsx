/**
 * LocationsView - Adaptive Location Interface
 * Shows full Locations.tsx for Developer Mode
 * Shows simplified LocationsList.tsx for Normal/Pro users
 */

import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import Locations from './Locations';
import LocationsList from './LocationsList';

interface LocationsViewProps {
  projectId: string;
}

export default function LocationsView({ projectId }: LocationsViewProps) {
  const { isDeveloperMode } = useDeveloperMode();

  // Developer Mode: Show full advanced interface with all tabs and options
  if (isDeveloperMode) {
    return <Locations projectId={projectId} />;
  }

  // Normal/Pro users: Show simplified clean interface
  return <LocationsList projectId={projectId} />;
}
