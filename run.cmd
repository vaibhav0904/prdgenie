@echo off
setlocal
REM PRD Genie launcher.
REM
REM Why this exists (BUG-010): the documented commands all begin with `node`, and twice
REM now that has been unrunnable for the person they were written for.
REM   - BUG-002: `npm run ...` is blocked by Windows default PowerShell execution policy.
REM   - BUG-010: `node ...` fails in any shell started before Node was installed, because
REM     a process inherits PATH at launch and never re-reads it. VS Code caches it for
REM     every terminal it opens, so "open a new tab" is not enough.
REM
REM A .cmd file is not a PowerShell script, so no execution policy applies, and it finds
REM node itself rather than trusting PATH. Both failure modes are gone.
REM
REM IN POWERSHELL YOU MUST TYPE  .\run.cmd  -- PowerShell does not search the current
REM directory, so a bare `run.cmd` gives the same "not recognized" error as before.
REM
REM THIS FILE MUST KEEP CRLF LINE ENDINGS. cmd.exe seeks through a batch file by byte
REM offset; with LF-only endings it lands mid-token and reports nonsense like
REM "'tlocal' is not recognized". .gitattributes pins it.
REM
REM Usage:  .\run.cmd                          check the environment
REM         .\run.cmd <script.mjs> [args...]    run it with --env-file-if-exists=.env

cd /d "%~dp0"

set "NODE_EXE="

REM 1. PATH, if this shell happens to have it.
for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "NODE_EXE=%%~$PATH:I"

REM 2. winget install location (how Node got here in E1-S1), any version.
if not defined NODE_EXE (
  for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS*") do (
    for /d %%V in ("%%~fD\node-v*-win-x64") do (
      if exist "%%~fV\node.exe" set "NODE_EXE=%%~fV\node.exe"
    )
  )
)

REM 3. The official installer location.
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"

if defined NODE_EXE goto :found
echo.
echo   Could not find node.exe anywhere.
echo.
echo   PRD Genie needs Node 22 or newer. Install it with:
echo       winget install OpenJS.NodeJS.LTS
echo   then open a NEW terminal ^(a running one never re-reads PATH^).
echo.
exit /b 127

:found
REM No parentheses around what follows. Inside a ( ) block %ERRORLEVEL% is expanded when
REM the block is PARSED, not when it runs, so it is always the value from before the
REM command -- always 0. That silently swallows every failing exit code, and this project
REM depends on a failing eval being a non-zero exit (evals/README.md rule 6).
if "%~1"=="" goto :preflight

"%NODE_EXE%" --env-file-if-exists=.env %*
exit /b %ERRORLEVEL%

:preflight
"%NODE_EXE%" --env-file-if-exists=.env review-ui\scripts\preflight.mjs
exit /b %ERRORLEVEL%
