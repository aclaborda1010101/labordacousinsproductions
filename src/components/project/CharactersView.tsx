/**
 * CharactersView - Adaptive Character Interface by Creative Mode
 * ASSISTED: Simplified CharactersList
 * PRO: Full Characters.tsx with advanced tabs
 */

import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import Characters from './Characters';
import CharactersList from './CharactersList';

interface CharactersViewProps {
  projectId: string;
}

export default function CharactersView({ projectId }: CharactersViewProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const creativeModeContext = useCreativeModeOptional();
  const effectiveMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';

  // Developer Mode or PRO: Show full advanced interface
  if (isDeveloperMode || effectiveMode === 'PRO') {
    return <Characters projectId={projectId} />;
  }

  // ASSISTED mode: Show simplified clean interface
  return <CharactersList projectId={projectId} />;
}
