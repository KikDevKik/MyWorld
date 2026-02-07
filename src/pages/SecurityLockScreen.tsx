import React from 'react';
import { ShieldAlert, AlertTriangle, Lock, RefreshCw, ShieldX } from 'lucide-react';

interface SecurityLockScreenProps {
    errorType?: string;
}

const SecurityLockScreen: React.FC<SecurityLockScreenProps> = ({ errorType }) => {
  const isThrottled = errorType === 'SECURITY_THROTTLED';

  const handleRetry = () => {
      window.location.reload();
  };

  return (
    <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center text-red-500 gap-8 p-8 font-sans overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900 via-transparent to-transparent" />

      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full text-center space-y-8 animate-in fade-in duration-700">

        {/* Icon Container */}
        <div className="relative group">
            <div className="absolute -inset-4 bg-red-500/20 rounded-full blur-xl group-hover:bg-red-500/30 transition-all duration-500" />
            <div className="p-6 bg-red-950/40 rounded-full border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)] relative">
                {isThrottled ? (
                     <ShieldX className="w-16 h-16 text-red-500" strokeWidth={1.5} />
                ) : (
                     <ShieldAlert className="w-16 h-16 text-red-500" strokeWidth={1.5} />
                )}
            </div>
            <div className="absolute top-0 right-0 bg-zinc-900 rounded-full p-2 border border-red-500/50">
                <Lock className="w-4 h-4 text-red-500" />
            </div>
        </div>

        {/* Text Content */}
        <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-[0.2em] uppercase text-red-500 drop-shadow-md">
                {isThrottled ? 'Bloqueo de Navegador' : 'Bloqueo de Perímetro'}
            </h1>

            <div className="h-px w-32 bg-gradient-to-r from-transparent via-red-500/50 to-transparent mx-auto" />

            <h2 className="text-xl font-mono text-red-400 tracking-wide">
                {isThrottled ? 'Interferencia de Privacidad Detectada' : 'Error de Integridad Detectado'}
            </h2>

            <div className="bg-red-950/20 border border-red-900/50 rounded p-6 mt-4 backdrop-blur-sm">
                <div className="flex items-start gap-4 text-left">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="space-y-4">
                        {isThrottled ? (
                            <>
                                <p className="text-sm text-red-200 font-mono leading-relaxed">
                                    Tu navegador (posiblemente <strong>Microsoft Edge</strong>) o una extensión está bloqueando la verificación de seguridad de Google (reCAPTCHA).
                                </p>
                                <div className="space-y-2 text-xs text-red-300/90 font-mono bg-black/20 p-3 rounded border border-red-900/30">
                                    <p className="font-bold text-red-400 uppercase tracking-wider mb-2">Solución Recomendada:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-1">
                                        <li>Desactiva la <strong>"Prevención de seguimiento"</strong> (Tracking Prevention) para este sitio.</li>
                                        <li>Si usas Edge: Clic en el candado/escudo en la barra de URL &rarr; Desactivar protección.</li>
                                        <li>Desactiva bloqueadores de publicidad (uBlock, AdGuard) temporalmente.</li>
                                    </ul>
                                </div>
                                <p className="text-xs text-red-500/60 font-mono mt-2">
                                    Google ha pausado las solicitudes temporalmente (Throttled). Si tras corregir la configuración el error persiste, intenta usar <strong>Chrome</strong>.
                                </p>
                            </>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm text-red-200 font-mono leading-relaxed">
                                    El servidor de Google ha rechazado la señal de la aplicación (403 Forbidden).
                                </p>
                                <p className="text-xs text-red-400/80 font-mono">
                                    Verifique los permisos de reCAPTCHA y la configuración de App Check en la consola de Firebase.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Action Buttons */}
        <button
            onClick={handleRetry}
            className="group flex items-center gap-2 px-6 py-2 bg-red-950/40 hover:bg-red-900/40 border border-red-500/30 hover:border-red-500 rounded-full transition-all duration-300 text-red-400 font-mono text-xs tracking-wider uppercase"
        >
            <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-700" />
            Reintentar Conexión
        </button>

        {/* Footer / Status Code */}
        <div className="flex flex-col items-center gap-2 pt-8 opacity-60">
            <p className="text-[10px] font-mono tracking-widest text-red-600 uppercase">
                Protocolo Centinela: ACTIVO
            </p>
            <p className="text-[10px] font-mono tracking-widest text-red-800">
                REF: {errorType || 'SECURITY_HANDSHAKE_FAILURE'}
            </p>
        </div>
      </div>
    </div>
  );
};

export default SecurityLockScreen;
