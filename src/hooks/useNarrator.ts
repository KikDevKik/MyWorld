import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Character } from '../types/core';
import { AudioSegment, NarratorControls } from '../types/editorTypes';
import { NarratorService } from '../services/narratorService';
import { TTSService } from '../services/ttsService';
import { stringToColor } from '../utils/colorUtils';
import { toast } from 'sonner';

export const useNarrator = () => {
    const [segments, setSegments] = useState<AudioSegment[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Ref to track playing state inside closures/callbacks
    const isPlayingRef = useRef(false);

    // Track latest play request to handle race conditions
    const playRequestRef = useRef(0);

    // Audio Player Ref
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Caching Refs
    const lastAnalyzedText = useRef<string | null>(null);
    const cachedSegments = useRef<AudioSegment[] | null>(null);

    // Ensure session ID persists for the component lifecycle
    const sessionIdRef = useRef<string>(`narrator-${Date.now()}`);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            TTSService.clearCache();
        };
    }, []);

    const resetCache = useCallback(() => {
        lastAnalyzedText.current = null;
        cachedSegments.current = null;
        TTSService.clearCache();
    }, []);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        isPlayingRef.current = false;
        setIsPlaying(false);
        setCurrentSegmentIndex(0);
    }, []);

    const pause = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        isPlayingRef.current = false;
        setIsPlaying(false);
    }, []);

    // 🟢 TTS ENGINE (THE THROAT)
    // Now powered by Gemini TTS via TTSService
    const speakSegment = useCallback(async (index: number, segmentList: AudioSegment[]) => {
        // Safety Check
        if (!isPlayingRef.current) return;

        // Generate a new Request ID
        const requestId = ++playRequestRef.current;

        // End of Playlist
        if (index >= segmentList.length) {
            stop();
            return;
        }

        const segment = segmentList[index];
        setCurrentSegmentIndex(index);

        try {
            // 1. Synthesize (or get from cache)
            const audioUrl = await TTSService.synthesize(segment.text, segment.voiceProfile);

            // RACE CHECK: If another request started while we were fetching, abort this one.
            if (requestId !== playRequestRef.current) {
                console.log(`Aborting stale playback request ${requestId}`);
                return;
            }

            if (!audioUrl) {
                // If synthesis fails, maybe skip?
                console.warn(`Skipping segment ${index} due to TTS failure.`);
                if (isPlayingRef.current) {
                    speakSegment(index + 1, segmentList);
                }
                return;
            }

            // Check if we were stopped while fetching
            if (!isPlayingRef.current) return;

            // 2. Play Audio
            if (audioRef.current) {
                audioRef.current.pause(); // Ensure previous is stopped
            }

            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onended = () => {
                // Only proceed if we are still the active request context (or if play flow is valid)
                // Actually, onended triggers for the *current* audio.
                // If a new request overwrote audioRef.current, the old audio would be garbage or paused.
                // But good to be safe.
                if (isPlayingRef.current && requestId === playRequestRef.current) {
                    speakSegment(index + 1, segmentList);
                }
            };

            audio.onerror = (e) => {
                console.error("Audio Playback Error:", e);
                if (isPlayingRef.current && requestId === playRequestRef.current) {
                    speakSegment(index + 1, segmentList);
                }
            };

            await audio.play();

            // 3. Preload Next (Optimistic)
            if (index + 1 < segmentList.length) {
                const nextSeg = segmentList[index + 1];
                TTSService.synthesize(nextSeg.text, nextSeg.voiceProfile).catch(e => console.log("Preload failed", e));
            }

        } catch (error) {
            console.error("Playback Sequence Error:", error);
            // Only skip if we are still relevant
            if (isPlayingRef.current && requestId === playRequestRef.current) {
                speakSegment(index + 1, segmentList);
            }
        }
    }, [stop]);

    const play = useCallback(() => {
        if (segments.length === 0) return;

        // Resume logic
        setIsPlaying(true);
        isPlayingRef.current = true;

        // If audio is already instantiated and paused, resume it?
        // Implementing simple resume:
        if (audioRef.current && audioRef.current.paused && audioRef.current.currentTime > 0) {
            audioRef.current.play()
                .then(() => {
                    // Re-attach ended listener just in case? (It should persist)
                })
                .catch(e => {
                    console.error("Resume failed, restarting segment", e);
                    speakSegment(currentSegmentIndex, segments);
                });
        } else {
             speakSegment(currentSegmentIndex, segments);
        }

    }, [segments, currentSegmentIndex, speakSegment]);

    const skipForward = useCallback(() => {
        if (segments.length === 0) return;

        // Stop current audio immediately
        if (audioRef.current) audioRef.current.pause();

        const nextIndex = Math.min(currentSegmentIndex + 1, segments.length - 1);

        if (isPlaying) {
             speakSegment(nextIndex, segments);
        } else {
             setCurrentSegmentIndex(nextIndex);
        }
    }, [segments, currentSegmentIndex, isPlaying, speakSegment]);

    const skipBackward = useCallback(() => {
        if (segments.length === 0) return;

        // Stop current audio
        if (audioRef.current) audioRef.current.pause();

        const nextIndex = Math.max(currentSegmentIndex - 1, 0);

        if (isPlaying) {
             speakSegment(nextIndex, segments);
        } else {
             setCurrentSegmentIndex(nextIndex);
        }
    }, [segments, currentSegmentIndex, isPlaying, speakSegment]);

    const analyze = useCallback(async (text: string, characters: Character[]) => {
        if (!text.trim()) {
            toast.warning("No hay texto para narrar.");
            return;
        }

        // SMART CACHE CHECK
        if (lastAnalyzedText.current === text && cachedSegments.current) {
             console.log("Reading from Cache 🧠");
             setSegments(cachedSegments.current);

             setIsPlaying(true);
             isPlayingRef.current = true;

             setCurrentSegmentIndex(0);
             speakSegment(0, cachedSegments.current);
             return;
        }

        setIsLoading(true);
        stop(); // Reset player

        try {
            toast.info("El Director (Gemini 3.0) está analizando la escena...");
            const result = await NarratorService.analyzeScene(text, characters, sessionIdRef.current);

            // UPDATE CACHE
            setSegments(result);
            lastAnalyzedText.current = text;
            cachedSegments.current = result;

            toast.success(`Guión generado: ${result.length} segmentos.`);

            // Auto-Play Logic
            setIsPlaying(true);
            isPlayingRef.current = true;
            setCurrentSegmentIndex(0);
            speakSegment(0, result);

        } catch (error) {
            console.error(error);
            // toast handled in service
        } finally {
            setIsLoading(false);
        }
    }, [stop, speakSegment]);

    const controls: NarratorControls = {
        isPlaying,
        currentSegmentIndex,
        play,
        pause,
        stop,
        skipForward,
        skipBackward
    };

    // 🟢 DERIVED: Current Active Segment for Editor
    const activeSegment = useMemo(() => {
        if (!isPlaying || segments.length === 0 || currentSegmentIndex >= segments.length) {
            return null;
        }
        const seg = segments[currentSegmentIndex];

        // Ensure offsets exist
        if (typeof seg.from !== 'number' || typeof seg.to !== 'number') return null;

        // Generate Color (Deterministic Fallback)
        const color = stringToColor(seg.speakerName || 'Narrator');

        return {
            from: seg.from,
            to: seg.to,
            color
        };
    }, [isPlaying, segments, currentSegmentIndex]);

    return {
        controls,
        segments,
        isLoading,
        analyze,
        resetCache, // 👈 Exposed for manual refresh if needed
        activeSegment // 👈 Exposed for Editor wiring
    };
};
