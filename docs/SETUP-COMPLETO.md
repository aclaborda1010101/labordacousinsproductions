# 🎬 Laborda Cousins Productions - Setup Completo

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  React + Vite + TypeScript + TailwindCSS + shadcn/ui            │
│  Repo: GitHub → Deploy: (Lovable/Vercel/local)                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ API calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE CLOUD                               │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │   PostgreSQL DB     │    │     Edge Functions (Deno)       │ │
│  │   - projects        │    │     - generate-script           │ │
│  │   - scenes          │    │     - expand-beats-to-scenes    │ │
│  │   - characters      │    │     - develop-structure         │ │
│  │   - project_outlines│    │     - parse-script              │ │
│  │   - ...             │    │     - (40+ funciones)           │ │
│  └─────────────────────┘    └──────────────┬──────────────────┘ │
└────────────────────────────────────────────┼────────────────────┘
                                             │ LLM calls
                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AI PROVIDERS                                 │
│  Google AI (Gemini) ← Prioridad 1                               │
│  OpenAI (GPT-4o)    ← Fallback                                  │
│  Anthropic (Claude) ← Fallback                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. GitHub (Código Fuente)

| Campo | Valor |
|-------|-------|
| **Repositorio** | `https://github.com/aclaborda1010101/labordacousinsproductions.git` |
| **Usuario GitHub** | `aclaborda1010101` |
| **Rama principal** | `main` |

### Clonar:
```bash
git clone https://github.com/aclaborda1010101/labordacousinsproductions.git
cd labordacousinsproductions
npm install
```

---

## 2. Supabase (Backend + DB)

| Campo | Valor |
|-------|-------|
| **Project ID** | `vzufllbzkavqupwlvjqs` |
| **URL** | `https://vzufllbzkavqupwlvjqs.supabase.co` |
| **Dashboard** | `https://supabase.com/dashboard/project/vzufllbzkavqupwlvjqs` |
| **Region** | (ver dashboard) |

### Credenciales Públicas (Frontend)

```env
VITE_SUPABASE_URL=https://vzufllbzkavqupwlvjqs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dWZsbGJ6a2F2cXVwd2x2anFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Mzg1MjgsImV4cCI6MjA4NTExNDUyOH0.zFRsuZUcbDhErh6XMFxReAD6vAj7J2glIkb6EspbxJg
```

> ⚠️ El **anon key** es público y puede estar en el código. El **service_role key** es SECRETO y solo para backend.

### Service Role Key (SECRETO - Backend)

Para obtenerlo:
1. Ve a Supabase Dashboard → Settings → API
2. Copia el `service_role` key (empieza con `eyJ...`)
3. NUNCA lo pongas en el frontend

### Supabase Access Token (para deploy de funciones)

```bash
# Para deployar Edge Functions necesitas el token personal
# Se configura con:
$env:SUPABASE_ACCESS_TOKEN = "sbp_XXXXXXXXX"

# O login interactivo:
npx supabase login
```

Para obtener el token:
1. Ve a https://supabase.com/dashboard/account/tokens
2. Crea un nuevo token
3. Guárdalo seguro

---

## 3. API Keys (IA - Secretos en Supabase)

Las Edge Functions usan estas API keys que están configuradas como **secrets** en Supabase:

| Variable | Descripción | Cómo obtener |
|----------|-------------|--------------|
| `GOOGLE_AI_API_KEY` | Google AI (Gemini) - **PRIORITARIO** | https://aistudio.google.com/apikey |
| `OPENAI_API_KEY` | OpenAI (fallback) | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | Claude (fallback) | https://console.anthropic.com/settings/keys |
| `REPLICATE_API_TOKEN` | Generación de imágenes | https://replicate.com/account/api-tokens |

### Configurar secrets en Supabase:

```bash
# Desde CLI:
npx supabase secrets set GOOGLE_AI_API_KEY=AIza... --project-ref vzufllbzkavqupwlvjqs
npx supabase secrets set OPENAI_API_KEY=sk-... --project-ref vzufllbzkavqupwlvjqs
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref vzufllbzkavqupwlvjqs
npx supabase secrets set REPLICATE_API_TOKEN=r8_... --project-ref vzufllbzkavqupwlvjqs

# O desde Dashboard:
# Supabase → Edge Functions → Secrets
```

---

## 4. Estructura del Proyecto

