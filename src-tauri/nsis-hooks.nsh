; Lossless solid compression across raw engine resources. Decoder needs 128 MiB.
SetCompressorDictSize 128

; Build once for this payload. The helper runs from the installer temp directory.
!tempfile MC_FOOTPRINT_TOOL
!system 'node "${__FILEDIR__}\..\tools\windows-footprint\build.mjs" "${MC_FOOTPRINT_TOOL}"' = 0

!macro NSIS_HOOK_POSTINSTALL
  InitPluginsDir
  File "/oname=$PLUGINSDIR\mc-footprint.exe" "${MC_FOOTPRINT_TOOL}"
  !delfile "${MC_FOOTPRINT_TOOL}"
  DetailPrint "Optimizing installed files for this Windows volume..."
  nsExec::ExecToStack '"$PLUGINSDIR\mc-footprint.exe" "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" $1
  ${Else}
    DetailPrint "Installed size measurement unavailable ($0)."
  ${EndIf}
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\Uninstall ${PRODUCTNAME}.lnk" "$INSTDIR\uninstall.exe"
  !insertmacro MUI_STARTMENU_WRITE_END
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
  Delete "$SMPROGRAMS\$AppStartMenuFolder\Uninstall ${PRODUCTNAME}.lnk"
  RMDir "$SMPROGRAMS\$AppStartMenuFolder"
!macroend
