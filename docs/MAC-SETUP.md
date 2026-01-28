# 🖥️ Setup Mac para Laborda Cousins Productions

## 1. Prerrequisitos

```bash
# Instalar Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalar Node.js
brew install node

# Instalar Git
brew install git
```

## 2. Clonar el Repositorio

```bash
git clone https://github.com/labordacousinsproductions/labordacousinsproductions.git
cd labordacousinsproductions
npm install
```

## 3. Variables de Entorno

Crear archivo `.env.local`:

```env
# Supabase
VITE_SUPABASE_URL=https://vzufllbzkavqupwlvjqs.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6dWZsbGJ6a2F2cXVwd2x2anFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Mzg1MjgsImV4cCI6MjA4NTExNDUyOH0.zFRsuZUcbDhErh6XMFxReAD6vAj7J2glIkb6EspbxJg

# AI APIs (para desarrollo local)
OPENAI_API_KEY=<tu-key>
ANTHROPIC_API_KEY=<tu-key>
GOOGLE_AI_API_KEY=<tu-key>
```

## 4. Supabase CLI (para deploy de funciones)

```bash
# Instalar
npm install -g supabase

# Login
npx supabase login

# Ligar proyecto
npx supabase link --project-ref vzufllbzkavqupwlvjqs
```

## 5. Desarrollo Local

```bash
# Iniciar servidor de desarrollo
npm run dev

# La app estará en http://localhost:5173
```

## 6. Deploy de Edge Functions

```bash
# Deploy una función específica
npx supabase functions deploy generate-script --project-ref vzufllbzkavqupwlvjqs

# Deploy todas las funciones
npx supabase functions deploy --project-ref vzufllbzkavqupwlvjqs
```

## 7. Clawdbot (Jarvis)

```bash
# Instalar Clawdbot
npm install -g clawdbot

# Configurar
clawdbot init

# Copiar la carpeta ~/clawd desde el PC con:
# - AGENTS.md, SOUL.md, USER.md, MEMORY.md
# - memory/STATE.json
# - Cualquier otro archivo de contexto
```

## 8. Estructura del Proyecto

```
labordacousinsproductions/
├── src/                    # Frontend React
├── supabase/functions/     # Edge Functions (backend)
├── reference/screenplays/  # Guiones de referencia
├── docs/                   # Documentación
└── .env.local             # Variables locales
```

## 9. IDs Importantes

- **Supabase Project**: vzufllbzkavqupwlvjqs
- **Proyecto "Los Reyes Magos"**: a77efec7-e49f-4528-9e19-2f97c1dffb84

## 10. Comandos Útiles

```bash
# Ver logs de funciones
npx supabase functions logs <nombre-funcion> --project-ref vzufllbzkavqupwlvjqs

# Servir funciones localmente
npx supabase functions serve

# Build del frontend
npm run build
```

---
Última actualización: 2026-01-28