```
labordacousinsproductions/
├── src/                          # Frontend React + TypeScript
│   ├── components/               # Componentes UI
│   ├── hooks/                    # Custom hooks
│   ├── integrations/supabase/    # Cliente Supabase
│   └── pages/                    # Páginas/rutas
│
├── supabase/
│   ├── functions/                # Edge Functions (Deno)
│   │   ├── _shared/              # Código compartido
│   │   │   └── lovable-compat.ts # Capa de compatibilidad AI
│   │   ├── generate-script/      # Generación de guiones
│   │   ├── expand-beats-to-scenes/ # Expansión de escenas
│   │   └── ...                   # +40 funciones más
│   │
│   ├── migrations/               # Migraciones SQL
│   └── config.toml               # Config de funciones
│
├── reference/screenplays/        # Guiones de referencia
├── docs/                         # Documentación
├── .env                          # Variables de entorno (local)
└── package.json
```

---

## 5. Capa de Compatibilidad AI (lovable-compat.ts)

El archivo `supabase/functions/_shared/lovable-compat.ts` abstrae la conexión a múltiples proveedores de IA:

```typescript
// Prioridad de APIs:
// 1. GOOGLE_AI_API_KEY → Gemini 2.0 Flash (más barato)
// 2. OPENAI_API_KEY → GPT-4o
// 3. ANTHROPIC_API_KEY → Claude Sonnet 4
// 4. LOVABLE_API_KEY → Gateway Lovable (fallback)
```

**Uso en funciones:**
```typescript
import { chatCompletion, initLovableCompat } from "../_shared/lovable-compat.ts";

// Inicializar (opcional, para interceptar fetch global)
initLovableCompat();

// Llamar a la IA
const response = await chatCompletion({
  model: "google/gemini-2.5-flash",
  messages: [{ role: "user", content: "..." }],
  max_tokens: 4096,
});
```

---

## 6. Comandos Útiles

### Desarrollo Local
```bash
npm run dev                    # Servidor dev (http://localhost:5173)
npm run build                  # Build producción
npm run preview                # Preview del build
```

### Supabase CLI
```bash
# Login
npx supabase login

# Ligar proyecto
npx supabase link --project-ref vzufllbzkavqupwlvjqs

# Deploy función específica
npx supabase functions deploy generate-script --project-ref vzufllbzkavqupwlvjqs

# Deploy TODAS las funciones
npx supabase functions deploy --project-ref vzufllbzkavqupwlvjqs

# Ver logs
npx supabase functions logs expand-beats-to-scenes --project-ref vzufllbzkavqupwlvjqs

# Servir funciones localmente
npx supabase functions serve
```

### Git
```bash
git pull origin main
git add .
git commit -m "mensaje"
git push origin main
```

---

## 7. Flujo de Autenticación

1. Usuario se registra/loguea → Supabase Auth
2. Frontend obtiene token JWT
3. Cada request a Edge Functions incluye token
4. Funciones validan el token con Supabase

```typescript
// En el frontend:
const { data: { session } } = await supabase.auth.getSession();

// El cliente Supabase automáticamente incluye el token en headers
const { data, error } = await supabase.functions.invoke('generate-script', {
  body: { projectId, ... }
});
```

---

## 8. Base de Datos (Tablas principales)

| Tabla | Descripción |
|-------|-------------|
| `projects` | Proyectos de cine/TV |
| `project_outlines` | Estructuras/outlines de guión |
| `scenes` | Escenas individuales |
| `characters` | Personajes del proyecto |
| `locations` | Localizaciones |
| `script_batches` | Batches de generación |
| `generation_jobs` | Cola de trabajos de IA |

---

## 9. Para Replicar en Otro Clawdbot

### Mínimo necesario:
1. Acceso al repo GitHub
2. Supabase Project ID + anon key (públicos)
3. Para deploy de funciones: Supabase Access Token

### Para desarrollo completo:
1. Todo lo anterior
2. API keys de IA (Google/OpenAI/Anthropic)
3. Service Role Key (para operaciones admin)

### Archivo .env mínimo:
```env
VITE_SUPABASE_URL=https://vzufllbzkavqupwlvjqs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dWZsbGJ6a2F2cXVwd2x2anFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Mzg1MjgsImV4cCI6MjA4NTExNDUyOH0.zFRsuZUcbDhErh6XMFxReAD6vAj7J2glIkb6EspbxJg
```

---

## 10. IDs de Prueba

| Item | ID |
|------|-----|
| Proyecto "Los Reyes Magos" | `a77efec7-e49f-4528-9e19-2f97c1dffb84` |

---

*Última actualización: 2026-01-28*
