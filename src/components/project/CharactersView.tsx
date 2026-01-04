/**
 * CharactersView - Adaptive Character Interface
 * Shows full Characters.tsx for Developer Mode
 * Shows simplified CharactersList.tsx for Normal/Pro users
 */

import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import Characters from './Characters';
import CharactersList from './CharactersList';

interface CharactersViewProps {
  projectId: string;
}

export default function CharactersView({ projectId }: CharactersViewProps) {
  const { isDeveloperMode } = useDeveloperMode();

  // Developer Mode: Show full advanced interface with all tabs and options
  if (isDeveloperMode) {
    return <Characters projectId={projectId} />;
  }

  // Normal/Pro users: Show simplified clean interface
  return <CharactersList projectId={projectId} />;
}
