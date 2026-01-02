import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Shield,
  BookOpen,
  Package,
  Image as ImageIcon
} from 'lucide-react';

type QCStatus = 'ready' | 'incomplete' | 'warning' | 'error' | 'pending';

interface QCCheck {
  name: string;
  status: QCStatus;
  message?: string;
}

interface QCStatusBadgeProps {
  status: QCStatus;
  score?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
  checks?: QCCheck[];
}

export function QCStatusBadge({ 
  status, 
  score, 
  label,
  size = 'md',
  showScore = true,
  checks
}: QCStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'ready':
        return {
          icon: CheckCircle2,
          className: 'bg-green-500/10 text-green-600 border-green-500/30',
          text: label || 'Listo'
        };
      case 'incomplete':
        return {
          icon: Clock,
          className: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
          text: label || 'Incompleto'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          className: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
          text: label || 'Advertencia'
        };
      case 'error':
        return {
          icon: XCircle,
          className: 'bg-red-500/10 text-red-600 border-red-500/30',
          text: label || 'Error'
        };
      case 'pending':
      default:
        return {
          icon: Clock,
          className: 'bg-muted text-muted-foreground border-border',
          text: label || 'Pendiente'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  };

  const badge = (
    <Badge variant="outline" className={`${config.className} ${sizeClasses[size]}`}>
      <Icon className={`${iconSizes[size]} mr-1`} />
      {config.text}
      {showScore && score !== undefined && (
        <span className="ml-1 font-mono">{score}%</span>
      )}
    </Badge>
  );

  if (checks && checks.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <div className="text-xs font-medium">QC Checks:</div>
            {checks.map((check, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {check.status === 'ready' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                {check.status === 'warning' && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                {check.status === 'error' && <XCircle className="w-3 h-3 text-red-500" />}
                {check.status === 'incomplete' && <Clock className="w-3 h-3 text-muted-foreground" />}
                <span>{check.name}</span>
                {check.message && <span className="text-muted-foreground">- {check.message}</span>}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}

// Entity-specific QC badge that calculates status based on entity data
interface EntityQCBadgeProps {
  entityType: 'character' | 'location' | 'prop';
  hasProfile: boolean;
  packScore?: number;
  hasContinuityLock?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function EntityQCBadge({
  entityType,
  hasProfile,
  packScore,
  hasContinuityLock,
  size = 'sm'
}: EntityQCBadgeProps) {
  const checks: QCCheck[] = [];
  
  // Profile check
  checks.push({
    name: 'Bible Profile',
    status: hasProfile ? 'ready' : 'incomplete',
    message: hasProfile ? undefined : 'Generar perfil'
  });
  
  // Pack score check (for characters/locations)
  if (packScore !== undefined) {
    checks.push({
      name: 'Pack Images',
      status: packScore >= 90 ? 'ready' : packScore >= 50 ? 'warning' : 'incomplete',
      message: `${packScore}%`
    });
  }
  
  // Continuity lock check
  if (hasContinuityLock !== undefined) {
    checks.push({
      name: 'Continuity Lock',
      status: hasContinuityLock ? 'ready' : 'incomplete'
    });
  }
  
  // Calculate overall status
  const hasErrors = checks.some(c => c.status === 'error');
  const hasWarnings = checks.some(c => c.status === 'warning');
  const hasIncomplete = checks.some(c => c.status === 'incomplete');
  const allReady = checks.every(c => c.status === 'ready');
  
  let overallStatus: QCStatus = 'pending';
  let overallScore: number | undefined;
  
  if (allReady) {
    overallStatus = 'ready';
    overallScore = 100;
  } else if (hasErrors) {
    overallStatus = 'error';
    overallScore = 0;
  } else if (hasWarnings || hasIncomplete) {
    overallStatus = hasWarnings ? 'warning' : 'incomplete';
    const readyCount = checks.filter(c => c.status === 'ready').length;
    overallScore = Math.round((readyCount / checks.length) * 100);
  }
  
  return (
    <QCStatusBadge 
      status={overallStatus}
      score={overallScore}
      size={size}
      checks={checks}
      label="QC"
    />
  );
}

// Scene/Shot QC badge
interface ProductionQCBadgeProps {
  mode: 'CINE' | 'ULTRA';
  hasKeyframes: boolean;
  keyframeCount: number;
  requiredKeyframes: number;
  hasRender: boolean;
  isHero?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ProductionQCBadge({
  mode,
  hasKeyframes,
  keyframeCount,
  requiredKeyframes,
  hasRender,
  isHero,
  size = 'sm'
}: ProductionQCBadgeProps) {
  const checks: QCCheck[] = [];
  
  // Keyframe coverage
  const keyframeCoverage = Math.round((keyframeCount / requiredKeyframes) * 100);
  checks.push({
    name: 'Keyframes',
    status: keyframeCoverage >= 100 ? 'ready' : keyframeCoverage >= 50 ? 'warning' : 'incomplete',
    message: `${keyframeCount}/${requiredKeyframes}`
  });
  
  // Render status
  checks.push({
    name: 'Render',
    status: hasRender ? 'ready' : 'incomplete'
  });
  
  // Mode compliance
  const modeThreshold = mode === 'ULTRA' || isHero ? 90 : 85;
  const currentScore = (keyframeCoverage + (hasRender ? 100 : 0)) / 2;
  checks.push({
    name: `${mode} Threshold`,
    status: currentScore >= modeThreshold ? 'ready' : currentScore >= modeThreshold - 10 ? 'warning' : 'incomplete',
    message: `≥${modeThreshold}%`
  });
  
  const allReady = checks.every(c => c.status === 'ready');
  const hasWarnings = checks.some(c => c.status === 'warning');
  
  return (
    <QCStatusBadge 
      status={allReady ? 'ready' : hasWarnings ? 'warning' : 'incomplete'}
      score={Math.round(currentScore)}
      size={size}
      checks={checks}
      label={isHero ? 'HERO QC' : 'QC'}
    />
  );
}
