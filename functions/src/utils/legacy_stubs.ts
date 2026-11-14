// Nov 2026: constantes y sustitutos heredados que usaban varias funciones de index.ts.
// Varios son sustitutos vacíos de utilidades que ya no existen (devuelven vacío): están aquí para que se vean juntos
// y se puedan ir retirando uno a uno. No añadas cosas nuevas a este archivo.
export const MAX_CHAT_MESSAGE_LIMIT = 10000;
export const MAX_AI_INPUT_CHARS = 100000;
export const MAX_SESSION_NAME_CHARS = 50;
export const TEMP_CREATIVE = 0.7;
export const TEMP_PRECISION = 0.2;
export const SAFETY_SETTINGS_PERMISSIVE = [];
export const FolderRole = { WORLDBUILDING: "worldbuilding" };
export type FolderRole = any;
export const FinishReason = { MAX_TOKENS: "MAX_TOKENS", SAFETY: "SAFETY" };
export type WriterProfile = any;
export const _getProjectConfigInternal = async (...args: any[]) => ({} as any);
export const extractUrls = (...args: any[]) => [];
export const fetchWebPageContent = async (...args: any[]) => "";
export const matter = undefined;
export const marked = undefined;
export const resolveDriveFolder = async (...args: any[]) => "";
export const fetchFolderContents = async (...args: any[]) => [];
export const flattenFileTree = async (...args: any[]) => ([] as any[]);
export const createProjectCache = async (...args: any[]) => ({} as any);
export const getFolderIdForRole = async (...args: any[]) => "";
// const ingestFile = async (...args: any[]) => { };
export const admin = undefined;
