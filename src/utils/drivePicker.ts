// Nov 2026: selector de archivos de Google para traer trabajo anterior desde el Drive del autor.
// Reemplaza el permiso «ver todo tu Drive» (drive.readonly, restringido por Google): con drive.file,
// MyWorld solo puede leer los archivos que el autor elige aquí, y Google no pide un permiso nuevo.
// Ojo: elegir una carpeta NO da acceso a lo que tiene dentro; por eso se eligen archivos (se puede
// entrar a las carpetas y elegir varios a la vez).

const w = window as any;

export interface PickedFile { id: string; name: string; mimeType: string; parentId?: string }

// Lo que MyWorld sabe copiar y leer (igual que el filtro del servidor).
export const IMPORTABLE_MIME = [
    'application/vnd.google-apps.document',
    'text/markdown', 'text/x-markdown', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
].join(',');

let loading: Promise<void> | null = null;
function loadPickerApi(): Promise<void> {
    if (w.google?.picker) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise<void>((resolve, reject) => {
        const done = () => w.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('picker')) });
        if (w.gapi?.load) return done();
        const s = document.createElement('script');
        s.src = 'https://apis.google.com/js/api.js';
        s.async = true;
        s.onload = done;
        s.onerror = () => { loading = null; reject(new Error('No se pudo cargar el selector de Google.')); };
        document.head.appendChild(s);
    });
    return loading;
}

export async function openDriveFilePicker(opts: { token: string; query?: string; onPicked: (files: PickedFile[]) => void; onCancel?: () => void }) {
    const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;
    // El número del proyecto de Google (en Firebase coincide con messagingSenderId): sin él, Google no
    // le da a MyWorld acceso a los archivos elegidos.
    const appId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
    if (!developerKey || !appId) throw new Error('Falta la configuración del selector de Google.');
    await loadPickerApi();
    const P = w.google.picker;
    const q = (opts.query || '').trim();

    // Varias pestañas para encontrar el archivo entre muchos: lo tuyo, lo destacado y lo compartido contigo.
    const make = (label: string, setup: (v: any) => void) => {
        const v = new P.DocsView(P.ViewId.DOCS)
            .setMimeTypes(IMPORTABLE_MIME)
            .setIncludeFolders(true)          // para entrar a tus carpetas
            .setSelectFolderEnabled(false)    // una carpeta no da acceso a su contenido
            .setMode(P.DocsViewMode.LIST);    // lista con nombre y fecha: más fácil de leer que miniaturas
        if (q && typeof v.setQuery === 'function') v.setQuery(q);
        if (typeof v.setLabel === 'function') v.setLabel(label);
        setup(v);
        return v;
    };
    const mine = make('Mi Drive', v => v.setOwnedByMe(true));
    const starred = make('Destacados', v => v.setStarred(true));
    const shared = make('Compartidos conmigo', v => v.setOwnedByMe(false));

    const picker = new P.PickerBuilder()
        .setAppId(appId)
        .setOAuthToken(opts.token)
        .setDeveloperKey(developerKey)
        .setLocale('es')
        .setTitle(q ? `Archivos que coinciden con «${q}»` : 'Elige los archivos que quieres traer')
        .addView(mine)
        .addView(starred)
        .addView(shared)
        .enableFeature(P.Feature.MULTISELECT_ENABLED)
        .enableFeature(P.Feature.SUPPORT_DRIVES)
        .setMaxItems(200)
        .setCallback((data: any) => {
            if (data.action === P.Action.PICKED) {
                const files: PickedFile[] = (data.docs || []).map((d: any) => ({ id: d.id, name: d.name, mimeType: d.mimeType, parentId: d.parentId }));
                opts.onPicked(files);
            } else if (data.action === P.Action.CANCEL) {
                opts.onCancel?.();
            }
        });
    picker.build().setVisible(true);
}
