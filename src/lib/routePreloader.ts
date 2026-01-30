// Intelligent route preloading for improved UX
type PreloadableRoutes = {
  dashboard: () => Promise<any>;
  projects: () => Promise<any>;
  movieAnalysis: () => Promise<any>;
  dailies: () => Promise<any>;
  newProject: () => Promise<any>;
};

export const routePreloaders: PreloadableRoutes = {
  dashboard: () => import('../pages/Dashboard'),
  projects: () => import('../pages/Projects'),
  movieAnalysis: () => import('../pages/MovieAnalysis'),
  dailies: () => import('../pages/Dailies'),
  newProject: () => import('../pages/NewProject'),
};

export const componentPreloaders = {
  // Preload critical project components
  scriptImport: () => import('../components/project/ScriptImport'),
  characters: () => import('../components/project/Characters'),
  scenes: () => import('../components/project/Scenes'),
  locations: () => import('../components/project/Locations'),
};

// Preload strategy based on user behavior
export const useIntelligentPreloader = () => {
  const preloadOnHover = (routeName: keyof PreloadableRoutes) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        routePreloaders[routeName]().catch(() => {
          // Silent failure for preloading
        });
      });
    }
  };

  const preloadCritical = () => {
    // Preload dashboard and projects immediately after auth
    setTimeout(() => {
      routePreloaders.dashboard();
      routePreloaders.projects();
    }, 2000);
  };

  return {
    preloadOnHover,
    preloadCritical,
  };
};