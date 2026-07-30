@echo off
cd /d "%~dp0"
echo Joining RecCheck parts...
copy /b "RecCheck-win64.zip.000"+"RecCheck-win64.zip.001" "RecCheck-win64.zip" >nul
if exist "RecCheck-win64.zip" (
  echo Done! Right-click RecCheck-win64.zip and Extract All, then run RecCheck.exe inside.
) else (
  echo Something went wrong - make sure both .000 and .001 parts are in this folder.
)
pause
