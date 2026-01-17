import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
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
}

export const ProjectConfigContext = createContext<ProjectConfigContextType | undefined>(undefined);

export const useProjectConfig = () => {
  const context = useContext(ProjectConfigContext);
  if (!context) {
    throw new Error('useProjectConfig must be used within a ProjectConfigProvider');
  }
  return context;
};

export const ProjectConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [technicalError, setTechnicalError] = useState<{ isError: boolean; details: any }>({ isError: false, details: null });

  // 🟢 NEW: File Tree State
  const [fileTree, setFileTree] = useState<FileNode[] | null>(null);
  const [isFileTreeLoading, setIsFileTreeLoading] = useState(true);

  const fetchConfig = async () => {
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
            canonPaths: [],
            resourcePaths: [],
            chronologyPath: null,
            activeBookContext: "Prototipo Titanium",
            folderId: "" // Empty to trigger "Connect Drive" button for testing
        });
        setLoading(false);
        setIsFileTreeLoading(false); // Also stop tree loading
        return;
    }

    fetchConfig();
  }, []);

  const updateConfig = async (newConfig: ProjectConfig) => {
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
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        setFileTree(null);
        setIsFileTreeLoading(false);
        return;
    }

    // 🟢 GHOST BYPASS
    if (import.meta.env.DEV && import.meta.env.VITE_JULES_MODE === 'true') {
        return;
    }

    const db = getFirestore();
    const docRef = doc(db, "TDB_Index", user.uid, "structure", "tree");

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
  }, []); // Only runs once on mount (and implicit auth state)

  return (
    <ProjectConfigContext.Provider value={{
        config,
        loading,
        updateConfig,
        refreshConfig: fetchConfig,
        technicalError,
        setTechnicalError,
        fileTree,
        isFileTreeLoading
    }}>
      {children}
    </ProjectConfigContext.Provider>
  );
};
