; reccheck.nsi -- RecCheck installer.  NSIS 3.09, Unicode, solid LZMA, MUI2.
;
; RECONSTRUCTED on 2026-09-05 from the shipped 1.17.38 installer: the original
; script lived only in a previous container's scratchpad and was lost.  It was
; rebuilt from the installer's decoded header (nsisdump.py next to this file:
; pages, section, every entry, strings, language table, uninstaller header,
; data-block walk) and from the exe stub (icon, manifest), not from memory.
;
; Equivalence was checked by building this script with the same makensis
; 3.09-4 against the same payload and diffing the two decoded headers
; (installer and uninstaller), the two exe stubs and the per-file payload
; hashes -- see REPORT.md and equivalence.diff.
;
; Build:   cd <this dir> && makensis -DSTAGE=<unpacked payload dir> [-DVERSION=x.y.z] reccheck.nsi
;          (STAGE = the Electron tree: RecCheck.exe, locales\, resources\app.asar,
;           resources\rc-tbind.exe ...  An Uninstall.exe left in it by 7-Zip is
;           skipped; the real one is written by WriteUninstaller.  ICON and
;           OUTFILE default to paths relative to the current directory, so run
;           makensis from here or pass -DICON= / -DOUTFILE=.)
; Output:  out\RecCheck-Setup.exe        (~5 minutes; wait for the process)
; File encoding: UTF-8, no BOM (two em dashes below).  makensis on POSIX reads
; UTF-8 by default; on Windows add -INPUTCHARSET UTF8.

!ifndef VERSION
  !define VERSION "1.17.52"                 ; DisplayVersion -- bump per release
!endif
!ifndef STAGE
  !error "pass -DSTAGE=<payload dir>"
!endif
!ifndef ICON
  !define ICON "reccheck.ico"               ; == app\reccheck.ico in the repo
!endif
!ifndef OUTFILE
  !define OUTFILE "out\RecCheck-Setup.exe"
!endif
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\RecCheck"

Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!include "MUI2.nsh"

Name "RecCheck"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\RecCheck"
RequestExecutionLevel user
BrandingText "REC CHECK — Kernos Hotel"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_FINISHPAGE_TITLE "RecCheck is installed"
!define MUI_FINISHPAGE_TEXT "A shortcut is on the Desktop and in the Start Menu.$\r$\n$\r$\nThe app updates itself automatically from now on."
!define MUI_FINISHPAGE_RUN "$INSTDIR\RecCheck.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Start RecCheck now"

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; silent run (= the auto-updater's /S): give the app time to hand over
  IfSilent 0 +2
    Sleep 2000
  nsExec::Exec 'taskkill /IM RecCheck.exe'
  Sleep 1200
  nsExec::Exec 'taskkill /F /IM RecCheck.exe'
  nsExec::Exec 'taskkill /F /IM rc-tbind.exe'
  Sleep 800

  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  ; One File per directory, not File /r: the shipped code sets
  ; "$INSTDIR\locales" / "$INSTDIR\resources" directly, whereas File /r in
  ; 3.09 emits StrCpy $_OUTDIR $OUTDIR and "$_OUTDIR\..." (same effect, but
  ; not the same entries -- see REPORT.md).
  File /x "Uninstall.exe" "${STAGE}\*"
  SetOutPath "$INSTDIR\locales"
  File "${STAGE}\locales\*"
  SetOutPath "$INSTDIR\resources"
  File "${STAGE}\resources\*"
  SetOutPath "$INSTDIR"
  RMDir /r "$APPDATA\reccheck\updates"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\RecCheck.lnk" "$INSTDIR\RecCheck.exe"
  CreateShortcut "$DESKTOP\RecCheck.lnk" "$INSTDIR\RecCheck.exe"

  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayName"     "RecCheck — nightly receipt audit"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKCU "${UNINST_KEY}" "Publisher"       "Kernos Hotel"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\RecCheck.exe"
  WriteRegStr   HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1

  ; silent run: relaunch the app ourselves (the finish page does it otherwise)
  IfSilent 0 +2
    Exec '"$INSTDIR\RecCheck.exe"'
SectionEnd

Section "Uninstall"
  ; the helper removes its own login entry BEFORE its exe is deleted
  nsExec::Exec '"$INSTDIR\resources\rc-tbind.exe" uninstall'
  nsExec::Exec 'taskkill /F /IM RecCheck.exe'
  nsExec::Exec 'taskkill /F /IM rc-tbind.exe'
  Sleep 800
  Delete "$SMPROGRAMS\RecCheck.lnk"
  Delete "$DESKTOP\RecCheck.lnk"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
