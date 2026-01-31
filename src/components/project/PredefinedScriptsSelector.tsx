import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, Users, FileText, Play, Info } from 'lucide-react';
import { PREDEFINED_SCRIPTS, type PredefinedScript, getScriptsByCategory } from '@/config/predefined-scripts';

interface PredefinedScriptsSelectorProps {
  onSelectScript: (script: PredefinedScript) => void;
  selectedScript?: PredefinedScript;
}

const categoryColors: Record<string, string> = {
  family: 'bg-blue-100 text-blue-800',
  adventure: 'bg-green-100 text-green-800',
  comedy: 'bg-yellow-100 text-yellow-800',
  drama: 'bg-purple-100 text-purple-800'
};

const categoryLabels: Record<string, string> = {
  family: 'Familiar',
  adventure: 'Aventura',
  comedy: 'Comedia',
  drama: 'Drama'
};

export const PredefinedScriptsSelector: React.FC<PredefinedScriptsSelectorProps> = ({
  onSelectScript,
  selectedScript
}) => {
  const [previewScript, setPreviewScript] = useState<PredefinedScript | null>(null);

  const categories = Array.from(new Set(PREDEFINED_SCRIPTS.map(script => script.category)));

  const ScriptCard = ({ script }: { script: PredefinedScript }) => (
    <Card 
      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
        selectedScript?.id === script.id ? 'ring-2 ring-primary' : ''
      }`}
      onClick={() => onSelectScript(script)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold">{script.title}</CardTitle>
            <CardDescription className="mt-1 text-sm">
              {script.description}
            </CardDescription>
          </div>
          <Badge className={categoryColors[script.category] || 'bg-gray-100 text-gray-800'}>
            {categoryLabels[script.category] || script.category}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{script.duration}min</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{script.characters.length} personajes</span>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Personajes principales:</h4>
          <div className="flex flex-wrap gap-1">
            {script.characters.slice(0, 3).map((character, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {character.name}
                {character.age && ` (${character.age})`}
              </Badge>
            ))}
            {script.characters.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{script.characters.length - 3} más
              </Badge>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            variant={selectedScript?.id === script.id ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              onSelectScript(script);
            }}
          >
            <Play className="h-4 w-4 mr-1" />
            {selectedScript?.id === script.id ? 'Seleccionado' : 'Usar guión'}
          </Button>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewScript(script);
                }}
              >
                <Info className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{script.title}</DialogTitle>
                <DialogDescription>{script.description}</DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="script" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="script">Guión completo</TabsTrigger>
                  <TabsTrigger value="characters">Personajes</TabsTrigger>
                </TabsList>
                
                <TabsContent value="script" className="mt-4">
                  <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {script.script}
                    </pre>
                  </ScrollArea>
                </TabsContent>
                
                <TabsContent value="characters" className="mt-4">
                  <ScrollArea className="h-[400px] w-full">
                    <div className="space-y-4">
                      {script.characters.map((character, index) => (
                        <Card key={index}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{character.name}</CardTitle>
                              <div className="flex items-center gap-2">
                                {character.age && (
                                  <Badge variant="outline">{character.age} años</Badge>
                                )}
                                <Badge 
                                  className={
                                    character.role === 'protagonist' ? 'bg-blue-100 text-blue-800' :
                                    character.role === 'secondary' ? 'bg-green-100 text-green-800' :
                                    'bg-gray-100 text-gray-800'
                                  }
                                >
                                  {character.role === 'protagonist' ? 'Protagonista' :
                                   character.role === 'secondary' ? 'Secundario' : 'Apoyo'}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">{character.description}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
              
              <DialogFooter>
                <Button
                  onClick={() => {
                    onSelectScript(script);
                    setPreviewScript(null);
                  }}
                  className="w-full"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Usar este guión
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">Guiones Predefinidos</h3>
        <p className="text-muted-foreground">
          Comienza con historias listas para producir, optimizadas y probadas
        </p>
      </div>

      {categories.length > 1 ? (
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="all">Todos</TabsTrigger>
            {categories.map(category => (
              <TabsTrigger key={category} value={category}>
                {categoryLabels[category] || category}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <TabsContent value="all">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PREDEFINED_SCRIPTS.map(script => (
                <ScriptCard key={script.id} script={script} />
              ))}
            </div>
          </TabsContent>
          
          {categories.map(category => (
            <TabsContent key={category} value={category}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {getScriptsByCategory(category).map(script => (
                  <ScriptCard key={script.id} script={script} />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PREDEFINED_SCRIPTS.map(script => (
            <ScriptCard key={script.id} script={script} />
          ))}
        </div>
      )}
      
      {selectedScript && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <div>
                <p className="font-medium">Guión seleccionado: {selectedScript.title}</p>
                <p className="text-sm text-muted-foreground">
                  Listo para usar en tu proyecto
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};