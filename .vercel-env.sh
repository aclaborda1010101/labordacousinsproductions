#!/bin/bash

echo "🔧 Configurando variables de entorno en Vercel..."

# Leer variables del .env local
source .env

# Configurar variables en Vercel
echo "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" | npx vercel env add VITE_SUPABASE_URL production --stdin
echo "VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY" | npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --stdin
echo "VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID" | npx vercel env add VITE_SUPABASE_PROJECT_ID production --stdin

echo "✅ Variables configuradas. Realizando redeploy..."
npx vercel --prod

echo "🎉 Deploy completado con variables de entorno!"