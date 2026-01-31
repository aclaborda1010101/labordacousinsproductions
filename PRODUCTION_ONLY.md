# 🌐 LC STUDIO - SOLO PRODUCCIÓN

**CONFIGURACIÓN:** Solo usar entorno de producción

## 📍 URL ÚNICA
**https://lc-studio-real.vercel.app/dashboard**

## 🚫 ENTORNO LOCAL DESHABILITADO
- ❌ No usar `npm run dev`
- ❌ No usar `http://localhost:8082`
- ✅ Solo producción para todo

## 🔄 WORKFLOW SIMPLIFICADO

### Para hacer cambios:
```bash
cd ~/clawd/lc-studio-real

# 1. Hacer cambios al código
git add .
git commit -m "feat: descripción del cambio"
git push

# 2. Esperar auto-deploy (2-3 min)
# 3. Verificar en https://lc-studio-real.vercel.app
```

### Para verificar deploy:
```bash
npx vercel inspect --wait    # Esperar a que termine
npx vercel logs              # Ver logs si hay problemas
```

## ✅ VENTAJAS
- 🎯 **Una sola URL** - sin confusión
- 🌐 **Acceso desde cualquier lugar**
- ⚡ **Siempre disponible** 24/7
- 🔄 **Deploy automático** via Git
- 🤝 **Fácil de compartir**

## 📊 MONITOREO
- Deploy status: npx vercel inspect
- Variables: npx vercel env ls
- Logs: npx vercel logs [deployment]

---
**CONFIGURADO:** 2026-01-31 - Solo producción activa