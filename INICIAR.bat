@echo off
setlocal
cd /d "%~dp0"
node -e "if(Number(process.versions.node.split('.')[0])!==24)process.exit(1)" >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 antes de iniciar.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --omit=dev
  if errorlevel 1 exit /b 1
)
if not exist ..\support-repository\dist\index.html (
  echo Compile o frontend: entre em support-repository e execute npm ci e npm run build.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
call npm run seed
if errorlevel 1 exit /b 1
echo Base do Suporte - HTTP na porta 1992. Administracao em /admin.
call npm start
if errorlevel 1 pause
