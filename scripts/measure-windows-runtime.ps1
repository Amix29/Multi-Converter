[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExecutablePath,

    [ValidateRange(1, 50)]
    [int]$Runs = 5,

    [ValidateRange(1, 300)]
    [int]$TimeoutSeconds = 30,

    [string]$OutputPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-FullPath {
    param([string]$PathValue, [string]$BasePath)

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $BasePath $PathValue))
}

function Assert-SafeOutput {
    param([string]$PathValue, [string]$Executable)

    if ([System.IO.Path]::GetExtension($PathValue) -ne ".json") {
        throw "OutputPath must use a .json file."
    }
    if ([string]::Equals($PathValue, $Executable, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "OutputPath must not overwrite the measured executable."
    }
    if (-not (Test-Path -LiteralPath $PathValue)) {
        return
    }

    $item = Get-Item -LiteralPath $PathValue
    if ($item.PSIsContainer) {
        throw "OutputPath must reference a file path, not a directory."
    }
    try {
        $existing = Get-Content -Raw -LiteralPath $PathValue | ConvertFrom-Json
        $kind = $existing.PSObject.Properties["kind"]
        $schema = $existing.PSObject.Properties["schemaVersion"]
        if ($null -eq $kind -or $kind.Value -ne "windows-runtime" -or $null -eq $schema -or $schema.Value -ne 1) {
            throw "unexpected schema"
        }
    }
    catch {
        throw "Refusing to overwrite a JSON file that is not a Windows runtime measurement."
    }
}

function Assert-NoExistingInstance {
    param([string]$Executable)

    $processName = [System.IO.Path]::GetFileNameWithoutExtension($Executable)
    foreach ($candidate in @(Get-Process -Name $processName -ErrorAction SilentlyContinue)) {
        try {
            if ([string]::Equals($candidate.Path, $Executable, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "The measured executable is already running. Close it before measuring so the script cannot affect an existing session."
            }
        }
        catch [System.Management.Automation.PropertyNotFoundException] {
            continue
        }
        catch [System.ComponentModel.Win32Exception] {
            continue
        }
    }
}

function Stop-MeasuredProcess {
    param(
        [System.Diagnostics.Process]$Process,
        [datetime]$ExpectedStartTime
    )

    if ($null -eq $Process -or $Process.HasExited) {
        return "already-exited"
    }

    [void]$Process.CloseMainWindow()
    if ($Process.WaitForExit(5000)) {
        return "closed"
    }

    $liveProcess = Get-Process -Id $Process.Id -ErrorAction SilentlyContinue
    if ($null -eq $liveProcess) {
        return "already-exited"
    }
    $liveStartTime = $liveProcess.StartTime.ToUniversalTime()
    if ($liveProcess.Id -ne $Process.Id -or $liveStartTime -ne $ExpectedStartTime) {
        throw "The measured PID was reused; refusing the forced-stop fallback."
    }

    Stop-Process -Id $Process.Id -Force
    [void]$Process.WaitForExit(5000)
    return "forced-exact-pid"
}

function Measure-Statistics {
    param([object[]]$Values)

    $numbers = @($Values | Where-Object { $null -ne $_ } | ForEach-Object { [double]$_ } | Sort-Object)
    if ($numbers.Count -eq 0) {
        return $null
    }
    $middle = [math]::Floor($numbers.Count / 2)
    $median = if ($numbers.Count % 2 -eq 0) {
        ($numbers[$middle - 1] + $numbers[$middle]) / 2
    }
    else {
        $numbers[$middle]
    }
    return [ordered]@{
        minimum = $numbers[0]
        median = [math]::Round($median, 2)
        average = [math]::Round(($numbers | Measure-Object -Average).Average, 2)
        maximum = $numbers[-1]
    }
}

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
    throw "Windows runtime measurement must run on Windows."
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath).ProviderPath
$executableItem = Get-Item -LiteralPath $resolvedExecutable
if ($executableItem.PSIsContainer -or $executableItem.Extension -ne ".exe") {
    throw "ExecutablePath must reference a Windows .exe file."
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = "test-results/phase-1-baseline/windows-runtime.json"
}
$resolvedOutput = Resolve-FullPath -PathValue $OutputPath -BasePath $repositoryRoot
Assert-SafeOutput -PathValue $resolvedOutput -Executable $resolvedExecutable
Assert-NoExistingInstance -Executable $resolvedExecutable

$measurementStartedAt = [datetime]::UtcNow
$runResults = [System.Collections.Generic.List[object]]::new()
$timeoutMilliseconds = $TimeoutSeconds * 1000
$memorySettleMilliseconds = 250

for ($runIndex = 1; $runIndex -le $Runs; $runIndex += 1) {
    $process = $null
    $expectedStartTime = [datetime]::MinValue
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{
        index = $runIndex
        kind = if ($runIndex -eq 1) { "first" } else { "repeat" }
        status = "starting"
        windowReadyProxyMs = $null
        workingSetBytes = $null
        privateMemoryBytes = $null
        exitCodeBeforeReady = $null
        cleanup = $null
        errorType = $null
    }

    try {
        $process = Start-Process -FilePath $resolvedExecutable -WorkingDirectory $executableItem.DirectoryName -PassThru
        $expectedStartTime = $process.StartTime.ToUniversalTime()

        while ($timer.ElapsedMilliseconds -lt $timeoutMilliseconds) {
            if ($process.HasExited) {
                $result.status = "exited-before-ready"
                $result.exitCodeBeforeReady = $process.ExitCode
                break
            }
            $process.Refresh()
            if ($process.MainWindowHandle -ne [IntPtr]::Zero -and $process.Responding) {
                $result.status = "ready"
                $result.windowReadyProxyMs = $timer.ElapsedMilliseconds
                break
            }
            Start-Sleep -Milliseconds 50
        }

        if ($result.status -eq "starting") {
            $result.status = "timeout"
        }
        if ($result.status -eq "ready") {
            Start-Sleep -Milliseconds $memorySettleMilliseconds
            if (-not $process.HasExited) {
                $process.Refresh()
                $result.workingSetBytes = $process.WorkingSet64
                $result.privateMemoryBytes = $process.PrivateMemorySize64
            }
        }
    }
    catch {
        $result.status = "error"
        $result.errorType = $_.Exception.GetType().FullName
    }
    finally {
        $timer.Stop()
        if ($null -ne $process) {
            $result.cleanup = Stop-MeasuredProcess -Process $process -ExpectedStartTime $expectedStartTime
            $process.Dispose()
        }
    }

    $runResults.Add([pscustomobject]$result)
}

$successfulRuns = @($runResults | Where-Object { $_.status -eq "ready" })
$repeatRuns = @($successfulRuns | Where-Object { $_.kind -eq "repeat" })
$failedRunCount = $Runs - $successfulRuns.Count
$report = [ordered]@{
    schemaVersion = 1
    kind = "windows-runtime"
    generatedAt = [datetime]::UtcNow.ToString("o")
    measurementPolicy = [ordered]@{
        reportStoredLocally = $true
        measurementScriptTelemetry = $false
        measurementScriptReadsUserContent = $false
        normalApplicationStartup = $true
        networkIsolationEnforced = $false
        applicationBoundary = "The launched app may read its normal local profile and perform configured updater checks."
        readyDefinition = "window-ready proxy: MainWindowHandle is non-zero and Responding is true"
        runSemantics = "The first run is labelled first; repeat runs are not claimed to be cold starts."
        memorySampleDelayMs = $memorySettleMilliseconds
    }
    executable = [ordered]@{
        name = $executableItem.Name
        bytes = $executableItem.Length
    }
    environment = [ordered]@{
        platform = "win32"
        processArchitecture = $env:PROCESSOR_ARCHITECTURE
        is64BitOperatingSystem = [System.Environment]::Is64BitOperatingSystem
        powershellVersion = $PSVersionTable.PSVersion.ToString()
    }
    configuration = [ordered]@{
        runs = $Runs
        timeoutSeconds = $TimeoutSeconds
        startedAt = $measurementStartedAt.ToString("o")
    }
    runs = $runResults
    summary = [ordered]@{
        successfulRuns = $successfulRuns.Count
        failedRuns = $failedRunCount
        allWindowReadyMs = Measure-Statistics -Values @($successfulRuns | ForEach-Object { $_.windowReadyProxyMs })
        repeatWindowReadyMs = Measure-Statistics -Values @($repeatRuns | ForEach-Object { $_.windowReadyProxyMs })
        workingSetBytes = Measure-Statistics -Values @($successfulRuns | ForEach-Object { $_.workingSetBytes })
        privateMemoryBytes = Measure-Statistics -Values @($successfulRuns | ForEach-Object { $_.privateMemoryBytes })
    }
}

$outputDirectory = Split-Path -Parent $resolvedOutput
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$json = $report | ConvertTo-Json -Depth 8
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($resolvedOutput, "$json$([Environment]::NewLine)", $utf8WithoutBom)
Write-Output "Windows runtime measurement written to $([System.IO.Path]::GetFileName($resolvedOutput))"

if ($failedRunCount -gt 0) {
    throw "$failedRunCount of $Runs runtime measurement runs did not reach the window-ready proxy."
}
