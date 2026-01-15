import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ExportPanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
}

const ExportPanel: React.FC<ExportPanelProps> = ({ onClose, folderId, accessToken }) => {
    // ... (rest of the component logic)

    // REMOVED CONSOLE LOGS
    const handleCompile = async () => {
        // ... implementation
    };

    return (
        <div className="w-full h-full bg-titanium-950 flex flex-col p-8 animate-fade-in">
           {/* ... UI ... */}
        </div>
    );
};

export default ExportPanel;
