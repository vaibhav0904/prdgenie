@echo off
REM  Double-click me second, after 1-START-HERE.cmd.
REM
REM  Runs every setup step, puts the follow-up transcript on your clipboard, opens your
REM  browser tabs, and opens a page that says GO or exactly what to fix.
REM
REM  Takes about three minutes and costs a few cents in model calls. Run it again before
REM  the recording: the rehearsal uses up the version it prepares for you.
cd /d "%~dp0"
echo.
echo   Setting up. This takes about three minutes -- leave it running.
call "%~dp0run.cmd" deliverables/demo-setup.mjs %*
echo.
echo   Done. Read the page that opened in your browser.
pause
