// Centralized configuration for Firebase Functions

// CORS Allowed Origins
// Separated by environment to avoid localhost origins in production.
const productionOrigins = [
  "https://myword-67b03.web.app",
  "https://myword-67b03.firebaseapp.com",
];

const devOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

// ALLOWED_CORS_ORIGINS env var (manual override) takes highest priority.
// FUNCTIONS_EMULATOR is auto-injected by the Firebase emulator — never present in Cloud Functions production.
export const ALLOWED_ORIGINS = process.env.ALLOWED_CORS_ORIGINS
  ? process.env.ALLOWED_CORS_ORIGINS.split(",").map((o) => o.trim())
  : process.env.FUNCTIONS_EMULATOR
    ? [...productionOrigins, ...devOrigins]
    : productionOrigins;

// Region for function deployment
export const FUNCTIONS_REGION = "us-central1";
