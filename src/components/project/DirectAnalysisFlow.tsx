/**
 * DirectAnalysisFlow - Simplified flow that skips intermediate page
 * Automatically shows analysis results after processing
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, ArrowRight, FileText, Users, MapPin, MessageSquare, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DirectAnalysisFlowProps {
  projectId: string;
  onContinue?: () => void;
}

export default function DirectAnalysisFlow({ projectId, onContinue }: DirectAnalysisFlowProps) {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    loadAnalysisData();
    // Simulate progress for better UX
    const progressTimer = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 200);
    
    setTimeout(() => {
      clearInterval(progressTimer);
      setProgress(100);
    }, 2000);
  }, [projectId]);

  const loadAnalysisData = async () => {
    try {
      setLoading(true);
      
      const { data: scriptData } = await supabase
        .from('scripts')
        .select('parsed_json, meta, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (scriptData?.parsed_json) {
        setAnalysisData(scriptData.parsed_json);
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAnalysisStats = () => {
    if (!analysisData) return null;
    
    return {
      acts: analysisData.estructura_dramatica?.tipo_detectado === '3_actos' ? 3 : 1,
      characters: analysisData.personajes?.length || 0,
      scenes: analysisData.escenas?.length || 0,
      locations: analysisData.localizaciones?.length || 0,
      themes: analysisData.analisis_tematico?.temas_secundarios?.length || 0
    };
  };

  const stats = getAnalysisStats();

  if (loading || !analysisData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Procesando Análisis...
            </CardTitle>
            <CardDescription>
              Extrayendo estructura dramática, personajes y elementos narrativos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={progress} className="w-full" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div className="space-y-2">
                <FileText className="h-8 w-8 mx-auto text-blue-500" />
                <p className="text-sm">Estructura</p>
              </div>
              <div className="space-y-2">
                <Users className="h-8 w-8 mx-auto text-green-500" />
                <p className="text-sm">Personajes</p>
              </div>
              <div className="space-y-2">
                <MapPin className="h-8 w-8 mx-auto text-purple-500" />
                <p className="text-sm">Localizaciones</p>
              </div>
              <div className="space-y-2">
                <MessageSquare className="h-8 w-8 mx-auto text-orange-500" />
                <p className="text-sm">Diálogos</p>
              </div>
              <div className="space-y-2">
                <Target className="h-8 w-8 mx-auto text-red-500" />
                <p className="text-sm">Temas</p>
              </div>
            </div>
            <p className="text-center text-muted-foreground">
              Esto puede tomar 1-2 minutos para un análisis completo...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <CheckCircle className="h-6 w-6" />
            ¡Análisis Completado!
          </CardTitle>
          <CardDescription className="text-green-700">
            Tu guión ha sido analizado completamente con IA avanzada
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Analysis Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats?.acts || 1}</div>
              <div className="text-sm text-gray-600">Actos</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats?.characters || 0}</div>
              <div className="text-sm text-gray-600">Personajes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats?.scenes || 0}</div>
              <div className="text-sm text-gray-600">Escenas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats?.locations || 0}</div>
              <div className="text-sm text-gray-600">Localizaciones</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats?.themes || 0}</div>
              <div className="text-sm text-gray-600">Temas</div>
            </div>
          </div>

          {/* Quick Preview */}
          {analysisData.estructura_dramatica && (
            <div className="bg-white rounded-lg p-4 border">
              <h3 className="font-semibold mb-2">Estructura Dramática Detectada</h3>
              <p className="text-sm text-gray-600">
                {analysisData.estructura_dramatica.tipo_detectado === '3_actos' ? 
                  'Estructura clásica de tres actos identificada' : 
                  'Estructura narrativa detectada'}
              </p>
            </div>
          )}

          {analysisData.analisis_tematico?.tema_central && (
            <div className="bg-white rounded-lg p-4 border">
              <h3 className="font-semibold mb-2">Tema Central</h3>
              <p className="text-sm text-gray-600">
                {analysisData.analisis_tematico.tema_central}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              onClick={() => navigate(`/projects/${projectId}/script-analysis`)}
              className="flex-1"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Ver Análisis Completo
            </Button>
            <Button 
              onClick={() => navigate(`/projects/${projectId}/scenes`)}
              variant="outline"
            >
              Ir a Producción
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}