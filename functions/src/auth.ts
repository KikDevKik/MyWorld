import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
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
        // We can still return the access token, but we can't save permanent access.
        // Usually, we should force prompt='consent' on client to ensure we get a refresh token.
        // But if we don't get it, we can't save it.
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
 * 2. REFRESH DRIVE TOKEN (The Heartbeat)
 * Uses the stored Refresh Token to get a fresh Access Token.
 */
export const refreshDriveToken = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleClientId, googleClientSecret],
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
