import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { DeveloperModeProvider } from "@/contexts/DeveloperModeContext";
import { BackgroundTasksProvider } from "@/contexts/BackgroundTasksContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Loading Component
const LoadingSpinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center space-y-4">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Cargando...</p>
    </div>
  </div>
);

// Lazy Loaded Pages - Code Splitting
const Index = React.lazy(() => import("./pages/Index"));
const Auth = React.lazy(() => import("./pages/Auth"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Projects = React.lazy(() => import("./pages/Projects"));
const NewProject = React.lazy(() => import("./pages/NewProject"));
const ProjectDetail = React.lazy(() => import("./pages/ProjectDetail"));
const Dailies = React.lazy(() => import("./pages/Dailies"));
const MovieAnalysis = React.lazy(() => import("./pages/MovieAnalysis"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Protected Route - requires authentication with timeout
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [timedOut, setTimedOut] = React.useState(false);
  
  React.useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        setTimedOut(true);
      }, 10000); // 10 second timeout
      
      return () => clearTimeout(timeout);
    }
    setTimedOut(false);
  }, [loading]);
  
  if (loading && !timedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (loading && timedOut) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            No se pudo verificar la sesión
          </h2>
          <p className="text-muted-foreground text-sm mb-6">
            Hay problemas de conexión con el servidor. Verifica tu conexión a internet e intenta nuevamente.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              Reintentar
            </button>
            <a 
              href="/auth"
              className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium"
            >
              Ir a inicio
            </a>
          </div>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  
  return (
    <Routes>
      <Route path="/" element={
        loading ? (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : user ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <Navigate to="/auth" replace />
        )
      } />
      <Route path="/auth" element={
        loading ? (
          <LoadingSpinner />
        ) : user ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <Suspense fallback={<LoadingSpinner />}>
            <Auth />
          </Suspense>
        )
      } />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <Dashboard />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <Projects />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <NewProject />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId/*"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <ProjectDetail />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dailies"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <Dailies />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/movie-analysis"
        element={
          <ProtectedRoute>
            <Suspense fallback={<LoadingSpinner />}>
              <MovieAnalysis />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={
        <Suspense fallback={<LoadingSpinner />}>
          <NotFound />
        </Suspense>
      } />
    </Routes>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <AuthProvider>
            <UserProfileProvider>
              <DeveloperModeProvider>
                <BackgroundTasksProvider>
                  <Toaster />
                  <Sonner />
                  <BrowserRouter>
                    <AppRoutes />
                  </BrowserRouter>
                </BackgroundTasksProvider>
              </DeveloperModeProvider>
            </UserProfileProvider>
          </AuthProvider>
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
