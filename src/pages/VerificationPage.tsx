import React, { useEffect, useState } from 'react';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, AlertTriangle, Loader2, Info } from 'lucide-react';

interface VerificationPageProps {
    certificateId: string;
}

interface CertificateData {
    projectId: string;
    projectTitle: string;
    authorName: string;
    timestamp: string;
    humanScore: number;
    totalChars: number;
    hash: string;
}

const VerificationPage: React.FC<VerificationPageProps> = ({ certificateId }) => {
    const [data, setData] = useState<CertificateData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCert = async () => {
            try {
                const db = getFirestore();
                const docRef = doc(db, 'public_certificates', certificateId);
                const snapshot = await getDoc(docRef);

                if (snapshot.exists()) {
                    setData(snapshot.data() as CertificateData);
                } else {
                    setError("Certificado no encontrado o inválido.");
                }
            } catch (e: any) {
                console.error("Verification Error:", e);
                setError("Error de conexión al verificar.");
            } finally {
                setLoading(false);
            }
        };

        fetchCert();
    }, [certificateId]);

    if (loading) {
        return (
            <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-white gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
                <p className="text-sm font-mono tracking-widest opacity-70">VERIFICANDO BLOCKCHAIN...</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="h-screen w-screen bg-red-950 flex flex-col items-center justify-center text-white p-8">
                <div className="p-6 bg-red-900/30 rounded-full border-4 border-red-500 mb-6 animate-pulse">
                    <AlertTriangle className="w-20 h-20 text-red-500" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Certificado Inválido</h1>
                <p className="text-red-200 font-mono text-center max-w-md mb-8">{error}</p>
                <div className="bg-black/40 p-4 rounded text-xs font-mono text-red-400 border border-red-900">
                    ID: {certificateId}
                </div>
            </div>
        );
    }

    const aiScore = 100 - data.humanScore;
    const humanColor = '#10b981'; // Emerald 500
    const aiColor = '#f59e0b'; // Amber 500

    return (
        <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-100 flex flex-col items-center py-12 px-4">

            {/* HEADER */}
            <div className="mb-12 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6">
                    <ShieldCheck size={14} />
                    Certificado de Autoría Verificado
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">
                    {data.projectTitle}
                </h1>
                <p className="text-zinc-500 font-mono text-sm uppercase tracking-wide">
                    Autor: {data.authorName}
                </p>
            </div>

            {/* MAIN CARD */}
            <div className="w-full max-w-3xl bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />

                <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">

                    {/* CHART */}
                    <div className="flex flex-col items-center justify-center">
                        <div
                            className="w-48 h-48 rounded-full shadow-2xl shadow-emerald-900/20 relative flex items-center justify-center"
                            style={{
                                background: `conic-gradient(${humanColor} 0% ${data.humanScore}%, ${aiColor} ${data.humanScore}% 100%)`
                            }}
                        >
                            <div className="w-40 h-40 bg-zinc-900 rounded-full flex flex-col items-center justify-center z-10">
                                <span className="text-4xl font-black text-white">{data.humanScore.toFixed(0)}%</span>
                                <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Humano</span>
                            </div>
                        </div>

                        <div className="flex gap-6 mt-8">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                <div className="flex flex-col">
                                    <span className="text-xs text-zinc-400 font-bold">Humano</span>
                                    <span className="text-[10px] text-zinc-600 font-mono">{data.humanScore.toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-amber-500" />
                                <div className="flex flex-col">
                                    <span className="text-xs text-zinc-400 font-bold">Asistido (IA)</span>
                                    <span className="text-[10px] text-zinc-600 font-mono">{aiScore.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* METRICS */}
                    <div className="flex flex-col gap-6">
                        <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase mb-1">Hash de Integridad</h3>
                            <div className="font-mono text-[10px] text-emerald-500 break-all leading-relaxed opacity-80">
                                {data.hash}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase mb-1">Caracteres</h3>
                                <div className="text-xl font-bold text-white">
                                    {new Intl.NumberFormat('es-ES').format(data.totalChars)}
                                </div>
                            </div>
                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase mb-1">Fecha</h3>
                                <div className="text-sm font-medium text-white">
                                    {new Date(data.timestamp).toLocaleDateString()}
                                </div>
                                <div className="text-[10px] text-zinc-600">
                                    {new Date(data.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 items-start p-3 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-blue-200/70 leading-relaxed">
                                Este documento certifica la proporción de contribución humana vs sintética registrada en el sistema Titanium Audit. Los datos son inmutables.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* FOOTER */}
            <div className="mt-12 flex flex-col items-center gap-2 opacity-40 hover:opacity-80 transition-opacity">
                <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    Titanium Engine Forensic Unit
                </p>
                <div className="h-px w-12 bg-zinc-800" />
                <p className="text-[10px] text-zinc-600">ID: {certificateId}</p>
            </div>
        </div>
    );
};

export default VerificationPage;
