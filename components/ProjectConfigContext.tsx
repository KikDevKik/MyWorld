import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';

interface ProjectConfig {
  canonPaths: string[];
  resourcePaths: string[];
  chronologyPath: string;
  activeBookContext: string;
}

interface ProjectConfigContextType {
  config: ProjectConfig | null;
  loading: boolean;
  updateConfig: (newConfig: ProjectConfig) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const ProjectConfigContext = createContext<ProjectConfigContextType | undefined>(undefined);

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
    <ProjectConfigContext.Provider value={{ config, loading, updateConfig, refreshConfig: fetchConfig }}>
      {children}
    </ProjectConfigContext.Provider>
  );
};
