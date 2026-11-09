// Nov 2026: el escritorio vacío. Si todavía no hay proyecto, Mira guía los tres primeros pasos (antes estaban
// escondidos en la barra de documentos, con palabras como «bóveda» o «Crear Estándar»). Si ya hay proyecto pero
// ningún capítulo abierto, invita a abrir uno (en el celular, con un botón: allí la barra es un cajón).
import React from 'react';
import { Check, FolderOpen } from 'lucide-react';
import { MiraSprite } from '../mira/MiraSprite';

const btnPrimary = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60';
const btnSecondary = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-titanium-100 rounded-lg border border-titanium-700 hover:border-titanium-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60';

interface Props {
    hasProject: boolean;
    driveConnected: boolean;
    narrow: boolean;
    onConnectDrive: () => void;
    onCreateProject: () => void;
    onUseExistingFolder: () => void;
    onTalkToMira: () => void;
    onOpenDocuments: () => void;
}

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children: React.ReactNode }) {
    return (
        <li className="flex gap-4">
            <span aria-hidden="true" className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm tabular-nums border ${done ? 'bg-logro/20 border-logro/50 text-logro' : 'border-titanium-600 text-titanium-200'}`}>
                {done ? <Check size={15} /> : n}
            </span>
            <div className="min-w-0 flex-1 pb-1">
                <h2 className="font-serif text-[17px] text-titanium-50">{title}{done && <span className="sr-only"> (listo)</span>}</h2>
                <div className="mt-1 flex flex-col gap-3 text-[15px] text-titanium-300 leading-relaxed">{children}</div>
            </div>
        </li>
    );
}

export default function FirstSteps({ hasProject, driveConnected, narrow, onConnectDrive, onCreateProject, onUseExistingFolder, onTalkToMira, onOpenDocuments }: Props) {
    if (hasProject) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-titanium-950 px-6 text-center">
                <MiraSprite pose="esperando" label="Mira espera" />
                <p className="text-[15px] text-titanium-300 max-w-[360px] text-pretty">
                    {narrow ? 'Abre un capítulo de tus documentos para empezar a escribir.' : 'Elige un capítulo en tus documentos, a la izquierda, para empezar a escribir.'}
                </p>
                {narrow && <button onClick={onOpenDocuments} className={btnSecondary}><FolderOpen size={16} aria-hidden="true" /> Abrir tus documentos</button>}
            </div>
        );
    }
    return (
        <div className="flex-1 overflow-y-auto bg-titanium-950">
            <div className="max-w-[560px] mx-auto px-5 sm:px-8 py-10 flex flex-col gap-8">
                <div className="flex items-end gap-4">
                    <MiraSprite pose="saludo" label="Mira te saluda" />
                    <div className="pb-2">
                        <h1 className="font-serif text-[28px] leading-tight text-titanium-50">Empecemos</h1>
                        <p className="text-[15px] text-titanium-300">Tres pasos y estás escribiendo.</p>
                    </div>
                </div>
                <ol className="flex flex-col gap-6">
                    <Step n={1} done={driveConnected} title="Conecta tu Google Drive">
                        <p>Tus documentos se guardan ahí, en tu cuenta. MyWorld solo crea y edita las carpetas de tu proyecto.</p>
                        {!driveConnected && <div><button onClick={onConnectDrive} className={btnPrimary}>Conectar Google Drive</button></div>}
                    </Step>
                    <Step n={2} title="Crea tu proyecto">
                        <p>MyWorld arma en tu Drive las carpetas para tu mundo (personajes, lugares, reglas) y tus capítulos.</p>
                        <div className="flex flex-wrap items-center gap-3">
                            <button onClick={onCreateProject} disabled={!driveConnected} className={driveConnected ? btnPrimary : btnSecondary}>Crear mi proyecto</button>
                            <button onClick={onUseExistingFolder} disabled={!driveConnected} className="text-sm text-titanium-300 hover:text-titanium-50 underline underline-offset-4 disabled:opacity-40 disabled:no-underline">Ya tengo una carpeta en Drive</button>
                        </div>
                        {!driveConnected && <p className="text-sm text-titanium-500">Primero conecta tu Drive.</p>}
                    </Step>
                    <Step n={3} title="Escribe, o cuéntale tu idea a Mira">
                        <p>Abre tu primer capítulo. Si todavía no sabes por dónde empezar, Mira te ayuda a encontrarlo.</p>
                        <div><button onClick={onTalkToMira} className={btnSecondary}>Hablar con Mira</button></div>
                    </Step>
                </ol>
            </div>
        </div>
    );
}
