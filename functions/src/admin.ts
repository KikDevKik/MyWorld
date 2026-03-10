/**
 * SHARED ADMIN INITIALIZATION
 * Single source of truth for firebase-admin initialization.
 * Import this file FIRST in any module that uses firebase-admin services
 * to ensure initializeApp() is always called before any service is accessed.
 */
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
    admin.initializeApp();
}

export { admin };
export const db = admin.firestore();
