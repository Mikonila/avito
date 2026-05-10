@echo off
REM 🚀 Montenegro Marketplace - Quick Start Script (Windows)

echo 🚀 Montenegro Marketplace - Быстрый старт
echo ==========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js не установлен
    echo Установите Node.js 18+ с https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js найден: %NODE_VERSION%

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm найден: %NPM_VERSION%
echo.

REM Check if .env exists
if not exist ".env" (
    echo ⚠️  Файл .env не найден
    echo Создаем .env с начальными значениями...
    (
        echo BOT_TOKEN=your_telegram_bot_token_here
        echo WEBAPP_URL=https://your-domain.com
        echo PORT=3000
        echo NODE_ENV=development
        echo DATABASE_URL=./data/marketplace.db
        echo ADMIN_TELEGRAM_ID=your_admin_id
    ) > .env
    echo ✅ .env создан - ОТРЕДАКТИРУЙТЕ ЕГО перед запуском!
    echo.
)

REM Install dependencies
echo 📦 Установка зависимостей...
call npm install

REM Initialize database
echo.
echo 🗄️  Инициализация базы данных...
call node backend/init-db.js

echo.
echo ✅ Установка завершена!
echo.
echo 🚀 Для запуска приложения используйте:
echo    npm start          - Production режим
echo    npm run dev        - Development режим с автоперезагрузкой
echo    npm run bot        - Запуск Telegram бота
echo.
echo 📱 Приложение будет доступно на:
echo    http://localhost:3000
echo.
echo 💡 Помните:
echo    • Установите BOT_TOKEN в .env
echo    • Установите WEBAPP_URL на ваш домен
echo    • Используйте HTTPS в production
echo.
pause
