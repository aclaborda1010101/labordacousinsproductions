import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Plus, Trash2, FileText, Film, Tv, BookOpen, Upload, Loader2, Eye, Copy } from 'lucide-react';

interface ReferenceScript {
  id: string;
  title: string;
  source_type: string;
  genre: string | null;
  language: string;
  content: string;
  word_count: number | null;
  notes: string | null;
  is_global: boolean;
  created_at: string;
}

interface Props {
  projectId: string;
}

export default function ReferenceScriptLibrary({ projectId }: Props) {
  const [references, setReferences] = useState<ReferenceScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<ReferenceScript | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<string>('movie');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState('es');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchReferences();
  }, [projectId]);

  const fetchReferences = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reference_scripts')
        .select('*')
        .or(`project_id.eq.${projectId},is_global.eq.true`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReferences(data || []);
    } catch (err) {
      console.error('Error fetching references:', err);
      toast.error('Error al cargar referencias');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('Título y contenido son requeridos');
      return;
    }

    setSaving(true);
    try {
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

      const { error } = await supabase.from('reference_scripts').insert({
        project_id: projectId,
        title: title.trim(),
        source_type: sourceType,
        genre: genre.trim() || null,
        language,
        content: content.trim(),
        word_count: wordCount,
        notes: notes.trim() || null,
        is_global: false
      });

      if (error) throw error;

      toast.success('Referencia guardada correctamente');
      setDialogOpen(false);
      resetForm();
      fetchReferences();
    } catch (err) {
      console.error('Error saving reference:', err);
      toast.error('Error al guardar referencia');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta referencia?')) return;

    try {
      const { error } = await supabase
        .from('reference_scripts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Referencia eliminada');
      fetchReferences();
    } catch (err) {
      console.error('Error deleting reference:', err);
      toast.error('Error al eliminar referencia');
    }
  };

  const resetForm = () => {
    setTitle('');
    setSourceType('movie');
    setGenre('');
    setLanguage('es');
    setContent('');
    setNotes('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande (máx 5MB)');
      return;
    }

    try {
      const text = await file.text();
      setContent(text);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      toast.success('Archivo cargado');
    } catch (err) {
      toast.error('Error al leer el archivo');
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'movie': return <Film className="w-4 h-4" />;
      case 'series': return <Tv className="w-4 h-4" />;
      case 'template': return <BookOpen className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getSourceLabel = (type: string) => {
    switch (type) {
      case 'movie': return 'Película';
      case 'series': return 'Serie';
      case 'template': return 'Plantilla';
      default: return type;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Biblioteca de Referencias
            </CardTitle>
            <CardDescription>
              Guiones de películas y series para que la IA aprenda tu estilo
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Añadir Referencia
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva Referencia</DialogTitle>
                <DialogDescription>
                  Sube un guion completo de película o serie para que la IA lo use como referencia
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título *</Label>
                    <Input
                      placeholder="Ej: El Padrino, Breaking Bad S01..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={sourceType} onValueChange={setSourceType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="movie">Película</SelectItem>
                        <SelectItem value="series">Serie</SelectItem>
                        <SelectItem value="template">Plantilla/Formato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Género</Label>
                    <Input
                      placeholder="Ej: Drama, Thriller, Comedia..."
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Idioma</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="it">Italiano</SelectItem>
                        <SelectItem value="pt">Português</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Contenido del Guion *</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".txt,.md,.fountain"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          Cargar archivo .txt
                        </span>
                      </Button>
                    </label>
                    <span className="text-sm text-muted-foreground">
                      o pega el texto directamente
                    </span>
                  </div>
                  <Textarea
                    placeholder="Pega aquí el guion completo..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {content.split(/\s+/).filter(w => w.length > 0).length.toLocaleString()} palabras
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Textarea
                    placeholder="Qué te gusta de este guion, qué estilo quieres que la IA aprenda..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={saving || !title.trim() || !content.trim()}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Guardar Referencia
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : references.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No hay referencias todavía</p>
            <p className="text-sm">Añade guiones de películas o series para mejorar las generaciones</p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {references.map((ref) => (
              <AccordionItem key={ref.id} value={ref.id} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    {getSourceIcon(ref.source_type)}
                    <div>
                      <p className="font-medium">{ref.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {getSourceLabel(ref.source_type)}
                        </Badge>
                        {ref.genre && (
                          <Badge variant="secondary" className="text-xs">
                            {ref.genre}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {ref.word_count?.toLocaleString()} palabras
                        </span>
                        {ref.is_global && (
                          <Badge variant="default" className="text-xs">Global</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2 space-y-3">
                    {ref.notes && (
                      <p className="text-sm text-muted-foreground italic">
                        "{ref.notes}"
                      </p>
                    )}
                    <ScrollArea className="h-[200px] rounded border p-3 bg-muted/50">
                      <pre className="text-xs font-mono whitespace-pre-wrap">
                        {ref.content.slice(0, 3000)}
                        {ref.content.length > 3000 && '...'}
                      </pre>
                    </ScrollArea>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedReference(ref);
                          setViewDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Ver completo
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(ref.content)}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar
                      </Button>
                      {!ref.is_global && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(ref.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>

      {/* Full view dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedReference?.title}</DialogTitle>
            <DialogDescription>
              {selectedReference?.word_count?.toLocaleString()} palabras
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] rounded border p-4 bg-muted/50">
            <pre className="text-sm font-mono whitespace-pre-wrap">
              {selectedReference?.content}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
