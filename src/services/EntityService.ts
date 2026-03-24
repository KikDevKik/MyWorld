import { getFirestore, collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { Character } from '../types';
import { SoulEntity, EntityTier } from '../types/forge';

export class EntityService {
    /**
     * Subscribe to Anchor Characters (Unified Graph Nodes)
     */
    static subscribeToAnchors(userId: string, contextId: string, onUpdate: (characters: Character[]) => void, onError?: (error: any) => void): Unsubscribe {
        const db = getFirestore();
        // 🟢 ENTTITY UNIFICATION: Pointing to new root collection 'WorldEntities'
        const q = query(
            collection(db, "WorldEntities", userId, "characters"),
            where("sourceContext", "==", contextId)
        );

        return onSnapshot(q, (snapshot) => {
            const chars: Character[] = [];
            snapshot.forEach(doc => {
                const d = doc.data();

                let derivedCategory = d.category;
                if (!derivedCategory) {
                    const rawType = (d.type || d.subtype || '').toLowerCase();
                    if (rawType.includes('creature') || rawType.includes('bestiary') || rawType.includes('fauna')) derivedCategory = 'CREATURE';
                    else if (rawType.includes('flora') || rawType.includes('plant')) derivedCategory = 'FLORA';
                    else if (rawType.includes('location') || rawType.includes('place')) derivedCategory = 'LOCATION';
                    else if (rawType.includes('object') || rawType.includes('item')) derivedCategory = 'OBJECT';
                    else derivedCategory = 'PERSON';
                }

                chars.push({
                    id: doc.id,
                    ...d,
                    category: derivedCategory,
                    status: 'EXISTING',
                    tier: d.tier as EntityTier
                } as Character);
            });
            onUpdate(chars);
        }, onError);
    }

    /**
     * Subscribe to Ghosts and Limbos (Detected Entities)
     */
    static subscribeToDetectedEntities(userId: string, sagaIds: string[], onUpdate: (entities: SoulEntity[]) => void, onError?: (error: any) => void): Unsubscribe {
        const db = getFirestore();
        // 🟢 ENTITY UNIFICATION: Pointing to new root collection 'WorldEntities'
        const q = query(
            collection(db, "WorldEntities", userId, "forge_detected_entities"),
            where("saga", "in", sagaIds.length > 0 ? sagaIds : ['Global'])
        );

        return onSnapshot(q, (snapshot) => {
            const entities: SoulEntity[] = [];
            snapshot.forEach(doc => {
                const d = doc.data();

                let derivedCategory = d.category;
                if (!derivedCategory) {
                    const rawType = (d.type || d.tier || d.reasoning || '').toLowerCase();
                    if (rawType.includes('event') || rawType.includes('evento') || rawType.includes('año') || rawType.includes('year') || rawType.includes('timeline')) {
                        derivedCategory = 'OBJECT'; 
                    }
                    else if (rawType.includes('creature') || rawType.includes('bestiary') || rawType.includes('fauna') || rawType.includes('bestia') || rawType.includes('monster') || rawType.includes('monstruo')) derivedCategory = 'CREATURE';
                    else if (rawType.includes('flora') || rawType.includes('plant')) derivedCategory = 'FLORA';
                    else if (rawType.includes('location') || rawType.includes('place')) derivedCategory = 'LOCATION';
                    else if (rawType.includes('object') || rawType.includes('item')) derivedCategory = 'OBJECT';
                    else derivedCategory = 'PERSON';
                }

                entities.push({
                    id: doc.id,
                    name: d.name,
                    tier: d.tier as EntityTier,
                    category: derivedCategory || 'PERSON',
                    sourceSnippet: d.sourceSnippet || (d.foundIn || []).join('\n'),
                    occurrences: d.occurrences || d.confidence || 0,
                    tags: d.tags,
                    role: d.reasoning,
                    mergeSuggestion: d.mergeSuggestion,
                    lastDetected: d.lastDetected || new Date().toISOString()
                });
            });

            onUpdate(entities);
        }, onError);
    }
}