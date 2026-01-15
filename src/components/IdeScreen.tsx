import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Simplified IdeScreen for this example since we don't have the full code
// Assuming this component is just a placeholder or part of a larger view
const IdeScreen = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full text-titanium-400">
            <h2 className="text-xl font-bold mb-4">IDE Screen</h2>
            <p>Componente de pantalla IDE</p>
        </div>
    );
};

export default IdeScreen;
