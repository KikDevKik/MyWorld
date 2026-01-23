// Centralized configuration for Firebase Functions

// CORS Allowed Origins
// Used to prevent hardcoding URLs across multiple files
export const ALLOWED_ORIGINS = [
  "https://myword-67b03.web.app",
  "http://localhost:5173",
  "http://localhost:4173"
];

// Region for function deployment
export const FUNCTIONS_REGION = "us-central1";
