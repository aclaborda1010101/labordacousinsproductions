#!/bin/bash

echo "🔧 Configurando LC Studio iOS App..."

# Configurar Xcode developer tools
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Verificar configuración
echo "📱 Verificando configuración..."
xcode-select -p

# Build el proyecto
echo "🏗️ Building proyecto..."
cd ios/App && xcodebuild -scheme App -configuration Release -destination generic/platform=iOS build

echo "✅ Setup completado. Abre Xcode con: npx cap open ios"