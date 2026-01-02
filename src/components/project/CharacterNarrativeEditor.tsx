import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, ChevronUp, Book, Heart, Target, Users, 
  Plus, X, Save, Loader2, Mic
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CharacterNarrative {
  biography: {
    age: number;
    occupation: string;
    background: string;
    personality_traits: string[];
    likes_dislikes: { likes: string[]; dislikes: string[] };
    fears: string[];
    goals: string[];
  };
  character_arc: {
    starting_point: string;
    journey: string;
    transformation: string;
    ending_point: string;
  };
  relationships: Array<{
    character_id: string;
    character_name?: string;
    relationship_type: string;
    description: string;
    evolution: string;
  }>;
  voice_performance: {
    speaking_voice: string;
    notable_phrases: string[];
    speech_quirks: string[];
  };
}

const getDefaultNarrative = (): CharacterNarrative => ({
  biography: {
    age: 30,
    occupation: '',
    background: '',
    personality_traits: [],
    likes_dislikes: { likes: [], dislikes: [] },
    fears: [],
    goals: [],
  },
  character_arc: {
    starting_point: '',
    journey: '',
    transformation: '',
    ending_point: '',
  },
  relationships: [],
  voice_performance: {
    speaking_voice: '',
    notable_phrases: [],
    speech_quirks: [],
  },
});

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
  const [data, setData] = useState<CharacterNarrative>(getDefaultNarrative());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    biography: true,
    arc: false,
    relationships: false,
    voice: false,
  });

  useEffect(() => {
    fetchNarrative();
  }, [characterId]);

  const fetchNarrative = async () => {
    try {
      const { data: narrative, error } = await supabase
        .from('character_narrative')
        .select('*')
        .eq('character_id', characterId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (narrative) {
        setData({
          biography: narrative.biography as CharacterNarrative['biography'],
          character_arc: narrative.character_arc as CharacterNarrative['character_arc'],
          relationships: narrative.relationships as CharacterNarrative['relationships'],
          voice_performance: narrative.voice_performance as CharacterNarrative['voice_performance'],
        });
      }
    } catch (error) {
      console.error('Error fetching narrative:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('character_narrative')
        .upsert({
          character_id: characterId,
          biography: data.biography,
          character_arc: data.character_arc,
          relationships: data.relationships,
          voice_performance: data.voice_performance,
        }, {
          onConflict: 'character_id'
        });

      if (error) throw error;
      toast.success('Narrativa guardada');
    } catch (error) {
      console.error('Error saving narrative:', error);
      toast.error('Error al guardar narrativa');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateData = (path: string[], value: any) => {
    setData(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      let current = newData;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newData;
    });
  };

  const TagList = ({ 
    items, 
    onAdd, 
    onRemove, 
    placeholder 
  }: { 
    items: string[]; 
    onAdd: (item: string) => void; 
    onRemove: (i: number) => void; 
    placeholder: string;
  }) => {
    const [newItem, setNewItem] = useState('');
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1">
              {item}
              <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => onRemove(i)} />
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-sm flex-1"
            onKeyDown={e => {
              if (e.key === 'Enter' && newItem.trim()) {
                e.preventDefault();
                onAdd(newItem.trim());
                setNewItem('');
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (newItem.trim()) {
                onAdd(newItem.trim());
                setNewItem('');
              }
            }}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Book className="w-5 h-5 text-primary" />
            Narrativa - {characterName}
          </h3>
          <p className="text-sm text-muted-foreground">
            Biografía, arco de personaje y relaciones
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar
        </Button>
      </div>

      <div className="space-y-2">
        {/* Biography */}
        <Card>
          <Collapsible open={expandedSections.biography}>
            <CollapsibleTrigger
              onClick={() => toggleSection('biography')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Book className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">Biografía</h4>
                  <p className="text-xs text-muted-foreground">Trasfondo, personalidad, objetivos</p>
                </div>
              </div>
              {expandedSections.biography ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Edad</Label>
                    <Input
                      type="number"
                      value={data.biography.age}
                      onChange={e => updateData(['biography', 'age'], parseInt(e.target.value) || 0)}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ocupación</Label>
                    <Input
                      value={data.biography.occupation}
                      onChange={e => updateData(['biography', 'occupation'], e.target.value)}
                      className="h-8"
                      placeholder="Detective, profesor, etc."
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Trasfondo</Label>
                  <Textarea
                    value={data.biography.background}
                    onChange={e => updateData(['biography', 'background'], e.target.value)}
                    placeholder="Historia del personaje, origen, eventos formativos..."
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Rasgos de personalidad</Label>
                  <TagList
                    items={data.biography.personality_traits}
                    onAdd={item => updateData(['biography', 'personality_traits'], [...data.biography.personality_traits, item])}
                    onRemove={i => updateData(['biography', 'personality_traits'], data.biography.personality_traits.filter((_, idx) => idx !== i))}
                    placeholder="Ej: terco, compasivo, analítico..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Le gusta</Label>
                    <TagList
                      items={data.biography.likes_dislikes.likes}
                      onAdd={item => updateData(['biography', 'likes_dislikes', 'likes'], [...data.biography.likes_dislikes.likes, item])}
                      onRemove={i => updateData(['biography', 'likes_dislikes', 'likes'], data.biography.likes_dislikes.likes.filter((_, idx) => idx !== i))}
                      placeholder="Música clásica..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">No le gusta</Label>
                    <TagList
                      items={data.biography.likes_dislikes.dislikes}
                      onAdd={item => updateData(['biography', 'likes_dislikes', 'dislikes'], [...data.biography.likes_dislikes.dislikes, item])}
                      onRemove={i => updateData(['biography', 'likes_dislikes', 'dislikes'], data.biography.likes_dislikes.dislikes.filter((_, idx) => idx !== i))}
                      placeholder="Mentiras..."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Miedos</Label>
                    <TagList
                      items={data.biography.fears}
                      onAdd={item => updateData(['biography', 'fears'], [...data.biography.fears, item])}
                      onRemove={i => updateData(['biography', 'fears'], data.biography.fears.filter((_, idx) => idx !== i))}
                      placeholder="Perder el control..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Objetivos</Label>
                    <TagList
                      items={data.biography.goals}
                      onAdd={item => updateData(['biography', 'goals'], [...data.biography.goals, item])}
                      onRemove={i => updateData(['biography', 'goals'], data.biography.goals.filter((_, idx) => idx !== i))}
                      placeholder="Encontrar la verdad..."
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Character Arc */}
        <Card>
          <Collapsible open={expandedSections.arc}>
            <CollapsibleTrigger
              onClick={() => toggleSection('arc')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">Arco del Personaje</h4>
                  <p className="text-xs text-muted-foreground">Evolución a lo largo de la historia</p>
                </div>
              </div>
              {expandedSections.arc ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Punto de partida</Label>
                  <Textarea
                    value={data.character_arc.starting_point}
                    onChange={e => updateData(['character_arc', 'starting_point'], e.target.value)}
                    placeholder="¿Cómo es el personaje al inicio de la historia?"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">El viaje</Label>
                  <Textarea
                    value={data.character_arc.journey}
                    onChange={e => updateData(['character_arc', 'journey'], e.target.value)}
                    placeholder="¿Qué desafíos enfrenta? ¿Qué aprende?"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Transformación</Label>
                  <Textarea
                    value={data.character_arc.transformation}
                    onChange={e => updateData(['character_arc', 'transformation'], e.target.value)}
                    placeholder="¿Cómo cambia internamente?"
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Punto final</Label>
                  <Textarea
                    value={data.character_arc.ending_point}
                    onChange={e => updateData(['character_arc', 'ending_point'], e.target.value)}
                    placeholder="¿Cómo termina el personaje?"
                    rows={2}
                  />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Relationships */}
        <Card>
          <Collapsible open={expandedSections.relationships}>
            <CollapsibleTrigger
              onClick={() => toggleSection('relationships')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">Relaciones</h4>
                  <p className="text-xs text-muted-foreground">Conexiones con otros personajes</p>
                </div>
              </div>
              {expandedSections.relationships ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {data.relationships.map((rel, i) => (
                  <div key={i} className="p-3 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{rel.character_name || 'Personaje'}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateData(['relationships'], data.relationships.filter((_, idx) => idx !== i))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={rel.relationship_type}
                        onChange={e => {
                          const updated = [...data.relationships];
                          updated[i].relationship_type = e.target.value;
                          updateData(['relationships'], updated);
                        }}
                        placeholder="Tipo: amigo, rival, mentor..."
                        className="h-8 text-sm"
                      />
                      <Input
                        value={rel.description}
                        onChange={e => {
                          const updated = [...data.relationships];
                          updated[i].description = e.target.value;
                          updateData(['relationships'], updated);
                        }}
                        placeholder="Descripción breve..."
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateData(['relationships'], [
                    ...data.relationships,
                    { character_id: '', character_name: '', relationship_type: '', description: '', evolution: '' }
                  ])}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Añadir relación
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Voice Performance */}
        <Card>
          <Collapsible open={expandedSections.voice}>
            <CollapsibleTrigger
              onClick={() => toggleSection('voice')}
              className="flex items-center justify-between w-full p-3 hover:bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Mic className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <h4 className="font-medium text-sm">Voz y Actuación</h4>
                  <p className="text-xs text-muted-foreground">Cómo habla y se expresa</p>
                </div>
              </div>
              {expandedSections.voice ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Descripción de la voz</Label>
                  <Textarea
                    value={data.voice_performance.speaking_voice}
                    onChange={e => updateData(['voice_performance', 'speaking_voice'], e.target.value)}
                    placeholder="Grave, suave, con acento regional..."
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Frases características</Label>
                  <TagList
                    items={data.voice_performance.notable_phrases}
                    onAdd={item => updateData(['voice_performance', 'notable_phrases'], [...data.voice_performance.notable_phrases, item])}
                    onRemove={i => updateData(['voice_performance', 'notable_phrases'], data.voice_performance.notable_phrases.filter((_, idx) => idx !== i))}
                    placeholder="'Interesante...' cuando piensa"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Peculiaridades del habla</Label>
                  <TagList
                    items={data.voice_performance.speech_quirks}
                    onAdd={item => updateData(['voice_performance', 'speech_quirks'], [...data.voice_performance.speech_quirks, item])}
                    onRemove={i => updateData(['voice_performance', 'speech_quirks'], data.voice_performance.speech_quirks.filter((_, idx) => idx !== i))}
                    placeholder="Hace pausas largas antes de responder..."
                  />
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>
    </div>
  );
}

export default CharacterNarrativeEditor;
