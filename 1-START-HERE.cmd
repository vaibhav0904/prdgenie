@echo off
REM  Double-click me first.
REM
REM  This starts the two things the demo needs and then STAYS OPEN. The window that stays
REM  open IS the app running -- it is not stuck and it is not waiting for you to type.
REM  Leave it alone, minimise it, and go double-click 2-SET-UP-THE-DEMO.cmd.
REM
REM  Safe to double-click twice: the service answers "ALREADY RUNNING" and exits cleanly
REM  rather than throwing a stack trace at you (BUG-074).
cd /d "%~dp0"
echo.
echo   ============================================================
echo     THIS WINDOW IS THE APP. Leave it open. Do not type in it.
echo     Next: go and double-click  2-SET-UP-THE-DEMO.cmd
echo   ============================================================
echo.
echo   Starting the workflow engine...
docker start n8n-local
echo.
echo   Starting the app...
call "%~dp0run.cmd" review-ui/server.js
echo.
if not "%ERRORLEVEL%"=="0" goto :broke
echo   Nothing more to do in this window.
echo.
echo   If it said ALREADY RUNNING, the app is still going in a window you opened
echo   earlier. Leave that one open and carry on.
echo   If it printed an address and then stopped, the app has shut down: double-click
echo   this file again to start it back up.
goto :end
:broke
echo   SOMETHING WENT WRONG above, and the app is not running.
echo.
echo   Read the last few lines, then close this window and double-click this file again.
:end
pause
