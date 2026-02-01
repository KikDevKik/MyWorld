import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Character } from '../types/core';
import { AudioSegment, NarratorControls } from '../types/editorTypes';
import { NarratorService } from '../services/narratorService';
import { stringToColor } from '../utils/colorUtils';
import { toast } from 'sonner';

export const useNarrator = () => {
    const [segments, setSegments] = useState<AudioSegment[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Ref to track playing state inside closures/callbacks
    const isPlayingRef = useRef(false);

    // Caching Refs
    const lastAnalyzedText = useRef<string | null>(null);
    const cachedSegments = useRef<AudioSegment[] | null>(null);

    // Ensure session ID persists for the component lifecycle
    const sessionIdRef = useRef<string>(`narrator-${Date.now()}`);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    const resetCache = useCallback(() => {
        lastAnalyzedText.current = null;
        cachedSegments.current = null;
    }, []);

    const stop = useCallback(() => {
        window.speechSynthesis.cancel();
        isPlayingRef.current = false;
        setIsPlaying(false);
        setCurrentSegmentIndex(0);
    }, []);

    const pause = useCallback(() => {
        window.speechSynthesis.cancel();
        isPlayingRef.current = false;
        setIsPlaying(false);
    }, []);

    // 🟢 TTS ENGINE (THE THROAT)
    const speakSegment = useCallback((index: number, segmentList: AudioSegment[]) => {
        // Safety Check
        if (!isPlayingRef.current) return;

        // End of Playlist
        if (index >= segmentList.length) {
            stop();
            return;
        }

        const segment = segmentList[index];
        const utterance = new SpeechSynthesisUtterance(segment.text);

        // 1. Voice Selection (Spanish Priority)
        const voices = window.speechSynthesis.getVoices();
        const spanishVoices = voices.filter(v => v.lang.toLowerCase().startsWith('es'));

        let selectedVoice: SpeechSynthesisVoice | undefined;

        if (spanishVoices.length > 0) {
            // Try to match Gender
            if (segment.voiceProfile.gender === 'FEMALE') {
                selectedVoice = spanishVoices.find(v => v.name.toLowerCase().match(/(female|woman|niña|mujer|monica|paulina|helena|laura|samantha)/));
            } else if (segment.voiceProfile.gender === 'MALE') {
                selectedVoice = spanishVoices.find(v => v.name.toLowerCase().match(/(male|man|niño|hombre|jorge|juan|pablo|pedro)/));
            }
            // Fallback to any Spanish voice if gender match fails
            if (!selectedVoice) selectedVoice = spanishVoices[0];
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        // 2. Pitch & Rate (Characterization)
        switch(segment.voiceProfile.age) {
            case 'CHILD': utterance.pitch = 1.2; break;
            case 'ELDER': utterance.pitch = 0.8; break;
            default: utterance.pitch = 1.0;
        }

        // Slight rate variation based on emotion could go here, but sticking to 1.0 for now
        utterance.rate = 1.0;

        // 3. Events
        utterance.onstart = () => {
             setCurrentSegmentIndex(index);
        };

        utterance.onend = () => {
            // Recursively play next segment ONLY if we are still "playing"
            if (isPlayingRef.current) {
                speakSegment(index + 1, segmentList);
            }
        };

        utterance.onerror = (e) => {
            console.warn("TTS Utterance Error:", e);
            // Attempt to continue? Or stop?
            // Often 'canceled' error happens on stop(), which is fine.
            if (isPlayingRef.current && e.error !== 'canceled') {
                 speakSegment(index + 1, segmentList); // Skip bad segment
            }
        };

        window.speechSynthesis.speak(utterance);
    }, [stop]);

    const play = useCallback(() => {
        if (segments.length === 0) return;

        // Resume logic
        setIsPlaying(true);
        isPlayingRef.current = true;

        // If we are at the end, reset to 0? Or just try to play current?
        // speakSegment handles index >= length check.
        speakSegment(currentSegmentIndex, segments);
    }, [segments, currentSegmentIndex, speakSegment]);

    const skipForward = useCallback(() => {
        if (segments.length === 0) return;
        const nextIndex = Math.min(currentSegmentIndex + 1, segments.length - 1);

        if (isPlaying) {
             speakSegment(nextIndex, segments);
        } else {
             setCurrentSegmentIndex(nextIndex);
        }
    }, [segments, currentSegmentIndex, isPlaying, speakSegment]);

    const skipBackward = useCallback(() => {
        if (segments.length === 0) return;
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

             // Start Playback
             setIsPlaying(true);
             isPlayingRef.current = true;

             // Reset to 0 for fresh play?
             // Logic: analyze is called on "start" intent.
             setCurrentSegmentIndex(0);
             speakSegment(0, cachedSegments.current);
             return;
        }

        setIsLoading(true);
        stop(); // Reset player

        try {
            toast.info("El Director está analizando la escena...");
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
            toast.error("Error al analizar la escena.");
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
