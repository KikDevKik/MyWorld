# Oct 2026: deploy de MyWorld en un solo comando.
# Uso (desde la raíz del repo, en la terminal de Antigravity):
#   .\scripts\deploy.ps1 "mensaje del commit"            -> todo (funciones + web)
#   .\scripts\deploy.ps1 "mensaje" -Solo web              -> solo la web
#   .\scripts\deploy.ps1 "mensaje" -Solo funciones        -> solo el servidor
#   .\scripts\deploy.ps1 "mensaje" -Funciones chatWithGem,chapterReport   -> solo esas funciones (más rápido)
# Se detiene en el primer error y dice en qué paso falló.
param(
    [Parameter(Mandatory = $true)][string]$Mensaje,
    [ValidateSet('todo', 'web', 'funciones')][string]$Solo = 'todo',
    [string[]]$Funciones = @()
)
$ErrorActionPreference = 'Stop'
$Funciones = @($Funciones | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$inicio = Get-Date
function Paso($nombre, [scriptblock]$accion) {
    Write-Host "`n==> $nombre" -ForegroundColor Cyan
    & $accion
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { Write-Host "XX Falló: $nombre (código $LASTEXITCODE)" -ForegroundColor Red; exit $LASTEXITCODE }
}
Set-Location (Split-Path $PSScriptRoot -Parent)

Paso 'Guardar cambios en git' {
    git add -A
    $pendiente = git status --porcelain
    if ($pendiente) { git commit -m $Mensaje } else { Write-Host 'Nada nuevo que guardar.' }
}
Paso 'Subir a GitHub' { git push }

if ($Solo -ne 'web') {
    Paso 'Compilar el servidor' { Push-Location functions; npm run build; Pop-Location }
    if ($Funciones.Count -gt 0) {
        $lista = ($Funciones | ForEach-Object { "functions:$_" }) -join ','
        Paso "Publicar funciones: $($Funciones -join ', ')" { firebase deploy --only $lista }
    } else {
        Paso 'Publicar el servidor (todas las funciones, ~5 min)' { firebase deploy --only functions }
    }
}
if ($Solo -ne 'funciones') {
    Paso 'Compilar la web' { npm run build }
    Paso 'Publicar la web' { firebase deploy --only hosting }
}
$min = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)
Write-Host "`nOK Deploy completo en $min min." -ForegroundColor Green
