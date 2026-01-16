import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import { ProjectConfig } from '../types';

interface ProjectConfigContextType {
  config: ProjectConfig | null;
  loading: boolean;
  currentProjectId: string | null;
  currentProjectName: string | null;
  updateConfig: (newConfig: ProjectConfig) => Promise<void>;
  refreshConfig: () => Promise<void>;
  setProjectIdentity: (id: string, name: string) => void;
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
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);

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
      const data = result.data as ProjectConfig;
      setConfig(data);

      if (data.folderId) {
          setCurrentProjectId(data.folderId);
      }
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

        if (newConfig.folderId) {
            setCurrentProjectId(newConfig.folderId);
        }

        toast.success('Configuración guardada correctamente.');
    } catch (error) {
        console.error('Error saving project config:', error);
        toast.error('Error al guardar la configuración.');
        throw error;
    }
  };

  const setProjectIdentity = (id: string, name: string) => {
      console.log(`🔒 Project Identity Locked: ${name} (${id})`);
      setCurrentProjectId(id);
      setCurrentProjectName(name);
  };

  return (
    <ProjectConfigContext.Provider value={{
        config,
        loading,
        currentProjectId,
        currentProjectName,
        updateConfig,
        refreshConfig: fetchConfig,
        setProjectIdentity
    }}>
      {children}
    </ProjectConfigContext.Provider>
  );
};
