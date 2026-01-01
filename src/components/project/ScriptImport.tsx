import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { 
  FileText, 
  Wand2, 
  Loader2,
  CheckCircle,
  Film,
  Users,
  MapPin,
  AlertCircle,
  Link2
} from 'lucide-react';

interface ParsedScene {
  slugline: string;
  summary: string;
  characters: string[];
  location: string;
  time_of_day: string;
  dialogue_count: number;
}

interface Character {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface ScriptImportProps {
  projectId: string;
  onScenesCreated?: () => void;
}

export default function ScriptImport({ projectId, onScenesCreated }: ScriptImportProps) {
  const [scriptText, setScriptText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedScenes, setParsedScenes] = useState<ParsedScene[]>([]);
  const [importing, setImporting] = useState(false);
  const [existingCharacters, setExistingCharacters] = useState<Character[]>([]);
  const [existingLocations, setExistingLocations] = useState<Location[]>([]);
  const [linkedCharacters, setLinkedCharacters] = useState<Record<number, string[]>>({});
  const [linkedLocations, setLinkedLocations] = useState<Record<number, string | null>>({});

  // Fetch existing characters and locations
  useEffect(() => {
    const fetchData = async () => {
      const [charsRes, locsRes] = await Promise.all([
        supabase.from('characters').select('id, name').eq('project_id', projectId),
        supabase.from('locations').select('id, name').eq('project_id', projectId)
      ]);
      if (charsRes.data) setExistingCharacters(charsRes.data);
      if (locsRes.data) setExistingLocations(locsRes.data);
    };
    fetchData();
  }, [projectId]);

  // Auto-link characters and locations when scenes are parsed
  useEffect(() => {
    if (parsedScenes.length === 0) return;

    const newLinkedChars: Record<number, string[]> = {};
    const newLinkedLocs: Record<number, string | null> = {};

    parsedScenes.forEach((scene, index) => {
      // Match characters by name (case-insensitive)
      const matchedCharIds: string[] = [];
      scene.characters.forEach(charName => {
        const match = existingCharacters.find(
          c => c.name.toLowerCase() === charName.toLowerCase()
        );
        if (match) matchedCharIds.push(match.id);
      });
      newLinkedChars[index] = matchedCharIds;

      // Match location by name (fuzzy match)
      const locMatch = existingLocations.find(
        l => l.name.toLowerCase().includes(scene.location.toLowerCase()) ||
             scene.location.toLowerCase().includes(l.name.toLowerCase())
      );
      newLinkedLocs[index] = locMatch?.id || null;
    });

    setLinkedCharacters(newLinkedChars);
    setLinkedLocations(newLinkedLocs);
  }, [parsedScenes, existingCharacters, existingLocations]);

  async function parseScript() {
    if (!scriptText.trim()) {
      toast.error('Please paste your screenplay text');
      return;
    }

    setParsing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('parse-script', {
        body: { scriptText, projectId }
      });

      if (error) {
        console.error('Error parsing script:', error);
        if (error.message?.includes('429')) {
          toast.error('Rate limit reached. Please try again in a moment.');
        } else if (error.message?.includes('402')) {
          toast.error('Usage limit reached. Please add credits to continue.');
        } else {
          toast.error('Failed to parse script');
        }
        setParsing(false);
        return;
      }

      if (data?.scenes) {
        setParsedScenes(data.scenes);
        toast.success(`Found ${data.scenes.length} scenes`);
      }
    } catch (err) {
      console.error('Parse error:', err);
      toast.error('Failed to parse script');
    }

    setParsing(false);
  }

  async function importScenes() {
    if (parsedScenes.length === 0) {
      toast.error('No scenes to import');
      return;
    }

    setImporting(true);

    try {
      // Save the script
      const { data: script, error: scriptError } = await supabase
        .from('scripts')
        .insert({
          project_id: projectId,
          raw_text: scriptText,
          version: 1
        })
        .select()
        .single();

      if (scriptError) {
        console.error('Error saving script:', scriptError);
        toast.error('Failed to save script');
        setImporting(false);
        return;
      }

      // Create scenes with linked characters and locations
      const scenesToInsert = parsedScenes.map((scene, index) => ({
        project_id: projectId,
        script_id: script.id,
        episode_no: 1,
        scene_no: index + 1,
        slugline: scene.slugline,
        summary: scene.summary,
        time_of_day: scene.time_of_day,
        character_ids: linkedCharacters[index] || [],
        location_id: linkedLocations[index] || null,
      }));

      const { data: createdScenes, error: scenesError } = await supabase
        .from('scenes')
        .insert(scenesToInsert)
        .select();

      if (scenesError) {
        console.error('Error creating scenes:', scenesError);
        toast.error('Failed to create scenes');
        setImporting(false);
        return;
      }

      // Create initial shots for each scene based on dialogue count
      if (createdScenes) {
        const shotsToInsert: { scene_id: string; shot_no: number; shot_type: string; duration_target: number; dialogue_text: string | null }[] = [];
        
        createdScenes.forEach((scene, sceneIndex) => {
          const parsedScene = parsedScenes[sceneIndex];
          const shotCount = Math.max(2, Math.min(parsedScene.dialogue_count, 8)); // 2-8 shots per scene
          
          for (let i = 0; i < shotCount; i++) {
            shotsToInsert.push({
              scene_id: scene.id,
              shot_no: i + 1,
              shot_type: i === 0 ? 'wide' : i === shotCount - 1 ? 'close-up' : 'medium',
              duration_target: 3.0,
              dialogue_text: null,
            });
          }
        });

        if (shotsToInsert.length > 0) {
          await supabase.from('shots').insert(shotsToInsert);
        }
      }

      const linkedCount = Object.values(linkedCharacters).filter(c => c.length > 0).length +
                         Object.values(linkedLocations).filter(l => l !== null).length;

      toast.success(`Imported ${parsedScenes.length} scenes with ${linkedCount} links to characters/locations`);
      setScriptText('');
      setParsedScenes([]);
      setLinkedCharacters({});
      setLinkedLocations({});
      onScenesCreated?.();
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Failed to import scenes');
    }

    setImporting(false);
  }

