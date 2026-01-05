/**
 * LocationsView - Adaptive Location Interface by Creative Mode
 * ASSISTED: Simplified LocationsList
 * PRO: Full Locations.tsx with advanced tabs
 */

import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import Locations from './Locations';
import LocationsList from './LocationsList';

interface LocationsViewProps {
  projectId: string;
}

export default function LocationsView({ projectId }: LocationsViewProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const creativeModeContext = useCreativeModeOptional();
  const effectiveMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';

  // Developer Mode or PRO: Show full advanced interface
  if (isDeveloperMode || effectiveMode === 'PRO') {
    return <Locations projectId={projectId} />;
  }

  // ASSISTED mode: Show simplified clean interface
  return <LocationsList projectId={projectId} />;
}
