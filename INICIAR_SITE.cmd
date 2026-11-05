@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Base do Suporte
cd /d "%~dp0"
if errorlevel 1 goto :falha

where node >nul 2>nul
if errorlevel 1 goto :sem_node
node -e "if(Number(process.versions.node.split('.')[0])!==24)process.exit(1)" >nul 2>nul
if errorlevel 1 goto :sem_node
where npm >nul 2>nul
if errorlevel 1 goto :sem_node

if not exist "src\server.js" goto :sem_api
if not exist "package-lock.json" goto :sem_api
for %%I in ("%~dp0..\support-repository") do set "FRONTEND_DIR=%%~fI"
if not exist "%FRONTEND_DIR%\package-lock.json" goto :sem_frontend

if not exist ".env" (
  if not exist ".env.example" goto :sem_api
  copy ".env.example" ".env" >nul
  if errorlevel 1 goto :falha
)

node --env-file=.env -e "const net=require('node:net');const server=net.createServer();server.once('error',()=>process.exit(1));server.listen(Number(process.env.PORT||1992),process.env.HOST||'0.0.0.0',()=>server.close());"
if errorlevel 1 goto :porta_ocupada

echo [1/4] Conferindo dependencias da API...
call :dependencias "%~dp0." "--omit=dev"
if errorlevel 1 goto :falha

echo [2/4] Preparando o frontend...
call :dependencias "%FRONTEND_DIR%" "--include=dev"
if errorlevel 1 goto :falha
pushd "%FRONTEND_DIR%"
if errorlevel 1 goto :falha
call npm run build
if errorlevel 1 (
  popd
  goto :falha
)
popd

echo [3/4] Preparando o conteudo inicial...
call npm run seed
if errorlevel 1 goto :falha

echo [4/4] Iniciando a Base do Suporte...
echo.
node --env-file=.env -e "console.log('Abra no navegador: '+(process.env.PUBLIC_ORIGIN||('http://localhost:'+(process.env.PORT||1992))));"
echo Administracao: /admin
echo Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.
echo.
call npm start
if errorlevel 1 goto :falha
exit /b 0

:dependencias
pushd "%~1"
if errorlevel 1 exit /b 1
node -e "const fs=require('node:fs'),crypto=require('node:crypto');try{const hash=crypto.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex');process.exit(fs.readFileSync('node_modules/.base-support-lock.sha256','utf8')===hash?0:1)}catch{process.exit(1)}" >nul 2>nul
if errorlevel 1 goto :instalar_dependencias
call npm ls --depth=0 %~2 >nul 2>nul
if errorlevel 1 goto :instalar_dependencias
popd
exit /b 0

:instalar_dependencias
call npm ci %~2
if errorlevel 1 (
  popd
  exit /b 1
)
node -e "const fs=require('node:fs'),crypto=require('node:crypto');fs.writeFileSync('node_modules/.base-support-lock.sha256',crypto.createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex'));"
if errorlevel 1 (
  popd
  exit /b 1
)
popd
exit /b 0

:sem_node
echo.
echo ERRO: instale o Node.js 24 com o npm e abra este arquivo novamente.
goto :falha

:sem_api
echo.
echo ERRO: coloque INICIAR_SITE.cmd dentro de support-repository-api.
echo Use a versao Express do PR, que contem src\server.js e .env.example.
goto :falha

:sem_frontend
echo.
echo ERRO: a pasta support-repository deve ficar ao lado de support-repository-api.
echo Use tambem a versao do frontend do PR da Base do Suporte.
goto :falha

:porta_ocupada
echo.
echo ERRO: a porta configurada no .env esta em uso ou indisponivel.
echo Encerre a outra instancia antes de iniciar esta versao.
echo Nenhum processo foi encerrado automaticamente.
goto :falha

:falha
echo.
echo A Base do Suporte nao foi iniciada. Confira a mensagem acima.
pause
exit /b 1