  const getLinkedCharacterNames = (index: number): string[] => {
    const charIds = linkedCharacters[index] || [];
    return charIds.map(id => existingCharacters.find(c => c.id === id)?.name || '').filter(Boolean);
  };

  const getLinkedLocationName = (index: number): string | null => {
    const locId = linkedLocations[index];
    return locId ? existingLocations.find(l => l.id === locId)?.name || null : null;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Script Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste your screenplay and let AI break it down into scenes, linking to your existing characters and locations
        </p>
      </div>

      {/* Existing bible stats */}
      {(existingCharacters.length > 0 || existingLocations.length > 0) && (
        <div className="flex gap-4 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span>{existingCharacters.length} personajes disponibles</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-primary" />
            <span>{existingLocations.length} localizaciones disponibles</span>
          </div>
        </div>
      )}

      {/* Script input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Screenplay Text
          </CardTitle>
          <CardDescription>
            Paste your screenplay in standard format. The AI will identify scenes, characters, and locations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`INT. COFFEE SHOP - DAY

SARAH (30s, determined) sits alone at a corner table, nursing a cold cup of coffee. The door chimes.

JAMES (40s, weathered) enters, spots her, hesitates.

SARAH
You came.

JAMES
(sitting across from her)
You said it was important.

She slides an envelope across the table.

SARAH
Open it.

He does. His face goes pale.

JAMES
Where did you get this?

...`}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {scriptText.length} characters
            </p>
            <Button 
              variant="gold" 
              onClick={parseScript}
              disabled={parsing || !scriptText.trim()}
            >
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Parse with AI
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Parsed results */}
      {parsedScenes.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-qc-pass" />
                  Parsed Scenes
                </CardTitle>
                <CardDescription>
                  Review the extracted scenes and their links before importing
                </CardDescription>
              </div>
              <Button variant="gold" onClick={importScenes} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    Import {parsedScenes.length} Scenes
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {parsedScenes.map((scene, index) => {
                const linkedCharNames = getLinkedCharacterNames(index);
                const linkedLocName = getLinkedLocationName(index);
                const hasLinks = linkedCharNames.length > 0 || linkedLocName;

                return (
                  <div 
                    key={index}
                    className={`p-4 rounded-lg border ${hasLinks ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">Scene {index + 1}</Badge>
                          <Badge variant={scene.time_of_day === 'night' ? 'secondary' : 'default'}>
                            {scene.time_of_day}
                          </Badge>
                          {hasLinks && (
                            <Badge variant="default" className="bg-primary/80">
                              <Link2 className="w-3 h-3 mr-1" />
                              Linked
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-medium text-foreground mb-1">{scene.slugline}</h4>
                        <p className="text-sm text-muted-foreground mb-3">{scene.summary}</p>
                        
                        <div className="flex flex-wrap gap-4 text-xs">
                          {/* Location link */}
                          <div className="flex items-center gap-1">
                            <MapPin className={`w-3.5 h-3.5 ${linkedLocName ? 'text-primary' : 'text-muted-foreground'}`} />
                            {linkedLocName ? (
                              <span className="text-primary font-medium">{linkedLocName}</span>
                            ) : (
                              <span className="text-muted-foreground">{scene.location} (no match)</span>
                            )}
                          </div>
                          
                          {/* Characters link */}
                          <div className="flex items-center gap-1">
                            <Users className={`w-3.5 h-3.5 ${linkedCharNames.length > 0 ? 'text-primary' : 'text-muted-foreground'}`} />
                            {linkedCharNames.length > 0 ? (
                              <span className="text-primary font-medium">{linkedCharNames.join(', ')}</span>
                            ) : (
                              <span className="text-muted-foreground">{scene.characters.join(', ') || 'No characters'}</span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Film className="w-3.5 h-3.5" />
                            <span>{scene.dialogue_count} dialogue lines → ~{Math.max(2, Math.min(scene.dialogue_count, 8))} shots</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Format guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Script Format Guide</CardTitle>
          <CardDescription>For best results, use standard screenplay format</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-qc-pass" />
                Recommended
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Scene headings: INT./EXT. LOCATION - TIME</li>
                <li>• Character names in CAPS</li>
                <li>• Action lines describe what happens</li>
                <li>• Dialogue under character names</li>
                <li>• Parentheticals for direction</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                Auto-Linking
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Characters matched by name</li>
                <li>• Locations matched by keyword</li>
                <li>• Shots auto-created from dialogue</li>
                <li>• Missing matches can be added later</li>
                <li>• Add characters/locations first for best results</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
