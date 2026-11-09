import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';
import { Modal } from './Modal';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string, kind: 'mundo' | 'realista') => Promise<void>;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [projectName, setProjectName] = useState('');
    // Nov 2026: las carpetas dependen del libro. Un libro realista no necesita «Bestiario» ni «Objetos».
    const [kind, setKind] = useState<'mundo' | 'realista'>('mundo');
    const [isLoading, setIsLoading] = useState(false);

    // 🟢 LOCALIZATION
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].createProject;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectName.trim()) return;

        setIsLoading(true);
        try {
            await onSubmit(projectName, kind);
            onClose();
        } catch (error) {
            console.error("Error creating project:", error);
            // Error handling is expected to be done by the parent (toast)
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            className="max-w-md"
            title={
                <span className="flex items-center gap-2">
                    <Sparkles className="text-mira" size={18} />
                    {t.modalTitle}
                </span>
            }
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-titanium-400 hover:text-titanium-200 hover:bg-titanium-800/50 rounded-lg transition-colors"
                    >
                        {t.cancel}
                    </button>
                    <button
                        type="submit"
                        form="create-project-form"
                        disabled={!projectName.trim() || isLoading}
                        className="flex items-center gap-2 px-5 py-2 bg-coral text-on-coral hover:brightness-110 text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                {t.creating}
                            </>
                        ) : (
                            t.create
                        )}
                    </button>
                </>
            }
        >
            <form id="create-project-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="projectName" className="text-xs font-semibold text-titanium-400">
                        {t.projectName}
                    </label>
                    <input
                        id="projectName"
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder={t.placeholder}
                        className="w-full px-4 py-3 bg-titanium-950 border border-titanium-700 rounded-lg text-titanium-100 placeholder-titanium-600 focus:outline-none focus:ring-2 focus-visible:ring-mira/40 focus:border-mira/70 transition-all"
                        autoFocus
                        disabled={isLoading}
                    />
                    <p className="text-xs text-titanium-500 leading-relaxed">
                        {t.description}
                    </p>
                </div>
                <fieldset className="space-y-2" disabled={isLoading}>
                    <legend className="text-xs font-semibold text-titanium-400 mb-2">¿Qué tipo de historia es?</legend>
                    {([
                        ['mundo', 'Con un mundo propio', 'Fantasía, ciencia ficción, mundos inventados: carpetas para universo, personajes, bestiario y objetos.'],
                        ['realista', 'En nuestro mundo', 'Realista, contemporánea, histórica: solo personajes, lugares y reglas del mundo, y tu manuscrito.'],
                    ] as const).map(([v, label, hint]) => (
                        <label key={v} className={`flex gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${kind === v ? 'border-mira/60 bg-mira/10' : 'border-titanium-700 hover:border-titanium-500'}`}>
                            <input type="radio" name="bookKind" value={v} checked={kind === v} onChange={() => setKind(v)} className="mt-1 accent-[var(--color-mira)]" />
                            <span><span className="block text-sm text-titanium-100">{label}</span><span className="block text-xs text-titanium-400 leading-relaxed">{hint}</span></span>
                        </label>
                    ))}
                </fieldset>
            </form>
        </Modal>
    );
};

export default CreateProjectModal;
