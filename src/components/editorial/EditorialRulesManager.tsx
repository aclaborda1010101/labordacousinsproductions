/**
 * Pantalla: Fuente Editorial Central (Reglas A/B/D)
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Shield, AlertTriangle, Lightbulb, Lock, Settings2 } from 'lucide-react';
import type { EditorialRule, ProjectRuleOverride, EditorialProjectPhase } from '@/lib/editorialMVPTypes';

interface EditorialRulesManagerProps {
  rules: EditorialRule[];
  overrides: ProjectRuleOverride[];
  phase: EditorialProjectPhase;
  onToggleRule: (ruleId: string, isActive: boolean, disableReason?: string) => Promise<void>;
}

export function EditorialRulesManager({
  rules,
  overrides,
  phase,
  onToggleRule
}: EditorialRulesManagerProps) {
  const overrideMap = new Map(overrides.map(o => [o.ruleId, o]));
  
  const rulesA = rules.filter(r => r.ruleType === 'A');
  const rulesB = rules.filter(r => r.ruleType === 'B');
  const rulesD = rules.filter(r => r.ruleType === 'D');

  const isRuleActive = (rule: EditorialRule): boolean => {
    const override = overrideMap.get(rule.id);
    return override ? override.isActive : rule.activeDefault;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Fuente Editorial Central</h2>
        <p className="text-muted-foreground">
          Configura las reglas que controlan la calidad y coherencia de las generaciones.
        </p>
        <div className="mt-3">
          <Badge variant={phase === 'exploracion' ? 'secondary' : 'default'}>
            Fase: {phase === 'exploracion' ? 'Exploración' : 'Producción'}
          </Badge>
          <span className="text-sm text-muted-foreground ml-2">
            {phase === 'exploracion' 
              ? '(Mayor tolerancia - advertencias suaves)'
              : '(Control estricto - puede bloquear generaciones)'}
          </span>
        </div>
      </div>

      <Tabs defaultValue="type-a">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="type-a" className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-500" />
            Tipo A ({rulesA.length})
          </TabsTrigger>
          <TabsTrigger value="type-b" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Tipo B ({rulesB.length})
          </TabsTrigger>
          <TabsTrigger value="type-d" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-blue-500" />
            Tipo D ({rulesD.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="type-a" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                Reglas Bloqueantes
              </CardTitle>
              <CardDescription>
                Siempre activas. Protegen la coherencia fundamental del proyecto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RulesList 
                rules={rulesA} 
                isRuleActive={isRuleActive}
                phase={phase}
                showToggle={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="type-b" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Reglas de Advertencia
              </CardTitle>
              <CardDescription>
                Configurables. Puedes desactivarlas con un motivo válido.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RulesList 
                rules={rulesB} 
                isRuleActive={isRuleActive}
                phase={phase}
                showToggle={true}
                overrideMap={overrideMap}
                onToggleRule={onToggleRule}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="type-d" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-blue-500" />
                Sugerencias
              </CardTitle>
              <CardDescription>
                Recomendaciones para mejorar la calidad. Solo informativas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RulesList 
                rules={rulesD} 
                isRuleActive={isRuleActive}
                phase={phase}
                showToggle={false}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Lista de reglas
function RulesList({
  rules,
  isRuleActive,
  phase,
  showToggle,
  overrideMap,
  onToggleRule
}: {
  rules: EditorialRule[];
  isRuleActive: (rule: EditorialRule) => boolean;
  phase: EditorialProjectPhase;
  showToggle: boolean;
  overrideMap?: Map<string, ProjectRuleOverride>;
  onToggleRule?: (ruleId: string, isActive: boolean, disableReason?: string) => Promise<void>;
}) {
  // Filtrar por fase
  const applicableRules = rules.filter(r => 
    phase === 'exploracion' ? r.appliesInExploration : r.appliesInProduction
  );

  if (applicableRules.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-4">
        No hay reglas aplicables en esta fase.
      </p>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {applicableRules.map((rule) => (
        <AccordionItem key={rule.id} value={rule.id}>
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3 text-left flex-1">
              <Badge variant="outline" className="font-mono text-xs">
                {rule.ruleCode}
              </Badge>
              <span className="font-medium">{rule.name}</span>
              <SeverityBadge severity={rule.severity} />
              {!isRuleActive(rule) && (
                <Badge variant="secondary" className="text-xs">Desactivada</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                {rule.description}
              </p>

              {/* Acción en caso de fallo */}
              <div className="flex items-center gap-2 text-sm">
                <Settings2 className="h-4 w-4" />
                <span className="text-muted-foreground">Acción:</span>
                <Badge variant="outline">
                  {getActionLabel(phase === 'produccion' && rule.actionOnFailProduction 
                    ? rule.actionOnFailProduction 
                    : rule.actionOnFail)}
                </Badge>
              </div>

              {/* Toggle para reglas B */}
              {showToggle && rule.toggleable && onToggleRule && (
                <RuleToggle
                  rule={rule}
                  isActive={isRuleActive(rule)}
                  currentReason={overrideMap?.get(rule.id)?.disableReason}
                  onToggle={onToggleRule}
                />
              )}

              {/* Snippets negativos */}
              {rule.negativePromptSnippets.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Filtros preventivos:</p>
                  <div className="flex flex-wrap gap-1">
                    {rule.negativePromptSnippets.slice(0, 5).map((snippet, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {snippet}
                      </Badge>
                    ))}
                    {rule.negativePromptSnippets.length > 5 && (
                      <Badge variant="secondary" className="text-xs">
                        +{rule.negativePromptSnippets.length - 5} más
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

// Toggle de regla con motivo
function RuleToggle({
  rule,
  isActive,
  currentReason,
  onToggle
}: {
  rule: EditorialRule;
  isActive: boolean;
  currentReason?: string;
  onToggle: (ruleId: string, isActive: boolean, disableReason?: string) => Promise<void>;
}) {
  const [selectedReason, setSelectedReason] = useState(currentReason || '');
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (newActive: boolean) => {
    setToggling(true);
    try {
      if (!newActive && rule.disableReasons.length > 0) {
        // Requiere motivo para desactivar
        if (!selectedReason) {
          // Seleccionar primer motivo por defecto
          const reason = rule.disableReasons[0];
          setSelectedReason(reason);
          await onToggle(rule.id, false, reason);
        } else {
          await onToggle(rule.id, false, selectedReason);
        }
      } else {
        await onToggle(rule.id, newActive, undefined);
      }
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center justify-between">
        <Label htmlFor={`toggle-${rule.id}`} className="flex items-center gap-2">
          {isActive ? 'Regla activa' : 'Regla desactivada'}
        </Label>
        <Switch
          id={`toggle-${rule.id}`}
          checked={isActive}
          onCheckedChange={handleToggle}
          disabled={toggling}
        />
      </div>

      {!isActive && rule.disableReasons.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground">Motivo de desactivación:</Label>
          <Select value={selectedReason} onValueChange={async (v) => {
            setSelectedReason(v);
            await onToggle(rule.id, false, v);
          }}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecciona un motivo..." />
            </SelectTrigger>
            <SelectContent>
              {rule.disableReasons.map((reason, i) => (
                <SelectItem key={i} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// Badge de severidad
function SeverityBadge({ severity }: { severity: EditorialRule['severity'] }) {
  const colors: Record<string, string> = {
    '5': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    '4': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    '3': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    '2': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    '1': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[severity]}`}>
      Sev. {severity}
    </span>
  );
}

// Label de acción
function getActionLabel(action: EditorialRule['actionOnFail']): string {
  const labels: Record<string, string> = {
    'reject_regenerate': 'Bloquear y regenerar',
    'reject_explain': 'Bloquear con explicación',
    'warn': 'Advertir',
    'suggest': 'Sugerir'
  };
  return labels[action] || action;
}
