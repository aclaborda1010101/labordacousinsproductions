/**
 * CharacterNarrativeEditor - DEPRECATED
 * This component previously used character_narrative table which has been removed.
 * Narrative data should now be stored in the characters.profile_json field.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Book } from 'lucide-react';

interface CharacterNarrativeEditorProps {
  characterId: string;
  characterName: string;
  projectId: string;
  otherCharacters?: Array<{ id: string; name: string }>;
}

export function CharacterNarrativeEditor({
  characterId,
  characterName,
  projectId,
  otherCharacters = [],
}: CharacterNarrativeEditorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Book className="h-5 w-5 text-primary" />
          Narrativa - {characterName}
        </CardTitle>
        <CardDescription>
          Sistema de narrativa en actualización
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <p>
            El editor de narrativa está siendo migrado. Los datos de narrativa 
            ahora se almacenan directamente en el perfil del personaje.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
