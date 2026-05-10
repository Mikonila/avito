@echo off
REM Railway Deployment Assistant for Windows
REM This script helps setup Railway deployment on Windows

echo.
echo 🚀 Railway Deployment Assistant ^(Windows^)
echo =======================================
echo.

REM Check if git is initialized
if not exist ".git" (
    echo ❌ Git repository not found!
    echo Run: git init
    pause
    exit /b 1
)

REM Check if Railway CLI is installed
where railway >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo 📦 Installing Railway CLI...
    npm install -g @railway/cli
)

REM Get current git status
echo 📁 Current repository status:
git status --short | findstr /R /N . | findstr /R "^[1-9]" > temp.txt
for /f "tokens=*" %%A in ('type temp.txt') do (
    echo %%A
)
del temp.txt 2>nul
echo.

REM Prompt for Railway token
echo 🔑 Setting up Railway token...
echo 1. Go to https://railway.app/dashboard
echo 2. Click on Account ^(bottom left^)
echo 3. Click on Tokens
echo 4. Create new token
echo.

set /p railway_token="Enter your Railway token: "
if "%railway_token%"=="" (
    echo ❌ Railway token is required!
    pause
    exit /b 1
)

REM Login to Railway
call railway login --token %railway_token%

REM Initialize Railway project
echo.
echo 🌐 Initializing Railway project...
call railway init

REM Set up environment variables
echo.
echo ⚙️  Setting up environment variables...
echo.
echo Required environment variables:
echo   - BOT_TOKEN: Your Telegram bot token from @BotFather
echo   - WEBAPP_URL: Your deployed app URL ^(e.g., https://your-app.railway.app^)
echo   - PORT: Should be 3000 ^(default^)
echo   - NODE_ENV: production
echo.

set /p bot_token="Enter BOT_TOKEN: "
set /p webapp_url="Enter WEBAPP_URL: "

if not "%bot_token%"=="" (
    call railway variables set BOT_TOKEN=%bot_token%
)

if not "%webapp_url%"=="" (
    call railway variables set WEBAPP_URL=%webapp_url%
)

call railway variables set PORT=3000
call railway variables set NODE_ENV=production

echo.
echo ✅ Environment variables set!
echo.

REM Show current configuration
echo 📋 Current configuration:
call railway variables

echo.
echo 🚀 Ready to deploy!
echo.
echo Next steps:
echo 1. Push your code to GitHub: git push
echo 2. Connect Railway project to your GitHub repo
echo 3. Railway will automatically deploy on push
echo.
echo Documentation: https://railway.app/docs
echo.
pause
