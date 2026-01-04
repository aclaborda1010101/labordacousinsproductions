// Traducciones al español para LC Studio
export const es = {
  // General
  app: {
    name: 'LC Studio',
    tagline: 'Producción cinematográfica impulsada por IA',
  },
  
  // Navegación
  nav: {
    dashboard: 'Panel de Control',
    projects: 'Proyectos',
    dailies: 'Dailies',
    newProject: 'Nuevo Proyecto',
    signOut: 'Cerrar Sesión',
  },

  // Auth
  auth: {
    signIn: 'Iniciar Sesión',
    signUp: 'Registrarse',
    email: 'Correo Electrónico',
    password: 'Contraseña',
    displayName: 'Nombre para Mostrar',
    forgotPassword: '¿Olvidaste tu contraseña?',
    noAccount: '¿No tienes cuenta?',
    hasAccount: '¿Ya tienes cuenta?',
    createAccount: 'Crear Cuenta',
    welcomeBack: 'Bienvenido de nuevo',
    createYourAccount: 'Crea tu cuenta',
  },

  // Dashboard
  dashboard: {
    title: 'Panel de Control',
    subtitle: 'Resumen de tus producciones',
    totalProjects: 'Proyectos Totales',
    activeRenders: 'Renders Activos',
    pendingReview: 'Pendientes de Revisión',
    recentProjects: 'Proyectos Recientes',
    viewAll: 'Ver Todos',
    createFirst: 'Crea tu primer proyecto',
  },

  // Projects
  projects: {
    title: 'Proyectos',
    subtitle: 'Gestiona tus producciones',
    newProject: 'Nuevo Proyecto',
    search: 'Buscar proyectos...',
    noProjects: 'No hay proyectos',
    createFirst: 'Crea tu primer proyecto para comenzar',
    episodes: 'episodios',
    bible: 'Biblia',
    format: {
      series: 'Serie',
      mini: 'Miniserie',
      film: 'Película',
    },
  },

  // New Project Wizard
  newProject: {
    title: 'Nuevo Proyecto',
    subtitle: 'Configura tu nueva producción',
    step1: 'Información Básica',
    step2: 'Episodios',
    step3: 'Idiomas',
    step4: 'Presupuesto',
    projectTitle: 'Título del Proyecto',
    projectTitlePlaceholder: 'Ej: La Gran Aventura',
    format: 'Formato',
    targetDuration: 'Duración Objetivo (minutos)',
    episodeCount: 'Número de Episodios',
    masterLanguage: 'Idioma Principal',
    targetLanguages: 'Idiomas de Destino',
    budgetCap: 'Límite de Presupuesto (EUR)',
    perProject: 'Por Proyecto',
    perEpisode: 'Por Episodio',
    perScene: 'Por Escena',
    next: 'Siguiente',
    back: 'Atrás',
    create: 'Crear Proyecto',
    creating: 'Creando...',
  },

  // Project Detail Tabs
  projectTabs: {
    bible: 'Biblia',
    stylePack: 'Estilo Visual',
    characters: 'Personajes',
    locations: 'Localizaciones',
    scriptImport: 'Importar Guión',
    scenes: 'Escenas',
    renderQueue: 'Cola de Renders',
    costEngine: 'Motor de Costes',
    qcEngine: 'Control de Calidad',
    approvals: 'Aprobaciones',
    team: 'Equipo',
  },

  // Bible Overview
  bible: {
    title: 'Visión General de la Biblia',
    subtitle: 'El canon de tu producción',
    completeness: 'Nivel de Completitud',
    completeToUnlock: 'Completa la biblia al 85% para desbloquear escenas',
    sections: {
      style: 'Estilo Visual',
      characters: 'Personajes',
      locations: 'Localizaciones',
    },
    incomplete: 'Biblia Incompleta',
    completeFirst: 'Completa tu biblia de producción para desbloquear escenas.',
  },

  // Style Pack
  stylePack: {
    title: 'Estilo Visual',
    subtitle: 'Define las reglas visuales de tu producción',
    aspectRatio: 'Relación de Aspecto',
    fps: 'Fotogramas por Segundo',
    lensStyle: 'Estilo de Lente',
    lensStylePlaceholder: 'Ej: Anamórfico, 35mm',
    filmGrain: 'Grano de Película',
    save: 'Guardar Estilo Visual',
    saved: 'Estilo visual guardado',
    saveFailed: 'Error al guardar',
  },

  // Characters
  characters: {
    title: 'Personajes',
    subtitle: 'Define tu reparto para mantener la continuidad',
    addPlaceholder: 'Nombre del personaje',
    add: 'Añadir',
    added: 'Personaje añadido',
    addFailed: 'Error al añadir',
    noCharacters: 'No hay personajes aún',
    noRole: 'Sin rol definido',
  },

  // Locations
  locations: {
    title: 'Localizaciones',
    subtitle: 'Define los escenarios y ambientes',
    addPlaceholder: 'Nombre de la localización',
    add: 'Añadir',
    added: 'Localización añadida',
    addFailed: 'Error al añadir',
    noLocations: 'No hay localizaciones aún',
    noDescription: 'Sin descripción',
  },

  // Scenes
  scenes: {
    title: 'Escenas',
    subtitle: 'Gestiona escenas y planos',
    addScene: 'Añadir Escena',
    addShot: 'Añadir Plano',
    slugline: 'Encabezado de escena',
    shotType: 'Tipo de plano',
    qualityMode: 'Modo de Calidad',
    hero: 'HERO',
    noScenes: 'No hay escenas aún',
    locked: 'Bloqueado',
    lockedMessage: 'Completa tu biblia de producción para gestionar escenas',
    qualityModes: {
      CINE: 'CINE - Producción estándar',
      ULTRA: 'ULTRA - Alta calidad',
      HERO: 'HERO - Listo para tráiler',
    },
  },

  // Script Import
  scriptImport: {
    title: 'Importar Guión',
    subtitle: 'Pega tu guión y deja que la IA lo desglose en escenas',
    placeholder: 'Pega aquí tu guión en formato estándar...',
    parse: 'Analizar con IA',
    parsing: 'Analizando...',
    foundScenes: 'Escenas encontradas',
    import: 'Importar',
    importing: 'Importando...',
    characters: 'caracteres',
    review: 'Revisa las escenas extraídas antes de importar',
    dialogueLines: 'líneas de diálogo',
    formatGuide: 'Guía de Formato',
    recommended: 'Recomendado',
    aiDetection: 'Detección de IA',
  },

  // Render Queue
  renderQueue: {
    title: 'Cola de Renders',
    subtitle: 'Monitoriza renders activos, estado y costes',
    queued: 'En Cola',
    running: 'Ejecutando',
    complete: 'Completado',
    failed: 'Fallido',
    blocked: 'Bloqueado',
    totalCost: 'Coste Total',
    activeRenders: 'Renders Activos',
    backgroundJobs: 'Tareas en Segundo Plano',
    noRenders: 'No hay renders en cola',
    noJobs: 'No hay tareas',
    costBreakdown: 'Desglose de Costes',
    completed: 'Completados',
    inProgress: 'En Progreso',
    wasted: 'Fallidos (Desperdiciados)',
    retry: 'Reintentar',
    cancel: 'Cancelar',
  },

  // Cost Engine
  costEngine: {
    title: 'Motor de Costes',
    subtitle: 'Estimaciones de presupuesto y seguimiento',
    summary: 'Resumen de Costes',
    low: 'Bajo',
    expected: 'Esperado',
    high: 'Alto',
    overBudget: 'Sobre presupuesto',
    underBudget: 'Dentro del presupuesto',
    assumptions: 'Supuestos de Coste',
    pricePerSecond: 'Precio por segundo',
    padding: 'Margen',
    retryRates: 'Tasas de reintento',
    perScene: 'Por Escena',
    editAssumptions: 'Editar Supuestos',
    save: 'Guardar',
  },

  // QC Engine
  qcEngine: {
    title: 'Control de Calidad',
    subtitle: 'Control automático de continuidad, audio y ritmo',
    runCheck: 'Ejecutar Control',
    analyzing: 'Analizando...',
    exportBlocked: 'Exportación Bloqueada',
    exportReady: 'Listo para Exportar',
    belowThreshold: 'La puntuación está por debajo del umbral',
    qualityMet: 'Estándares de calidad cumplidos',
    overallScore: 'Puntuación Global',
    continuity: 'Continuidad',
    audio: 'Audio',
    rhythm: 'Ritmo',
    recentIssues: 'Problemas Recientes',
    noIssues: 'Sin problemas detectados',
    thresholds: 'Umbrales por Modo de Calidad',
    standardProduction: 'Producción estándar',
    premiumQuality: 'Calidad premium',
    trailerReady: 'Listo para tráiler',
    export: 'Exportar Proyecto',
  },

  // Approvals
  approvals: {
    title: 'Flujo de Aprobaciones',
    subtitle: 'Revisa y aprueba escenas y planos antes del render',
    total: 'Total',
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    needsRevision: 'Necesita Revisión',
    scenes: 'Escenas',
    shots: 'Planos',
    noScenes: 'No hay escenas para revisar',
    noShots: 'No hay planos para revisar',
    workflow: 'Flujo de Trabajo',
    awaitingReview: 'Esperando revisión',
    readyForRender: 'Listo para render',
  },

  // Team
  team: {
    title: 'Miembros del Equipo',
    subtitle: 'Gestiona quién tiene acceso al proyecto y sus permisos',
    inviteMember: 'Invitar Miembro',
    projectOwner: 'Propietario del Proyecto',
    fullControl: 'Control total sobre todos los ajustes',
    noMembers: 'No hay miembros del equipo aún',
    inviteCollaborators: 'Invita colaboradores para trabajar en este proyecto',
    emailOrUsername: 'Correo o nombre de usuario',
    role: 'Rol',
    permissions: 'Permisos',
    sendInvite: 'Enviar Invitación',
    inviting: 'Invitando...',
    invited: 'Miembro invitado correctamente',
    inviteFailed: 'Error al invitar',
    roleUpdated: 'Rol actualizado',
    memberRemoved: 'Miembro eliminado',
    rolesReference: 'Referencia de Roles',
    whatEachRoleCan: 'Qué puede hacer cada rol en tu proyecto',
    roles: {
      owner: 'Propietario',
      producer: 'Productor',
      director: 'Director',
      writer: 'Guionista',
      dp: 'Director de Fotografía',
      sound: 'Sonido',
      reviewer: 'Revisor',
    },
    rolePermissions: {
      owner: ['Todos los permisos', 'Eliminar proyecto', 'Gestionar miembros'],
      producer: ['Gestionar presupuesto', 'Aprobar escenas', 'Gestionar calendarios'],
      director: ['Aprobar planos', 'Gestionar escenas', 'Revisar dailies'],
      writer: ['Editar guiones', 'Gestionar personajes', 'Editar diálogos'],
      dp: ['Gestionar cámara', 'Configurar iluminación', 'Composición de planos'],
      sound: ['Revisión de audio', 'Diseño de sonido', 'Cues musicales'],
      reviewer: ['Ver proyecto', 'Añadir comentarios', 'Revisar dailies'],
    },
  },

  // Dailies
  dailies: {
    title: 'Revisión de Dailies',
    subtitle: 'Revisa y califica los renders del día',
    noSessions: 'No hay sesiones de dailies',
    createSession: 'Crear Sesión Demo',
    select: 'Seleccionar',
    fix: 'Corregir',
    reject: 'Rechazar',
    rating: 'Calificación',
    acting: 'Actuación',
    camera: 'Cámara',
    lighting: 'Iluminación',
    sound: 'Sonido',
    feelsReal: 'Realismo',
    addNote: 'Añadir nota en este frame',
    notes: 'Notas',
    noRenders: 'No hay renders para revisar',
  },

  // Version History
  versionHistory: {
    title: 'Historial de Versiones',
    versions: 'versiones',
    saveVersion: 'Guardar Versión',
    noVersions: 'No hay versiones guardadas',
    saveInitial: 'Guardar Versión Inicial',
    version: 'Versión',
    noDescription: 'Sin descripción',
    compare: 'Comparar con',
    rollback: 'Restaurar esta versión',
    rollingBack: 'Restaurando...',
    comparing: 'Comparando Versiones',
    added: 'añadido',
    removed: 'eliminado',
    changed: 'cambiado',
    noDifferences: 'Sin diferencias',
  },

  // Common
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Añadir',
    close: 'Cerrar',
    loading: 'Cargando...',
    saving: 'Guardando...',
    success: 'Éxito',
    error: 'Error',
    confirm: 'Confirmar',
    search: 'Buscar',
    filter: 'Filtrar',
    all: 'Todos',
    none: 'Ninguno',
    yes: 'Sí',
    no: 'No',
    or: 'o',
    and: 'y',
  },

  // Errors
  errors: {
    generic: 'Ha ocurrido un error',
    notFound: 'No encontrado',
    unauthorized: 'No autorizado',
    rateLimited: 'Demasiadas solicitudes. Inténtalo más tarde.',
    paymentRequired: 'Créditos agotados. Añade más para continuar.',
  },

  // Language selector
  language: {
    select: 'Idioma',
    es: 'Español',
    en: 'English',
  },
};

export type Translations = typeof es;
export default es;
