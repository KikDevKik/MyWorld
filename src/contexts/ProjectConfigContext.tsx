import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { toast } from 'sonner';
import { ProjectConfig } from '../types';
import { callFunction } from '../services/api';

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
  // 🟢 BYOK: Custom Gemini Key (Local Only)
  customGeminiKey: string | null;
  setCustomGeminiKey: (key: string | null) => void;
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
  delete: async () => { },
  getIdToken: async () => 'ghost-token',
  getIdTokenResult: async () => ({ token: 'ghost-token', signInProvider: 'ghost', claims: {}, authTime: '', issuedAtTime: '', expirationTime: '' }),
  reload: async () => { },
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

  // 🟢 BYOK: Custom Gemini Key State
  const [customGeminiKey, setCustomGeminiKeyState] = useState<string | null>(() => {
    return sessionStorage.getItem('myworld_custom_gemini_key') || localStorage.getItem('myworld_custom_gemini_key');
  });

  const setCustomGeminiKey = (key: string | null) => {
    setCustomGeminiKeyState(key);
    if (key) {
      sessionStorage.setItem('myworld_custom_gemini_key', key);
      localStorage.setItem('myworld_custom_gemini_key', key);
    } else {
      sessionStorage.removeItem('myworld_custom_gemini_key');
      localStorage.removeItem('myworld_custom_gemini_key');
    }
  };

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

  // 🟢 REAL-TIME CONFIG SYNC
  useEffect(() => {
    // GHOST MODE BYPASS
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
      console.warn("👻 GHOST MODE: Bypassing Config Fetch (User: jules-dev)");
      setConfig({
        canonPaths: [{ id: "mock-canon-id", name: "Mock Canon Root" }], // 🟢 MOCK CANON PATH
        resourcePaths: [],
        activeBookContext: "",
        folderId: "mock-project-id", // 🟢 FIXED: Non-empty ID for Nexus Scan
        characterVaultId: "mock-vault-id", // 🟢 MOCK VAULT ID (REQUIRED FOR CONNECT LOGIC)
      });

      // 🟢 MOCK FILE TREE
      setFileTree([
        {
          id: "mock-canon-id", name: "Mock Canon Root", mimeType: "application/vnd.google-apps.folder", children: [
            { id: "mock-file-1", name: "Mock File.md", mimeType: "text/markdown" }
          ]
        }
      ]);

      setLoading(false);
      setIsFileTreeLoading(false); // Also stop tree loading
      return;
    }

    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const docRef = doc(db, "users", currentUser.uid, "profile", "project_config");

    console.log("📡 [ProjectConfig] Suscribiéndose a profile/project_config...");
    setLoading(true);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ProjectConfig;
        setConfig(data);
      } else {
        console.log("⚠️ No se encontró configuración del proyecto.");
        setConfig(null); // Or default empty config?
      }
      setLoading(false);
    }, (error) => {
      console.error("Error escuchando configuración:", error);
      toast.error('Error de sincronización (Config).');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]); // Re-run when user changes

  const refreshConfig = async () => {
    // No-op for snapshot, but kept for compatibility
    console.log("🔄 Config refresh triggered (handled via Snapshot)");
  };

  const updateConfig = async (newConfig: ProjectConfig) => {
    // 🟢 GHOST MODE BYPASS
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
      console.warn("👻 GHOST MODE: Mocking Save Config");
      setConfig(newConfig);
      await new Promise(resolve => setTimeout(resolve, 500)); // Fake delay
      toast.success('Configuración guardada (GHOST MODE).');
      return;
    }

    // 🛡️ SANITIZACIÓN CLIENTE: Nunca enviar claves a Firestore
    const { 
        // @ts-ignore - estos campos no deberían existir en ProjectConfig
        _authOverride,
        customGeminiKey, 
        apiKey,
        accessToken,
        ...sanitizedConfig 
    } = newConfig as any;

    try {
        await callFunction('saveProjectConfig', sanitizedConfig);
        setConfig(sanitizedConfig as ProjectConfig);
        toast.success('Configuración guardada correctamente.');
    } catch (error) {
        console.error('Error saving project config:', error);
        toast.error('Error al guardar la configuración.');
        throw error;
    }
  };

  // 🟢 DECENTRALIZED V3: Derive the root fileTree from config mappings instead of legacy structure/tree
  useEffect(() => {
    if (!config) {
      setFileTree([]);
      setIsFileTreeLoading(false);
      return;
    }

    const newTree: any[] = [];

    // 1. Map Canon Paths
    if (config.canonPaths && config.canonPaths.length > 0) {
      config.canonPaths.forEach(p => {
        newTree.push({
          id: p.id,
          name: p.name,
          mimeType: 'application/vnd.google-apps.folder',
          driveId: p.id
        });
      });
    }

    // 2. Map Resource Paths
    if (config.resourcePaths && config.resourcePaths.length > 0) {
      config.resourcePaths.forEach(p => {
        newTree.push({
          id: p.id,
          name: p.name,
          mimeType: 'application/vnd.google-apps.folder',
          driveId: p.id
        });
      });
    }

    // 3. Fallback to Master Folder if no decentralized paths
    if (newTree.length === 0 && config.folderId) {
      newTree.push({
        id: config.folderId,
        name: 'Carpeta Maestra',
        mimeType: 'application/vnd.google-apps.folder',
        driveId: config.folderId
      });
    }

    setFileTree(newTree);
    setIsFileTreeLoading(false);

  }, [config]);

  return (
    <ProjectConfigContext.Provider value={{
      config,
      loading,
      updateConfig,
      refreshConfig: refreshConfig,
      technicalError,
      setTechnicalError,
      fileTree,
      isFileTreeLoading,
      user,
      customGeminiKey,
      setCustomGeminiKey
    }}>
      {children}
    </ProjectConfigContext.Provider>
  );
};
