#!/bin/bash

# Railway Deployment Assistant
# This script helps setup Railway deployment

echo "🚀 Railway Deployment Assistant"
echo "==============================="
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Git repository not found!"
    echo "Run: git init"
    exit 1
fi

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Get current git status
echo "📁 Current repository status:"
git status --short | head -10
echo ""

# Prompt for Railway token
echo "🔑 Setting up Railway token..."
echo "1. Go to https://railway.app/dashboard"
echo "2. Click on Account (bottom left)"
echo "3. Click on Tokens"
echo "4. Create new token"
echo ""
read -p "Enter your Railway token: " railway_token

if [ -z "$railway_token" ]; then
    echo "❌ Railway token is required!"
    exit 1
fi

# Login to Railway
railway login --token "$railway_token"

# Initialize Railway project
echo ""
echo "🌐 Initializing Railway project..."
railway init

# Set up environment variables
echo ""
echo "⚙️  Setting up environment variables..."
echo ""
echo "Required environment variables:"
echo "  - BOT_TOKEN: Your Telegram bot token from @BotFather"
echo "  - WEBAPP_URL: Your deployed app URL (e.g., https://your-app.railway.app)"
echo "  - PORT: Should be 3000 (default)"
echo "  - NODE_ENV: production"
echo ""

read -p "Enter BOT_TOKEN: " bot_token
read -p "Enter WEBAPP_URL: " webapp_url

if [ -n "$bot_token" ]; then
    railway variables set BOT_TOKEN="$bot_token"
fi

if [ -n "$webapp_url" ]; then
    railway variables set WEBAPP_URL="$webapp_url"
fi

railway variables set PORT=3000
railway variables set NODE_ENV=production

echo ""
echo "✅ Environment variables set!"
echo ""

# Show current configuration
echo "📋 Current configuration:"
railway variables

echo ""
echo "🚀 Ready to deploy!"
echo ""
echo "Next steps:"
echo "1. Push your code to GitHub: git push"
echo "2. Connect Railway project to your GitHub repo"
echo "3. Railway will automatically deploy on push"
echo ""
echo "Documentation: https://railway.app/docs"
