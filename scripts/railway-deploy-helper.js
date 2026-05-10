#!/usr/bin/env node

/**
 * Railway Deployment Helper
 * Автоматизирует деплой на Railway платформу
 * 
 * Использование:
 *   npm run railway-setup        (Linux/macOS)
 *   npm run railway-setup-win    (Windows)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(title) {
  console.log('\n');
  log('═'.repeat(50), 'bright');
  log(`  ${title}`, 'bright');
  log('═'.repeat(50), 'bright');
  console.log();
}

async function checkPrerequisites() {
  logHeader('📋 Проверка требований');

  // Check Node.js
  try {
    const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
    log(`✅ Node.js найден: ${nodeVersion}`, 'green');
  } catch (e) {
    log(`❌ Node.js не установлен!`, 'red');
    log(`   Скачайте с https://nodejs.org`, 'yellow');
    process.exit(1);
  }

  // Check git
  try {
    const gitVersion = execSync('git -v', { encoding: 'utf8' }).trim();
    log(`✅ Git найден: ${gitVersion}`, 'green');
  } catch (e) {
    log(`❌ Git не установлен!`, 'red');
    process.exit(1);
  }

  // Check if git repo exists
  if (!fs.existsSync('.git')) {
    log(`❌ Git репозиторий не найден!`, 'red');
    log(`   Выполните: git init`, 'yellow');
    process.exit(1);
  }

  // Check package.json
  if (!fs.existsSync('package.json')) {
    log(`❌ package.json не найден!`, 'red');
    process.exit(1);
  }

  log(`✅ Все требования выполнены!`, 'green');
}

async function checkRailwayCLI() {
  logHeader('🔍 Проверка Railway CLI');

  try {
    const railwayVersion = execSync('railway --version', { encoding: 'utf8' }).trim();
    log(`✅ Railway CLI установлен: ${railwayVersion}`, 'green');
    return true;
  } catch (e) {
    log(`❌ Railway CLI не установлен`, 'yellow');
    log(`   Устанавливаем...`, 'cyan');
    
    try {
      execSync('npm install -g @railway/cli', { stdio: 'inherit' });
      log(`✅ Railway CLI установлен успешно!`, 'green');
      return true;
    } catch (e) {
      log(`❌ Не удалось установить Railway CLI`, 'red');
      log(`   Установите вручную: npm install -g @railway/cli`, 'yellow');
      return false;
    }
  }
}

async function gitSetup() {
  logHeader('📦 Git Setup');

  try {
    const status = execSync('git status --short', { encoding: 'utf8' });
    if (status) {
      log(`📝 Обнаружены изменения:`, 'yellow');
      console.log(status);
      const add = await question('Добавить все файлы? (y/n): ');
      
      if (add.toLowerCase() === 'y') {
        execSync('git add .', { stdio: 'inherit' });
        const message = await question('Введите сообщение коммита: ');
        execSync(`git commit -m "${message}"`, { stdio: 'inherit' });
        log(`✅ Файлы закоммичены`, 'green');
      }
    } else {
      log(`✅ Нет новых изменений`, 'green');
    }
  } catch (e) {
    log(`⚠️  Git ошибка (игнорируем)`, 'yellow');
  }

  // Check if remote exists
  try {
    execSync('git remote get-url origin', { encoding: 'utf8', stdio: 'pipe' });
    log(`✅ Remote репозиторий уже настроен`, 'green');
  } catch (e) {
    log(`❌ Remote репозиторий не настроен`, 'yellow');
    const remote = await question('Введите URL GitHub репозитория: ');
    execSync(`git remote add origin ${remote}`, { stdio: 'inherit' });
  }

  // Push to GitHub
  const push = await question('Отправить код на GitHub? (y/n): ');
  if (push.toLowerCase() === 'y') {
    try {
      execSync('git branch -M main', { stdio: 'inherit' });
      execSync('git push -u origin main', { stdio: 'inherit' });
      log(`✅ Код отправлен на GitHub!`, 'green');
    } catch (e) {
      log(`⚠️  Ошибка при отправке кода (возможно, уже загружен)`, 'yellow');
    }
  }
}

async function railwayLogin() {
  logHeader('🔑 Railway Вход');

  log(`Необходимо авторизоваться в Railway`, 'cyan');
  log(`1. Перейдите на https://railway.app`, 'yellow');
  log(`2. Нажмите "Login" → "GitHub"`, 'yellow');
  log(`3. Авторизуйтесь`, 'yellow');
  
  const useToken = await question('Использовать Railway токен? (y/n): ');
  
  if (useToken.toLowerCase() === 'y') {
    log(`Инструкция по получению токена:`, 'cyan');
    log(`1. На Railway Dashboard нажмите Account (внизу левого меню)`, 'yellow');
    log(`2. Нажмите "Tokens"`, 'yellow');
    log(`3. Создайте новый токен`, 'yellow');
    log(`4. Скопируйте его`, 'yellow');
    
    const token = await question('Введите Railway токен: ');
    
    if (token) {
      try {
        execSync(`railway login --token "${token}"`, { stdio: 'inherit' });
        log(`✅ Авторизованы в Railway!`, 'green');
        return true;
      } catch (e) {
        log(`❌ Не удалось авторизоваться`, 'red');
        return false;
      }
    }
  } else {
    try {
      execSync('railway login', { stdio: 'inherit' });
      log(`✅ Авторизованы в Railway!`, 'green');
      return true;
    } catch (e) {
      log(`❌ Не удалось авторизоваться`, 'red');
      return false;
    }
  }
}

async function railwayProject() {
  logHeader('🌐 Создание Railway Проекта');

  try {
    const projects = execSync('railway project list', { encoding: 'utf8' });
    log(`Текущие проекты:`, 'cyan');
    console.log(projects);
    
    const useExisting = await question('Использовать существующий проект? (y/n): ');
    if (useExisting.toLowerCase() === 'y') {
      const projectId = await question('Введите ID проекта: ');
      execSync(`railway project switch ${projectId}`, { stdio: 'inherit' });
      log(`✅ Проект выбран!`, 'green');
    } else {
      const projectName = await question('Введите имя нового проекта: ');
      execSync(`railway project create ${projectName}`, { stdio: 'inherit' });
      log(`✅ Проект создан!`, 'green');
    }
  } catch (e) {
    log(`❌ Ошибка при работе с проектами`, 'red');
    return false;
  }
  return true;
}

async function setupEnvironment() {
  logHeader('⚙️  Настройка переменных окружения');

  const variables = {
    BOT_TOKEN: {
      question: 'Введите BOT_TOKEN (от @BotFather в Telegram): ',
      required: true
    },
    WEBAPP_URL: {
      question: 'Введите WEBAPP_URL (https://your-app.railway.app): ',
      required: true
    },
    PORT: {
      question: 'Введите PORT (обычно 3000): ',
      default: '3000'
    },
    NODE_ENV: {
      question: 'Введите NODE_ENV (обычно production): ',
      default: 'production'
    },
    ADMIN_TELEGRAM_ID: {
      question: 'Введите ADMIN_TELEGRAM_ID (ваш Telegram ID): ',
      required: false
    }
  };

  for (const [key, config] of Object.entries(variables)) {
    let value;
    if (config.default) {
      value = await question(`${config.question} [${config.default}]: `);
      value = value || config.default;
    } else {
      value = await question(config.question);
    }

    if (!value && config.required) {
      log(`❌ ${key} обязателен!`, 'red');
      process.exit(1);
    }

    if (value) {
      try {
        execSync(`railway variables set ${key}="${value}"`, { stdio: 'pipe' });
        const masked = key === 'BOT_TOKEN' ? value.substring(0, 10) + '***' : value;
        log(`✅ ${key} = ${masked}`, 'green');
      } catch (e) {
        log(`⚠️  Не удалось установить ${key}`, 'yellow');
      }
    }
  }

  log(`\n✅ Переменные окружения установлены!`, 'green');
}

async function deploy() {
  logHeader('🚀 Деплой приложения');

  try {
    log(`Инициализируем Railway для этого репозитория...`, 'cyan');
    execSync('railway init', { stdio: 'inherit' });
    
    log(`Начинаем деплой...`, 'cyan');
    execSync('railway up', { stdio: 'inherit' });
    
    log(`✅ Деплой завершен!`, 'green');
    return true;
  } catch (e) {
    log(`❌ Ошибка при деплое`, 'red');
    return false;
  }
}

async function getDashboardURL() {
  logHeader('📊 Информация о деплое');

  try {
    const info = execSync('railway status', { encoding: 'utf8' });
    log(info, 'cyan');
    
    log(`\n📌 Полезные команды:`, 'bright');
    log(`  railway logs         - Просмотр логов приложения`, 'cyan');
    log(`  railway variables    - Просмотр переменных окружения`, 'cyan');
    log(`  railway restart      - Перезагрузка приложения`, 'cyan');
    log(`  railway remove       - Удаление проекта`, 'cyan');
    
    log(`\n🔗 Railway Dashboard:`, 'bright');
    log(`  https://railway.app/dashboard`, 'cyan');
    
  } catch (e) {
    log(`⚠️  Не удалось получить информацию о статусе`, 'yellow');
  }
}

async function main() {
  console.clear();
  log('╔════════════════════════════════════════════════════════╗', 'bright');
  log('║  🚀 Montenegro Marketplace - Railway Deployment Helper ║', 'bright');
  log('╚════════════════════════════════════════════════════════╝', 'bright');

  try {
    await checkPrerequisites();
    const railwayCLI = await checkRailwayCLI();

    if (!railwayCLI) {
      log(`Установите Railway CLI вручную и повторите попытку`, 'yellow');
      process.exit(0);
    }

    await gitSetup();
    const loggedIn = await railwayLogin();

    if (!loggedIn) {
      log(`Не удалось авторизоваться в Railway`, 'red');
      process.exit(1);
    }

    const projectCreated = await railwayProject();
    if (!projectCreated) {
      log(`Не удалось создать проект Railway`, 'red');
      process.exit(1);
    }

    await setupEnvironment();

    const proceed = await question('\nНачать деплой? (y/n): ');
    if (proceed.toLowerCase() === 'y') {
      const deployed = await deploy();
      if (deployed) {
        await getDashboardURL();
      }
    } else {
      log(`Деплой отменен`, 'yellow');
    }

    logHeader('✅ Готово!');
    log(`Спасибо за использование Railway Deployment Helper!`, 'green');
    
  } catch (error) {
    log(`\n❌ Ошибка: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
