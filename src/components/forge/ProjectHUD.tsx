import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useProjectConfig } from '../ProjectConfigContext';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SentinelStatus {
  status: 'SECURE' | 'FAILED' | 'LOADING';
  connection: boolean;
  project?: string;
  errorCode?: string;
  details?: string;
}

const ProjectHUD: React.FC = () => {
  const { config } = useProjectConfig();
  const [sentinel, setSentinel] = useState<SentinelStatus>({ status: 'LOADING', connection: false });

  useEffect(() => {
    const pulse = async () => {
      try {
        const functions = getFunctions();
        const checkSentinelIntegrity = httpsCallable(functions, 'checkSentinelIntegrity');

        // Silent Check (Background Pulse)
        const result = await checkSentinelIntegrity();
        const data = result.data as any;

        if (data.status === 'SECURE') {
            setSentinel({ status: 'SECURE', connection: true, project: data.project });
        } else {
            console.error("🛡️ [SENTINEL] Pulse Failed:", data);
            setSentinel({
                status: 'FAILED',
                connection: false,
                errorCode: data.errorCode,
                details: data.details
            });
            // Optional: Toast for admin awareness, but non-intrusive
        }

      } catch (error: any) {
        console.error("🛡️ [SENTINEL] Network Error:", error);
        setSentinel({
            status: 'FAILED',
            connection: false,
            errorCode: 'NETWORK_ERROR',
            details: error.message
        });
      }
    };

    // Initial Pulse
    pulse();

    // Periodic Heartbeat (Every 5 mins)
    const interval = setInterval(pulse, 5 * 60 * 1000);
    return () => clearInterval(interval);

  }, []);

  // Visual Logic
  const projectName = config?.activeBookContext || "Proyecto Desconocido";

  // Status Colors
  const statusColor = sentinel.status === 'SECURE' ? 'bg-emerald-500' : (sentinel.status === 'LOADING' ? 'bg-titanium-500' : 'bg-red-500');
  const glowColor = sentinel.status === 'SECURE' ? 'shadow-[0_0_8px_rgba(16,185,129,0.5)]' : (sentinel.status === 'FAILED' ? 'shadow-[0_0_8px_rgba(239,68,68,0.5)]' : '');

  return (
    <div className="mx-4 mb-6 mt-2 p-3 bg-titanium-900/50 rounded-lg border border-titanium-700/30 flex items-center justify-between group transition-all hover:bg-titanium-800/50">

      {/* LEFT: Project Identity */}
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] text-titanium-500 font-mono tracking-widest uppercase mb-0.5">
          Identidad Activa
        </span>
        <h3 className="text-sm font-bold text-titanium-200 truncate pr-2 group-hover:text-cyan-400 transition-colors">
          {projectName}
        </h3>
      </div>

      {/* RIGHT: Sentinel Pulse */}
      <div className="flex items-center gap-3 shrink-0">

        {/* Connection Status Icon (Hover Tooltip) */}
        <div
            className="relative flex items-center justify-center w-6 h-6 rounded-full bg-titanium-950 border border-titanium-800"
            title={sentinel.status === 'SECURE' ? "Sentinel: SECURE (Secret Manager Linked)" : `Sentinel: ${sentinel.errorCode || 'UNKNOWN ERROR'}`}
        >
            {sentinel.status === 'LOADING' ? (
                <Loader2 size={12} className="text-titanium-500 animate-spin" />
            ) : sentinel.status === 'SECURE' ? (
                <ShieldCheck size={12} className="text-emerald-500" />
            ) : (
                <ShieldAlert size={12} className="text-red-500" />
            )}
        </div>

        {/* 1px Pulse Indicator */}
        <div className="relative flex h-2 w-2">
            {sentinel.status !== 'LOADING' && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor}`}></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor} ${glowColor}`}></span>
        </div>

      </div>
    </div>
  );
};

export default ProjectHUD;
