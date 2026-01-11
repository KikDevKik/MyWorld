import React from 'react';
import { Bot, Wand2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Character {
    id: string;
    name: string;
    tier: 'MAIN' | 'SUPPORTING';
    sourceType: 'MASTER' | 'LOCAL' | 'HYBRID';
    age?: string;
    role?: string;
    faction?: string;
    content?: string; // For prompts
}

interface ForgeSkeletonProps {
    activeChar: Character;
    onUpdate: (updates: Partial<Character>) => void;
}

const ForgeSkeleton: React.FC<ForgeSkeletonProps> = ({ activeChar, onUpdate }) => {
    const [isGenerating, setIsGenerating] = React.useState(false);
    const [generatedPrompt, setGeneratedPrompt] = React.useState('');
    const [copied, setCopied] = React.useState(false);

    const handleGeneratePrompt = async () => {
        setIsGenerating(true);
        const functions = getFunctions();
        const chatWithGem = httpsCallable(functions, 'chatWithGem');

        try {
            // We use the character's content (if available in parent) or just metadata
            const contextData = activeChar.content ||
                `Name: ${activeChar.name}, Role: ${activeChar.role}, Faction: ${activeChar.faction}, Age: ${activeChar.age}`;

            const result: any = await chatWithGem({
                query: "Generate a high-fidelity art prompt for Stable Diffusion/Midjourney based on this character. Focus on visual details: hair, eyes, clothing, vibe, lighting. Output ONLY the prompt string, no conversational filler.",
                activeFileContent: contextData,
                systemInstruction: "You are a Visual Synthesizer. Extract visual traits and construct a comma-separated art prompt."
            });

            setGeneratedPrompt(result.data.response);
        } catch (error) {
            console.error("Error generating prompt:", error);
            toast.error("Error generating prompt.");
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Prompt copied!");
    };

    return (
        <div className="h-full flex flex-col p-6 bg-titanium-900 border-r border-titanium-800 overflow-y-auto">
            {/* HEADER / TIER */}
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-titanium-400 text-xs font-bold uppercase tracking-wider">The Skeleton</h3>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                    activeChar.tier === 'MAIN'
                    ? 'bg-accent-DEFAULT/10 text-accent-DEFAULT border-accent-DEFAULT/30'
                    : 'bg-titanium-700 text-titanium-400 border-titanium-600'
                }`}>
                    {activeChar.tier === 'MAIN' ? 'TIER 1 (MASTER)' : 'TIER 3 (LOCAL)'}
                </span>
            </div>

            {/* INPUTS */}
            <div className="space-y-4 mb-8">
                <div>
                    <label className="block text-[10px] uppercase font-bold text-titanium-500 mb-1">True Name</label>
                    <input
                        value={activeChar.name}
                        onChange={(e) => onUpdate({ name: e.target.value })}
                        className="w-full bg-titanium-800 text-titanium-100 border border-titanium-700 rounded-lg px-3 py-2 text-sm focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none transition-all"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-titanium-500 mb-1">Age</label>
                        <input
                            value={activeChar.age || ''}
                            onChange={(e) => onUpdate({ age: e.target.value })}
                            placeholder="Unknown"
                            className="w-full bg-titanium-800 text-titanium-100 border border-titanium-700 rounded-lg px-3 py-2 text-sm focus:border-accent-DEFAULT outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-titanium-500 mb-1">Role</label>
                        <input
                            value={activeChar.role || ''}
                            onChange={(e) => onUpdate({ role: e.target.value })}
                            placeholder="Archetype"
                            className="w-full bg-titanium-800 text-titanium-100 border border-titanium-700 rounded-lg px-3 py-2 text-sm focus:border-accent-DEFAULT outline-none transition-all"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] uppercase font-bold text-titanium-500 mb-1">Faction</label>
                    <input
                        value={activeChar.faction || ''}
                        onChange={(e) => onUpdate({ faction: e.target.value })}
                        placeholder="Allegiance"
                        className="w-full bg-titanium-800 text-titanium-100 border border-titanium-700 rounded-lg px-3 py-2 text-sm focus:border-accent-DEFAULT outline-none transition-all"
                    />
                </div>
            </div>

            {/* VISUAL SYNTHESIZER */}
            <div className="mt-auto bg-titanium-950 rounded-xl p-4 border border-titanium-800">
                <div className="flex items-center gap-2 mb-3 text-purple-400">
                    <Wand2 size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Visual Synthesizer</span>
                </div>

                {!generatedPrompt ? (
                     <button
                        onClick={handleGeneratePrompt}
                        disabled={isGenerating}
                        className="w-full py-3 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 text-titanium-300 text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
                     >
                        {isGenerating ? <Bot className="animate-spin" size={14} /> : <Bot size={14} />}
                        {isGenerating ? "Synthesizing..." : "Generate Art Prompt"}
                     </button>
                ) : (
                    <div className="relative group">
                        <div className="bg-titanium-900 p-3 rounded-lg text-[10px] text-titanium-400 font-mono leading-relaxed border border-titanium-800 max-h-32 overflow-y-auto custom-scrollbar">
                            {generatedPrompt}
                        </div>
                        <button
                            onClick={copyToClipboard}
                            className="absolute top-2 right-2 p-1.5 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 rounded-md border border-titanium-700 transition-all opacity-0 group-hover:opacity-100"
                        >
                            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ForgeSkeleton;
