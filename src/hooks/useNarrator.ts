import { useState, useRef, useCallback, useEffect } from 'react';
import { Character } from '../types/core';
import { AudioSegment, NarratorControls } from '../types/editorTypes';
import { NarratorService } from '../services/narratorService';
import { toast } from 'sonner';

export const useNarrator = () => {
    const [segments, setSegments] = useState<AudioSegment[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Interval ref for the player simulation
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Ensure session ID persists for the component lifecycle
    const sessionIdRef = useRef<string>(`narrator-${Date.now()}`);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const stop = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPlaying(false);
        setCurrentSegmentIndex(0);
    }, []);

    const pause = useCallback(() => {
         if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    const startInterval = useCallback((totalSegments: number) => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            setCurrentSegmentIndex(prev => {
                const next = prev + 1;
                if (next >= totalSegments) {
                    // End of playlist
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    setIsPlaying(false);
                    return 0; // Reset to start
                }
                return next;
            });
        }, 2000); // 2 seconds per segment simulation
    }, []);

    const play = useCallback(() => {
        if (segments.length === 0) return;
        setIsPlaying(true);
        startInterval(segments.length);
    }, [segments.length, startInterval]);

    const skipForward = useCallback(() => {
        setCurrentSegmentIndex(prev => Math.min(prev + 1, segments.length - 1));
    }, [segments.length]);

    const skipBackward = useCallback(() => {
        setCurrentSegmentIndex(prev => Math.max(prev - 1, 0));
    }, []);

    const analyze = useCallback(async (text: string, characters: Character[]) => {
        if (!text.trim()) {
            toast.warning("No hay texto para narrar.");
            return;
        }

        setIsLoading(true);
        stop(); // Reset player

        try {
            toast.info("El Director está analizando la escena...");
            const result = await NarratorService.analyzeScene(text, characters, sessionIdRef.current);
            setSegments(result);

            toast.success(`Guión generado: ${result.length} segmentos.`);

            // Auto-Play Logic
            setIsPlaying(true);
            startInterval(result.length);

        } catch (error) {
            console.error(error);
            toast.error("Error al analizar la escena.");
        } finally {
            setIsLoading(false);
        }
    }, [stop, startInterval]);

    const controls: NarratorControls = {
        isPlaying,
        currentSegmentIndex,
        play,
        pause,
        stop,
        skipForward,
        skipBackward
    };

    return {
        controls,
        segments,
        isLoading,
        analyze
    };
};
