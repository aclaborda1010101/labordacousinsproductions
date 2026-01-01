import { useState } from 'react';
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
  AlertCircle
} from 'lucide-react';

interface ParsedScene {
  slugline: string;
  summary: string;
  characters: string[];
  location: string;
  time_of_day: string;
  dialogue_count: number;
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

      // Create scenes
      const scenesToInsert = parsedScenes.map((scene, index) => ({
        project_id: projectId,
        script_id: script.id,
        episode_no: 1,
        scene_no: index + 1,
        slugline: scene.slugline,
        summary: scene.summary,
        time_of_day: scene.time_of_day,
      }));

      const { error: scenesError } = await supabase
        .from('scenes')
        .insert(scenesToInsert);

      if (scenesError) {
        console.error('Error creating scenes:', scenesError);
        toast.error('Failed to create scenes');
        setImporting(false);
        return;
      }

      toast.success(`Imported ${parsedScenes.length} scenes successfully`);
      setScriptText('');
      setParsedScenes([]);
      onScenesCreated?.();
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Failed to import scenes');
    }

    setImporting(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Script Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste your screenplay and let AI break it down into scenes
        </p>
      </div>

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
                  Review the extracted scenes before importing
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
              {parsedScenes.map((scene, index) => (
                <div 
                  key={index}
                  className="p-4 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">Scene {index + 1}</Badge>
                        <Badge variant={scene.time_of_day === 'night' ? 'secondary' : 'default'}>
                          {scene.time_of_day}
                        </Badge>
                      </div>
                      <h4 className="font-medium text-foreground mb-1">{scene.slugline}</h4>
                      <p className="text-sm text-muted-foreground mb-3">{scene.summary}</p>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{scene.location}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Users className="w-3.5 h-3.5" />
                          <span>{scene.characters.join(', ') || 'No characters'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Film className="w-3.5 h-3.5" />
                          <span>{scene.dialogue_count} dialogue lines</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
                <AlertCircle className="w-4 h-4 text-warning" />
                AI Detection
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Scenes split at INT./EXT. headers</li>
                <li>• Characters extracted from dialogue</li>
                <li>• Locations parsed from sluglines</li>
                <li>• Time of day from scene headers</li>
                <li>• Summary generated from action</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
