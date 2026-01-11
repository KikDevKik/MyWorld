import React, { useState } from 'react';
import useDrivePicker from 'react-google-drive-picker';
import { FileText, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

interface ForgeSourceSelectorProps {
    onSourceSelected: (fileId: string, fileName: string) => void;
    accessToken: string | null;
}

const ForgeSourceSelector: React.FC<ForgeSourceSelectorProps> = ({ onSourceSelected, accessToken }) => {
    const [openPicker] = useDrivePicker();
    const [selectedFile, setSelectedFile] = useState<{ id: string; name: string } | null>(null);

    const handleSelectSource = () => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;

        if (!clientId || !developerKey) {
            toast.error("Missing Google API Configuration");
            return;
        }

        openPicker({
            clientId,
            developerKey,
            viewId: "DOCS", // Show all files, prioritize docs
            viewMimeTypes: "application/vnd.google-apps.document,text/markdown,text/plain",
            setSelectFolderEnabled: false,
            setIncludeFolders: true,
            setOrigin: window.location.protocol + '//' + window.location.host,
            token: accessToken || "",
            showUploadView: false,
            showUploadFolders: false,
            supportDrives: true,
            multiselect: false,
            callbackFunction: (data) => {
                if (data.action === 'picked' && data.docs && data.docs[0]) {
                    const picked = data.docs[0];
                    setSelectedFile({ id: picked.id, name: picked.name });
                }
            }
        });
    };

    const handleConfirm = () => {
        if (selectedFile) {
            onSourceSelected(selectedFile.id, selectedFile.name);
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-titanium-950 text-center animate-fade-in">
            <div className="max-w-md w-full">
                <div className="w-20 h-20 bg-titanium-900 rounded-3xl flex items-center justify-center text-accent-DEFAULT mb-6 mx-auto border border-titanium-800 shadow-2xl shadow-accent-DEFAULT/10">
                    <FileText size={40} />
                </div>

                <h2 className="text-3xl font-bold text-titanium-100 mb-2">Selecciona la Fuente de Verdad</h2>
                <p className="text-titanium-400 mb-8">
                    Elige el capítulo, borrador o lista de personajes que quieres que la IA analice.
                    Esto definirá el contexto de la sesión.
                </p>

                <div className="space-y-4">
                    <button
                        onClick={handleSelectSource}
                        className="w-full p-4 bg-titanium-900 hover:bg-titanium-800 border border-titanium-700 hover:border-accent-DEFAULT/50 rounded-xl flex items-center justify-between group transition-all"
                    >
                        <div className="flex items-center gap-3 text-left">
                            <div className="p-2 bg-titanium-950 rounded-lg text-titanium-400 group-hover:text-white transition-colors">
                                <FileText size={20} />
                            </div>
                            <span className={`font-semibold ${selectedFile ? 'text-white' : 'text-titanium-500'}`}>
                                {selectedFile ? selectedFile.name : "Seleccionar Archivo..."}
                            </span>
                        </div>
                        {selectedFile && <span className="text-xs text-accent-DEFAULT font-bold px-2 py-1 bg-accent-DEFAULT/10 rounded">READY</span>}
                    </button>

                    <button
                        onClick={handleConfirm}
                        disabled={!selectedFile}
                        className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                            selectedFile
                                ? "bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 shadow-lg hover:shadow-accent-DEFAULT/20"
                                : "bg-titanium-800 text-titanium-600 cursor-not-allowed"
                        }`}
                    >
                        {selectedFile ? (
                            <>
                                <Play size={20} fill="currentColor" />
                                <span>Iniciar Deep Scan</span>
                            </>
                        ) : (
                            <span>Selecciona un archivo primero</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ForgeSourceSelector;
