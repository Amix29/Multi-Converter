$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchives=@(
  @{name='libreoffice';path='src-tauri/bundled-engine-archives/windows-x64/libreoffice.zip'},
  @{name='ocr-runtime';path='src-tauri/ocr-resources/runtime/windows-x64.zip'}
)
$taskResults=@()
foreach($taskArchive in $taskArchives){
  $taskZip=[IO.Compression.ZipFile]::OpenRead((Join-Path (Get-Location) $taskArchive.path))
  try{
    $taskEntries=@($taskZip.Entries | Where-Object {$_.Name -ne ''} | ForEach-Object {
      $taskName=$_.FullName.Replace('\','/')
      $taskParts=$taskName.Split('/')
      $taskGroup=if($taskArchive.name -eq 'ocr-runtime'){
        if($taskParts[0] -eq '_internal' -and $taskParts.Length -gt 1){$taskParts[1]}else{$taskParts[0]}
      }else{
        if($taskParts.Length -gt 1){$taskParts[0]+'/'+$taskParts[1]}else{$taskParts[0]}
      }
      [pscustomobject]@{path=$taskName;bytes=$_.Length;compressedBytes=$_.CompressedLength;group=$taskGroup}
    })
    $taskGroups=@($taskEntries | Group-Object group | ForEach-Object {
      [pscustomobject]@{name=$_.Name;fileCount=$_.Count;bytes=($_.Group | Measure-Object bytes -Sum).Sum;compressedBytes=($_.Group | Measure-Object compressedBytes -Sum).Sum}
    } | Sort-Object bytes -Descending)
    $taskRules=if($taskArchive.name -eq 'libreoffice'){
      @{
        dictionaries='^share/extensions/dict-';
        thesaurus='^share/extensions/dict-[^/]+/th_[^/]+\.(dat|idx)$';
        spelling='^share/extensions/dict-[^/]+/(?!hyph_)[^/]+\.(dic|aff)$';
        hyphenation='^share/extensions/dict-[^/]+/hyph_[^/]+\.dic$';
        localizedResources='^program/resource/';
        iconThemes='^share/config/images_';
        gallery='^share/gallery/';
        help='^help/';
        python='^program/python-core-';
        fonts='(^|/)fonts/'
      }
    }else{
      @{
        developmentHeadersAndStaticLibraries='(^_internal/paddle/include/|\.(lib|a|h|hpp|pyi)$)';
        opencvVideo='^_internal/cv2/opencv_videoio_ffmpeg';
        hfXet='^_internal/hf_xet/';
        pythonPdfium='^_internal/pypdfium2_raw/';
        avifCodec='^_internal/PIL/_avif';
        paddleHeaders='^_internal/paddle/include/'
      }
    }
    $taskCandidates=@{}
    foreach($taskRule in $taskRules.GetEnumerator()){
      $taskSubset=@($taskEntries | Where-Object path -match $taskRule.Value)
      $taskCandidates[$taskRule.Key]=@{
        fileCount=$taskSubset.Count;bytes=($taskSubset | Measure-Object bytes -Sum).Sum;
        compressedBytes=($taskSubset | Measure-Object compressedBytes -Sum).Sum;
        samplePaths=@($taskSubset | Select-Object -First 6 -ExpandProperty path)
      }
    }
    $taskResults+=@{
      name=$taskArchive.name;path=$taskArchive.path;archiveBytes=(Get-Item -LiteralPath $taskArchive.path).Length;
      fileCount=$taskEntries.Count;expandedBytes=($taskEntries | Measure-Object bytes -Sum).Sum;
      compressedEntryBytes=($taskEntries | Measure-Object compressedBytes -Sum).Sum;
      groups=@($taskGroups | Select-Object -First 45);
      largestFiles=@($taskEntries | Sort-Object bytes -Descending | Select-Object -First 35);
      pruningCandidateInventory=$taskCandidates;
      methods='ZIP central directory only; no extraction or mutation'
    }
  }finally{$taskZip.Dispose()}
}
$taskResults | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath docs/audits/2026-11-07/engine-zip-inventory.json -Encoding utf8
foreach($taskResult in $taskResults){
  Write-Output ($taskResult.name)
  Write-Output ($taskResult.pruningCandidateInventory | ConvertTo-Json -Depth 4 -Compress)
}
