import React, { Suspense } from 'react';
import { LazyLoader } from '@/components/LazyLoader';

// Loading específico para componentes de proyecto
const ProjectLoadingSpinner = ({ componentName }: { componentName: string }) => (
  <div className="flex items-center justify-center p-12 min-h-[400px]">
    <div className="flex flex-col items-center space-y-4">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Cargando {componentName}</p>
        <p className="text-xs text-muted-foreground">Optimizando experiencia...</p>
      </div>
    </div>
  </div>
);

// Lazy loading para los componentes más pesados
export const LazyScriptImport = React.lazy(() => 
  import('./ScriptImport').then(module => ({ default: module.ScriptImport }))
);

export const LazyCharacterPackBuilder = React.lazy(() => 
  import('./CharacterPackBuilder').then(module => ({ default: module.CharacterPackBuilder }))
);

export const LazyScriptWorkspace = React.lazy(() => 
  import('./ScriptWorkspace').then(module => ({ default: module.ScriptWorkspace }))
);

export const LazyCharacters = React.lazy(() => 
  import('./Characters').then(module => ({ default: module.default }))
);

export const LazyShotEditor = React.lazy(() => 
  import('./ShotEditor').then(module => ({ default: module.ShotEditor }))
);

// Wrappers con loading específico
export const ScriptImportLazy: React.FC<any> = (props) => (
  <Suspense fallback={<ProjectLoadingSpinner componentName="Script Import" />}>
    <LazyScriptImport {...props} />
  </Suspense>
);

export const CharacterPackBuilderLazy: React.FC<any> = (props) => (
  <Suspense fallback={<ProjectLoadingSpinner componentName="Character Pack Builder" />}>
    <LazyCharacterPackBuilder {...props} />
  </Suspense>
);

export const ScriptWorkspaceLazy: React.FC<any> = (props) => (
  <Suspense fallback={<ProjectLoadingSpinner componentName="Script Workspace" />}>
    <LazyScriptWorkspace {...props} />
  </Suspense>
);

export const CharactersLazy: React.FC<any> = (props) => (
  <Suspense fallback={<ProjectLoadingSpinner componentName="Characters" />}>
    <LazyCharacters {...props} />
  </Suspense>
);

export const ShotEditorLazy: React.FC<any> = (props) => (
  <Suspense fallback={<ProjectLoadingSpinner componentName="Shot Editor" />}>
    <LazyShotEditor {...props} />
  </Suspense>
);

// Hook para preload inteligente
export const useProjectComponentPreloader = () => {
  const preloadScriptImport = React.useCallback(() => {
    import('./ScriptImport');
  }, []);

  const preloadCharacterBuilder = React.useCallback(() => {
    import('./CharacterPackBuilder');
  }, []);

  const preloadScriptWorkspace = React.useCallback(() => {
    import('./ScriptWorkspace');
  }, []);

  return {
    preloadScriptImport,
    preloadCharacterBuilder,
    preloadScriptWorkspace,
  };
};