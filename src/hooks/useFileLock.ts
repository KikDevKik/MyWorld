import { useState, useEffect } from 'react';
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// 🟢 STABLE SESSION ID (Per Tab/Page Load)
// This ensures that even if the App or Hook remounts (causing internal state reset),
// the Session ID remains constant, preventing "Zombie Locks" where the user locks themselves out.
// This is critical for preventing "Read Only" flashes when heavy components (like Guardian) trigger re-renders.
const SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

interface LockStatus {
    isLocked: boolean;
    lockedBySession: string | null;
    isSelfLocked: boolean;
}

export const useFileLock = (fileId: string | null, userId: string | undefined) => {
    const [status, setStatus] = useState<LockStatus>({
        isLocked: false,
        lockedBySession: null,
        isSelfLocked: false
    });

    const db = getFirestore();

    useEffect(() => {
        if (!fileId || !userId) {
            setStatus({ isLocked: false, lockedBySession: null, isSelfLocked: false });
            return;
        }

        const lockRef = doc(db, "users", userId, "file_locks", fileId);

        // 1. SUBSCRIBE TO LOCK STATUS
        const unsubscribe = onSnapshot(lockRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const remoteSessionId = data.lockedBy;
                const lockedAt = data.lockedAt instanceof Timestamp ? data.lockedAt.toMillis() : Date.now();
                const now = Date.now();

                // Check for Stale Lock
                if (now - lockedAt > LOCK_TIMEOUT_MS) {
                    // Stale -> Treat as unlocked (and assume we can take over in the acquire step)
                    setStatus({ isLocked: false, lockedBySession: null, isSelfLocked: false });
                } else if (remoteSessionId === SESSION_ID) {
                    // Self Locked
                    setStatus({ isLocked: true, lockedBySession: SESSION_ID, isSelfLocked: true });
                } else {
                    // Foreign Locked
                    setStatus({ isLocked: true, lockedBySession: remoteSessionId, isSelfLocked: false });
                }
            } else {
                // No Lock
                setStatus({ isLocked: false, lockedBySession: null, isSelfLocked: false });
            }
        }, (error) => {
            console.error("Lock subscription error:", error);
        });

        // 2. ACQUIRE LOCK (Debounced/Logic)
        const safeAcquire = async () => {
             // 1. Get fresh state
             try {
                 const snap = await import('firebase/firestore').then(mod => mod.getDoc(lockRef));
                 if (snap.exists()) {
                     const data = snap.data();
                     const now = Date.now();
                     const lockedAt = data.lockedAt instanceof Timestamp ? data.lockedAt.toMillis() : 0;

                     if (data.lockedBy !== SESSION_ID && (now - lockedAt < LOCK_TIMEOUT_MS)) {
                         // Valid Foreign Lock -> Do not overwrite
                         console.log("File is locked by another session.");
                         return;
                     }
                 }
                 // 2. Write
                 await setDoc(lockRef, {
                    lockedBy: SESSION_ID,
                    lockedAt: serverTimestamp()
                });
             } catch (e) {
                 console.error("Lock check failed:", e);
             }
        };

        safeAcquire();

        // 3. HEARTBEAT (Keep lock alive)
        const interval = setInterval(() => {
             // We blindly update heartbeat if we are on the page.
             // Ideally we check if we own it, but writes are cheap and LWW applies.
             // If we lost it to someone else, we might be overwriting, but safeAcquire checks on mount.
             setDoc(lockRef, {
                 lockedBy: SESSION_ID,
                 lockedAt: serverTimestamp()
             }, { merge: true }).catch(() => {});
        }, 60 * 1000); // 1 minute

        return () => {
            unsubscribe();
            clearInterval(interval);
        };

    }, [fileId, userId]);

    // Separate cleanup effect to handle "Release"
    useEffect(() => {
        if (!fileId || !userId) return;
        const lockRef = doc(db, "users", userId, "file_locks", fileId);

        return () => {
             // Best effort release on component unmount (e.g. changing file)
             deleteDoc(lockRef).catch(e => console.warn("Failed to release lock", e));
        };
    }, [fileId, userId]);

    return status;
};
