# 🔐 GUÍA DE CONFIGURACIÓN: Autenticación Permanente de Drive

Para que la nueva funcionalidad de "Sesión Permanente" funcione, necesitas configurar credenciales seguras en Google Cloud y en tu proyecto de Firebase.

Esto permitirá que la aplicación renueve el token automáticamente en segundo plano (Server-Side) sin que tengas que hacer clic en nada nunca más.

---

## PASO 1: Obtener Credenciales de Google Cloud

1. Ve a la [Consola de Google Cloud](https://console.cloud.google.com/).
2. Asegúrate de estar en el proyecto correcto: **`myword-67b03`**.
3. Ve a **APIs y servicios** > **Credenciales**.
4. Haz clic en **+ CREAR CREDENCIALES** > **ID de cliente de OAuth**.
5. **Configuración de la Credencial:**
   - **Tipo de aplicación:** Aplicación web.
   - **Nombre:** `MyWorld App` (o lo que prefieras).
   - **Orígenes autorizados de JavaScript:**
     - `http://localhost:5173` (Para desarrollo local)
     - `https://myword-67b03.web.app` (Para producción)
     - `https://myword-67b03.firebaseapp.com`
   - **URI de redireccionamiento autorizados:**
     - (No es estrictamente necesario para el flujo de "popup" que usamos, pero puedes añadir los mismos dominios por si acaso).
6. Haz clic en **CREAR**.
7. **¡IMPORTANTE!** Se te mostrará una ventana con dos claves. **CÓPIALAS y guárdalas**:
   - **ID de cliente (Client ID):** Algo como `123456-abcde.apps.googleusercontent.com`.
   - **Secreto de cliente (Client Secret):** Una cadena larga alfanumérica (NUNCA COMPARTAS ESTO PÚBLICAMENTE).

---

## PASO 2: Configurar Secretos en Firebase (Backend)

Estos comandos guardarán las credenciales de forma segura en Google Secret Manager para que las Cloud Functions puedan usarlas.

Abre tu terminal en la carpeta del proyecto y ejecuta:

```bash
# 1. Guardar el ID de Cliente
firebase functions:secrets:set GOOGLE_CLIENT_ID
# (Te pedirá que pegues el valor. Pega el 'Client ID' del paso anterior).

# 2. Guardar el Secreto de Cliente
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
# (Te pedirá que pegues el valor. Pega el 'Client Secret' del paso anterior).
```

*Nota: Si te pregunta si quieres permitir que las funciones accedan a estos secretos, di que **SÍ** (`Y`).*

---

## PASO 3: Configurar el Frontend (.env)

El frontend necesita saber el `Client ID` para iniciar el proceso de login.

1. Crea (o edita) el archivo `.env` en la raíz de tu proyecto.
2. Añade la siguiente línea:

```env
VITE_GOOGLE_CLIENT_ID=TU_CLIENT_ID_DEL_PASO_1
```
*(Reemplaza `TU_CLIENT_ID_DEL_PASO_1` con el valor real, ej: `123456-abcde...`).*

---

## PASO 4: Desplegar

Una vez configurado todo, despliega los cambios para que las funciones backend tengan acceso a los nuevos secretos.

```bash
firebase deploy --only functions
```

---

## ¿Cómo verificar que funciona?

1. Recarga la página web.
2. Si ves el botón "Conectar Drive" o un error de conexión en la barra lateral, haz clic en el botón de estado (el icono de llave/interrogación).
3. Se abrirá una ventana emergente de Google pidiendo permisos. **Esta vez es especial:** pedirá acceso para "ver y descargar todos tus archivos de Google Drive" y acceso "sin conexión".
4. Acepta.
5. Verás un mensaje de "¡Drive Vinculado Permanentemente!".
6. **Prueba final:** Espera 1 hora (o cierra la pestaña y vuelve mañana). Debería seguir conectado sin pedirte nada.
