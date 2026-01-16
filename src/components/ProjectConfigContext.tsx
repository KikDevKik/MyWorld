import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import { ProjectConfig } from '../types';

interface ProjectConfigContextType {
  config: ProjectConfig | null;
  loading: boolean;
  updateConfig: (newConfig: ProjectConfig) => Promise<void>;
  refreshConfig: () => Promise<void>;
  technicalError: { isError: boolean; details: any };
  setTechnicalError: (error: { isError: boolean; details: any }) => void;
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

  return (
    <ProjectConfigContext.Provider value={{ config, loading, updateConfig, refreshConfig: fetchConfig, technicalError, setTechnicalError }}>
      {children}
    </ProjectConfigContext.Provider>
  );
};
