// Centralized configuration for Firebase Functions

// CORS Allowed Origins
// Used to prevent hardcoding URLs across multiple files
const defaultOrigins = [
  "https://myword-67b03.web.app",
  "http://localhost:5173",
  "http://localhost:4173"
];

export const ALLOWED_ORIGINS = process.env.ALLOWED_CORS_ORIGINS
  ? process.env.ALLOWED_CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : defaultOrigins;

// Region for function deployment
export const FUNCTIONS_REGION = "us-central1";
