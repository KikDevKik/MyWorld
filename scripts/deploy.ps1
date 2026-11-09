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
# Nov 2026: Google a veces corta la conexión a mitad del deploy («socket hang up», «ECONNRESET»):
# no es un error del código. Se reintenta una vez; Firebase salta las funciones que ya quedaron publicadas.
function PasoConReintento($nombre, [scriptblock]$accion) {
    Write-Host "`n==> $nombre" -ForegroundColor Cyan
    & $accion
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Host "!! Falló, reintento una vez (suele ser la conexión con Google)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 20
        & $accion
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { Write-Host "XX Falló: $nombre (código $LASTEXITCODE)" -ForegroundColor Red; exit $LASTEXITCODE }
    }
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
        PasoConReintento "Publicar funciones: $($Funciones -join ', ')" { firebase deploy --only $lista }
    } else {
        PasoConReintento 'Publicar el servidor (todas las funciones, ~5 min)' { firebase deploy --only functions }
    }
}
if ($Solo -ne 'funciones') {
    Paso 'Compilar la web' { npm run build }
    PasoConReintento 'Publicar la web' { firebase deploy --only hosting }
}
# Nov 2026: las reglas de Firestore no se publicaban nunca (permisos de plan, user_state, craft…).
if ($Solo -ne 'funciones') {
    Paso 'Publicar las reglas de Firestore' { firebase deploy --only firestore:rules }
}
$min = [math]::Round(((Get-Date) - $inicio).TotalMinutes, 1)
Write-Host "`nOK Deploy completo en $min min." -ForegroundColor Green
