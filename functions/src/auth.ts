import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { handleSecureError } from "./utils/security";

const googleClientId = defineSecret("GOOGLE_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_CLIENT_SECRET");

// Helper to get OAuth2 client
const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    googleClientId.value(),
    googleClientSecret.value(),
    'postmessage' // Standard for SPA Code Flow
  );
};

/**
 * 1. EXCHANGE AUTH CODE (The Handshake)
 * Swaps a short-lived authorization code for a long-lived Refresh Token.
 */
export const exchangeAuthCode = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleClientId, googleClientSecret],
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { code } = request.data;
    if (!code) throw new HttpsError("invalid-argument", "Authorization Code missing.");

    const userId = request.auth.uid;
    const db = getFirestore();

    try {
      logger.info(`🔐 Exchanging Auth Code for User: ${userId}`);

      const oauth2Client = getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        logger.warn("⚠️ No Refresh Token returned! User might have already granted access without 'prompt=consent'.");
      }

      // 🔒 SECURE STORAGE: Save Refresh Token to a protected path
      if (tokens.refresh_token) {
        await db.collection("users").doc(userId).collection("system_secrets").doc("drive").set({
          refreshToken: tokens.refresh_token,
          updatedAt: new Date().toISOString()
        });
        logger.info("✅ Refresh Token secured in Vault.");
      }

      return {
        success: true,
        accessToken: tokens.access_token,
        expiresIn: tokens.expiry_date ? (tokens.expiry_date - Date.now()) / 1000 : 3600,
        hasRefreshToken: !!tokens.refresh_token
      };

    } catch (error: any) {
      throw handleSecureError(error, "exchangeAuthCode");
    }
  }
);

/**
 * 1b. LOGIN WITH GOOGLE CODE (Unified Login — No prior auth required)
 * Exchanges an OAuth authorization code server-side, links/creates the Firebase
 * user account, saves the Drive refresh token, and returns a custom Firebase token.
 * This allows a single popup to handle both Firebase Auth and Drive connection.
 */
export const loginWithGoogleCode = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleClientId, googleClientSecret],
    memory: "1GiB",
  },
  async (request) => {
    // NOTE: This function intentionally does NOT require request.auth.
    // It is the entry point for first-time authentication.

    const { code } = request.data;
    if (!code) throw new HttpsError("invalid-argument", "Authorization Code missing.");

    const db = getFirestore();

    try {
      logger.info("🔐 [loginWithGoogleCode] Exchanging auth code server-side...");

      // Step 1 — Exchange code for tokens (backend has the client_secret)
      const oauth2Client = getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error("Google did not return an access token.");
      }

      // Step 2 — Get user info from Google using the access token
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfoRes = await oauth2.userinfo.get();
      const userInfo = userInfoRes.data;

      if (!userInfo.email) {
        throw new Error("Could not retrieve user email from Google.");
      }

      // Step 3 — Get or create Firebase user
      const adminAuth = getAdminAuth();
      let firebaseUid: string;

      try {
        const existingUser = await adminAuth.getUserByEmail(userInfo.email);
        firebaseUid = existingUser.uid;
        logger.info(`✅ [loginWithGoogleCode] Found existing user: ${firebaseUid}`);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          // Create a new Firebase user
          const newUser = await adminAuth.createUser({
            email: userInfo.email,
            displayName: userInfo.name || undefined,
            photoURL: userInfo.picture || undefined,
            emailVerified: true,
          });
          firebaseUid = newUser.uid;
          logger.info(`✨ [loginWithGoogleCode] Created new Firebase user: ${firebaseUid}`);
        } else {
          throw err;
        }
      }

      // Step 4 — Save refresh token to the vault
      if (tokens.refresh_token) {
        await db.collection("users").doc(firebaseUid).collection("system_secrets").doc("drive").set({
          refreshToken: tokens.refresh_token,
          updatedAt: new Date().toISOString()
        });
        logger.info("✅ [loginWithGoogleCode] Refresh Token secured in Vault.");
      } else {
        logger.warn("⚠️ [loginWithGoogleCode] No refresh token returned. User may need to reconnect Drive later.");
      }

      // Step 5 — Create a Firebase custom token for the client to sign in with
      const customToken = await adminAuth.createCustomToken(firebaseUid);

      logger.info(`🚀 [loginWithGoogleCode] Custom token issued for: ${firebaseUid}`);

      return {
        success: true,
        customToken,
        accessToken: tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
      };

    } catch (error: any) {
      throw handleSecureError(error, "loginWithGoogleCode");
    }
  }
);

/**
 * 2. REFRESH DRIVE TOKEN (The Heartbeat)
 * Uses the stored Refresh Token to get a fresh Access Token.
 */
export const refreshDriveToken = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleClientId, googleClientSecret],
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const userId = request.auth.uid;
    const db = getFirestore();

    try {
      // 1. Retrieve Secret
      const secretDoc = await db.collection("users").doc(userId).collection("system_secrets").doc("drive").get();

      if (!secretDoc.exists || !secretDoc.data()?.refreshToken) {
        // Fail gracefully so client knows to prompt for connection
        logger.info(`ℹ️ No Refresh Token found for ${userId}. Manual connection required.`);
        return { success: false, reason: "NO_REFRESH_TOKEN" };
      }

      const refreshToken = secretDoc.data()!.refreshToken;

      // 2. Refresh via Google
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      // getAccessToken() automatically refreshes if needed (and we only gave it a refresh token)
      const { token } = await oauth2Client.getAccessToken();

      if (!token) {
        throw new Error("Failed to obtain Access Token from Refresh Token.");
      }

      logger.info(`💓 Drive Token Refreshed for ${userId}`);

      return {
        success: true,
        accessToken: token,
        expiresIn: 3600 // Standard 1h
      };

    } catch (error: any) {
      // If refresh token is invalid (revoked), we should probably delete it?
      if (error.message && (error.message.includes('invalid_grant') || error.message.includes('unauthorized_client'))) {
        logger.warn(`🗑️ Refresh Token invalid (Revoked?). Deleting from Vault.`);
        await db.collection("users").doc(userId).collection("system_secrets").doc("drive").delete();
        return { success: false, reason: "TOKEN_REVOKED" };
      }

      throw handleSecureError(error, "refreshDriveToken");
    }
  }
);

/**
 * 3. REVOKE DRIVE ACCESS (The Disconnect)
 * Deletes the stored Refresh Token.
 */
export const revokeDriveAccess = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const userId = request.auth.uid;
    const db = getFirestore();

    try {
      await db.collection("users").doc(userId).collection("system_secrets").doc("drive").delete();
      logger.info(`🔌 Drive Access Revoked for ${userId}`);
      return { success: true };
    } catch (error: any) {
      throw handleSecureError(error, "revokeDriveAccess");
    }
  }
);
