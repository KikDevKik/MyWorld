# Deploy automático (GitHub Actions)

Cada `git push` a `main` publica solo lo que cambió (servidor, web o ambos). Archivo: `.github/workflows/deploy.yml`.
GitHub se identifica ante Google Cloud **sin claves** (Workload Identity Federation) y solo desde `KikDevKik/MyWorld`, rama `main`.

## Configuración única (Dei, ~10 minutos)

1. **Google Cloud → Cloud Shell** (icono `>_` arriba a la derecha, con el proyecto *MyWorld*). Pega el contenido de
   `scripts/setup-github-deploy.sh` y dale Enter. Al final imprime dos valores.
2. **GitHub → repo MyWorld → Settings → Secrets and variables → Actions**:
   - Pestaña **Variables** → *New repository variable*: `GCP_WIF_PROVIDER` y `GCP_DEPLOY_SA` con los valores del paso 1.
   - Pestaña **Secrets** → *New repository secret*:
     - `ENV_LOCAL`: el contenido completo de tu archivo `.env.local` (configuración de la web).
     - `FUNCTIONS_ENV`: el contenido completo de `functions/.env.myword-67b03` (configuración del servidor).
3. **Probar**: GitHub → pestaña **Actions** → *Deploy MyWorld* → *Run workflow* → `todo`. Tarda ~6-8 min.

## Uso diario

- `git push` y listo. En la pestaña Actions ves si salió bien (✓ verde) o en qué paso falló (✗ rojo).
- Para publicar algo a mano: Actions → *Deploy MyWorld* → *Run workflow* → `web`, `funciones` o `todo`.
- Seguridad: si un deploy quisiera **borrar** funciones que ya no están en el código, el workflow falla en vez de borrarlas.
- Si algún día cambias `.env.local` o `functions/.env.myword-67b03`, actualiza también el secreto correspondiente en GitHub.
