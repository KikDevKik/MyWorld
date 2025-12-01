import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { User, Brain, Sparkles } from 'lucide-react';

interface SettingsModalProps {
    onClose: () => void;
    onSave: (url: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
    const [url, setUrl] = useState('');
    const [profile, setProfile] = useState({
        style: '',
        inspirations: '',
        rules: ''
    });
    const [isLoading, setIsLoading] = useState(false);

    // Load profile on mount
    useEffect(() => {
        const loadProfile = async () => {
            try {
                const functions = getFunctions();
                const getUserProfile = httpsCallable(functions, 'getUserProfile');
                const result = await getUserProfile();
                if (result.data) {
                    setProfile(result.data as any);
                }
            } catch (error) {
                console.error('Error loading profile:', error);
            }
        };
        loadProfile();
    }, []);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            // Save Drive URL (existing functionality)
            if (url) {
                onSave(url);
            }

            // Save writer profile
            const functions = getFunctions();
            const saveUserProfile = httpsCallable(functions, 'saveUserProfile');
            await saveUserProfile(profile);

            toast.success('Perfil guardado correctamente');
            onClose();
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error('Error al guardar el perfil');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-titanium-950 rounded-xl border border-titanium-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-6 animate-fade-in">

                {/* HEADER */}
                <div className="flex items-center gap-3 border-b border-titanium-800 pb-4">
                    <div className="p-2 bg-accent-DEFAULT/10 rounded-lg">
                        <User size={24} className="text-accent-DEFAULT" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-titanium-100">Configuración</h3>
                        <p className="text-xs text-titanium-400">Personaliza tu experiencia de escritura</p>
                    </div>
                </div>

                {/* SECTION 1: DRIVE INTEGRATION */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Brain size={18} className="text-accent-DEFAULT" />
                        <h4 className="text-sm font-bold text-titanium-100 uppercase tracking-wider">Integración Drive</h4>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-titanium-300" htmlFor="gdrive-link-input">
                            Pega aquí el enlace de tu carpeta de Google Drive
                        </label>
                        <input
                            id="gdrive-link-input"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="w-full bg-white border border-titanium-300 text-gray-900 placeholder:text-gray-400 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT/50 outline-none"
                            placeholder="https://drive.google.com/drive/folders/..."
                            type="text"
                        />
                    </div>
                </div>

                {/* DIVIDER */}
                <div className="border-t border-titanium-800" />

                {/* SECTION 2: WRITER PROFILE */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-accent-DEFAULT" />
                        <h4 className="text-sm font-bold text-titanium-100 uppercase tracking-wider">Perfil de Escritor</h4>
                    </div>
                    <p className="text-xs text-titanium-400 -mt-2">
                        Define tu identidad narrativa. La IA usará esto para personalizar todas sus respuestas.
                    </p>

                    {/* STYLE */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-titanium-100">
                            Estilo y Tono
                        </label>
                        <textarea
                            value={profile.style}
                            onChange={(e) => setProfile({ ...profile, style: e.target.value })}
                            className="w-full bg-white border border-titanium-300 text-gray-900 placeholder:text-gray-400 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT/50 outline-none resize-none"
                            placeholder="Ej: Humor seco, fantasía oscura, primera persona en presente"
                            rows={3}
                        />
                    </div>

                    {/* INSPIRATIONS */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-titanium-100">
                            Inspiraciones
                        </label>
                        <textarea
                            value={profile.inspirations}
                            onChange={(e) => setProfile({ ...profile, inspirations: e.target.value })}
                            className="w-full bg-white border border-titanium-300 text-gray-900 placeholder:text-gray-400 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT/50 outline-none resize-none"
                            placeholder="Ej: Sistemas de magia de Brandon Sanderson, estética Cyberpunk"
                            rows={3}
                        />
                    </div>

                    {/* RULES */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-titanium-100">
                            Reglas de Oro (Do's & Don'ts)
                        </label>
                        <textarea
                            value={profile.rules}
                            onChange={(e) => setProfile({ ...profile, rules: e.target.value })}
                            className="w-full bg-white border border-titanium-300 text-gray-900 placeholder:text-gray-400 p-3 rounded-xl focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT/50 outline-none resize-none"
                            placeholder="Ej: Sin subtramas románticas, mantener la magia lógica y consistente"
                            rows={3}
                        />
                    </div>
                </div>

                {/* ACTIONS */}
                <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-titanium-800">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-5 bg-transparent text-titanium-400 text-sm font-bold leading-normal tracking-[0.015em] hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="truncate">Cancelar</span>
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="flex min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-10 px-5 bg-accent-DEFAULT text-titanium-950 text-sm font-bold leading-normal tracking-[0.015em] hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="truncate">{isLoading ? 'Guardando...' : 'Guardar'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
