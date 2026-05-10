@echo off
echo ==============================================
echo Installing necessary files (this might take a minute)...
call "C:\Program Files\nodejs\npm.cmd" install

echo.
echo Starting the Clinic Mentor Copilot server...
echo.
echo You can safely ignore any warnings. DO NOT close this black window!
echo Open your web browser and go to: http://localhost:3000
echo ==============================================
echo.

"C:\Program Files\nodejs\node.exe" server.js
pause
