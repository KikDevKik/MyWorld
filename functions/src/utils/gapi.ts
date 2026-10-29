// Oct 2026 (arranque en frío): `import { google } from "googleapis"` carga las ~300 APIs de Google
// y era lo más lento de cada arranque en frío de las funciones. Aquí solo se cargan Drive y OAuth2,
// con la misma forma de uso: google.auth.OAuth2, google.drive({...}), google.oauth2({...}).
import { auth, drive } from "googleapis/build/src/apis/drive";
import { oauth2 } from "googleapis/build/src/apis/oauth2";

export const google = { auth, drive, oauth2 };
