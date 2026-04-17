// Centralized configuration for Firebase Functions

// CORS Allowed Origins
// localhost origins are included permanently — no security risk since functions require Firebase Auth.
export const ALLOWED_ORIGINS = process.env.ALLOWED_CORS_ORIGINS
  ? process.env.ALLOWED_CORS_ORIGINS.split(",").map((o) => o.trim())
  : [
      "https://myword-67b03.web.app",
      "https://myword-67b03.firebaseapp.com",
      // Local development (safe: all functions enforce request.auth)
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:4173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:4173",
    ];

// Region for function deployment
export const FUNCTIONS_REGION = "us-central1";
