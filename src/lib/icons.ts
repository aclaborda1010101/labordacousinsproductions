// Optimized icon loading - Dynamic imports para reducir bundle size
import { lazy } from 'react';

// Icons usados frecuentemente - static import (core)
export { 
  ChevronRight, 
  Plus,
  Play,
  Loader2 as LoadingIcon 
} from 'lucide-react';

// Icons menos frecuentes - lazy loading
export const DashboardIcons = {
  Film: lazy(() => import('lucide-react').then(mod => ({ default: mod.Film }))),
  Clock: lazy(() => import('lucide-react').then(mod => ({ default: mod.Clock }))),
  CheckCircle2: lazy(() => import('lucide-react').then(mod => ({ default: mod.CheckCircle2 }))),
  AlertCircle: lazy(() => import('lucide-react').then(mod => ({ default: mod.AlertCircle }))),
  TrendingUp: lazy(() => import('lucide-react').then(mod => ({ default: mod.TrendingUp }))),
  Clapperboard: lazy(() => import('lucide-react').then(mod => ({ default: mod.Clapperboard }))),
  Sparkles: lazy(() => import('lucide-react').then(mod => ({ default: mod.Sparkles }))),
  ArrowRight: lazy(() => import('lucide-react').then(mod => ({ default: mod.ArrowRight }))),
  Users: lazy(() => import('lucide-react').then(mod => ({ default: mod.Users }))),
  Layers: lazy(() => import('lucide-react').then(mod => ({ default: mod.Layers }))),
  Zap: lazy(() => import('lucide-react').then(mod => ({ default: mod.Zap }))),
  Target: lazy(() => import('lucide-react').then(mod => ({ default: mod.Target }))),
  BarChart3: lazy(() => import('lucide-react').then(mod => ({ default: mod.BarChart3 }))),
  Calendar: lazy(() => import('lucide-react').then(mod => ({ default: mod.Calendar }))),
  FolderKanban: lazy(() => import('lucide-react').then(mod => ({ default: mod.FolderKanban }))),
  RefreshCw: lazy(() => import('lucide-react').then(mod => ({ default: mod.RefreshCw }))),
  WifiOff: lazy(() => import('lucide-react').then(mod => ({ default: mod.WifiOff }))),
};

// Hook para usar iconos con fallback
export const useLazyIcon = (iconName: keyof typeof DashboardIcons) => {
  return DashboardIcons[iconName];
};