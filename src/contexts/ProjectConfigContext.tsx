import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { toast } from 'sonner';
import { ProjectConfig } from '../types';

// 🟢 NEW: File Node Interface (Lifted from VaultSidebar)
interface FileNode {
  id: string;
  name: string;
  mimeType: string;
  children?: FileNode[];
}

interface ProjectConfigContextType {
  config: ProjectConfig | null;
  loading: boolean;
  updateConfig: (newConfig: ProjectConfig) => Promise<void>;
  refreshConfig: () => Promise<void>;
  technicalError: { isError: boolean; details: any };
  setTechnicalError: (error: { isError: boolean; details: any }) => void;
  // 🟢 NEW: Global File Tree State
  fileTree: FileNode[] | null;
  isFileTreeLoading: boolean;
  // 🟢 GHOST MODE: Global User
  user: User | { uid: string; displayName: string; email: string } | null;
}

export const ProjectConfigContext = createContext<ProjectConfigContextType | undefined>(undefined);

export const useProjectConfig = () => {
  const context = useContext(ProjectConfigContext);
  if (!context) {
    throw new Error('useProjectConfig must be used within a ProjectConfigProvider');
  }
  return context;
};

// 🟢 GHOST IDENTITY
const GHOST_USER = {
    uid: "1mImHC6_uFVo06QjqL-pFcKF-E6ufQUdq",
    displayName: "Commander Ghost",
    email: "ghost@titanium.ai",
    isAnonymous: false,
    emailVerified: true,
    phoneNumber: null,
    photoURL: null,
    providerId: 'ghost',
    metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() },
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'ghost-token',
    getIdTokenResult: async () => ({ token: 'ghost-token', signInProvider: 'ghost', claims: {}, authTime: '', issuedAtTime: '', expirationTime: '' }),
    reload: async () => {},
    toJSON: () => ({})
};

export const ProjectConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [technicalError, setTechnicalError] = useState<{ isError: boolean; details: any }>({ isError: false, details: null });

  // 🟢 NEW: File Tree State
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState(true);

  // 🟢 GHOST MODE: User State
  const [user, setUser] = useState<User | typeof GHOST_USER | null>(null);

  // 1. AUTH LISTENER
  useEffect(() => {
    // Check Ghost Mode
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
        console.warn("👻 GHOST MODE ACTIVATED: Impersonating Commander.");
        setUser(GHOST_USER);
        return;
    }

    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const fetchConfig = async () => {
    // GHOST MODE BYPASS
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
         // Logic is handled in useEffect below, but let's ensure we don't try to fetch real config if ghost
         // 🟢 FIX: Ensure loading is set to false here too if called manually
         setLoading(false);
         return;
    }

    const auth = getAuth();
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    try {
      const functions = getFunctions();
      const getProjectConfig = httpsCallable(functions, 'getProjectConfig');
      const result = await getProjectConfig();
      setConfig(result.data as ProjectConfig);
    } catch (error) {
      console.error('Error fetching project config:', error);
      toast.error('Error al cargar la configuración del proyecto.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 🟢 GHOST MODE BYPASS FOR DEV
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
        console.warn("👻 GHOST MODE: Bypassing Config Fetch (User: jules-dev)");
        setConfig({
            canonPaths: [{ id: "mock-canon-id", name: "Mock Canon Root" }], // 🟢 MOCK CANON PATH
            resourcePaths: [],
            // chronologyPath: null, // REMOVED
            activeBookContext: "",
            folderId: "", // Empty to trigger "Connect Drive" button for testing
            characterVaultId: "mock-vault-id", // 🟢 MOCK VAULT ID (REQUIRED FOR CONNECT LOGIC)
        });
        setLoading(false);
        setIsFileTreeLoading(false); // Also stop tree loading
        return;
    }

    fetchConfig();
  }, []);

  const updateConfig = async (newConfig: ProjectConfig) => {
    // 🟢 GHOST MODE BYPASS
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
        console.warn("👻 GHOST MODE: Mocking Save Config");
        setConfig(newConfig);
        await new Promise(resolve => setTimeout(resolve, 500)); // Fake delay
        toast.success('Configuración guardada (GHOST MODE).');
        return;
    }

    try {
        const functions = getFunctions();
        const saveProjectConfig = httpsCallable(functions, 'saveProjectConfig');
        await saveProjectConfig(newConfig);
        setConfig(newConfig);
        toast.success('Configuración guardada correctamente.');
    } catch (error) {
        console.error('Error saving project config:', error);
        toast.error('Error al guardar la configuración.');
        throw error;
    }
  };

  // 🟢 NEW: Global File Tree Listener
  useEffect(() => {
    // Note: We don't have isSecurityReady here, so we rely on user auth.
    // If App Check fails, Firestore will reject the listener, which is fine (we handle error).

    // In Ghost Mode, we might want to mock this too, or actually try to fetch if we have permissions
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
         // If we want to test FileTree in Ghost Mode, we would need to mock it or open security rules for TDB_Index too.
         // For now, let's leave it as returning empty or mock if needed.
         // The user instruction was specifically about WorldEnginePanel reading ENTITIES.
         // But let's be safe.
         setIsFileTreeLoading(false);
         return;
    }

    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
        setFileTree(null);
        setIsFileTreeLoading(false);
        return;
    }

    const db = getFirestore();
    const docRef = doc(db, "TDB_Index", currentUser.uid, "structure", "tree");

    console.log("📡 [ProjectConfig] Suscribiéndose a TDB_Index/structure/tree...");
    setIsFileTreeLoading(true);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.tree && Array.isArray(data.tree)) {
                 console.log("🌳 Árbol indexado actualizado (Global):", data.tree.length, "nodos raíz");
                 setFileTree(data.tree);
            } else {
                 setFileTree([]);
            }
        } else {
            console.log("⚠️ No se encontró estructura de árbol (¿Nuclear Re-index requerido?)");
            setFileTree([]);
        }
        setIsFileTreeLoading(false);
    }, (error) => {
        console.error("Error escuchando árbol indexado:", error);
        setFileTree([]);
        setIsFileTreeLoading(false);
    });

    return () => unsubscribe();
  }, [user]); // Re-run when user changes

  return (
    <ProjectConfigContext.Provider value={{
        config,
        loading,
        updateConfig,
        refreshConfig: fetchConfig,
        technicalError,
        setTechnicalError,
        fileTree,
        isFileTreeLoading,
        user
    }}>
      {children}
    </ProjectConfigContext.Provider>
  );
};
