// functions/src/services/narrativeDependencyEngine.ts
import * as logger from "firebase-functions/logger";
import { Firestore } from "firebase-admin/firestore";

/**
 * MOTOR DE DEPENDENCIAS NARRATIVAS
 * Implementa G=(V,E,W) del manifiesto neuro-simbólico.
 * 
 * Los nodos (V) son WorldEntities.
 * Las aristas (E) son modules.nexus.relations.
 * Los pesos (W) se derivan del campo 'context' de cada relación.
 * 
 * IMPORTANTE: El grafo se construye en memoria para cada análisis.
 * No se persiste un grafo completo en Firestore. Solo se persisten
 * las alertas de colisión detectadas.
 */

export interface NarrativeNode {
    id: string;
    name: string;
    category: string;
    tier: string;
    // Atributos relevantes para detección de colisiones
    psychology?: Record<string, string>;
    physicalState?: Record<string, any>;
    summary?: string;
    relations: NarrativeEdge[];
}

export interface NarrativeEdge {
    targetId: string;
    targetName: string;
    relationType: string;
    context: string;
    // Peso semántico derivado del context y relationType
    semanticWeight: number;
}

export interface CollisionAlert {
    type: 'WORLD_LAW_VIOLATION' | 'CAUSAL_PARADOX' | 'ECONOMIC_INCONSISTENCY' | 
          'PSYCHOLOGICAL_DRIFT' | 'PHYSICAL_CONTINUITY' | 'TEMPORAL_PARADOX';
    severity: 'critical' | 'warning' | 'info';
    nodeA: { id: string; name: string };
    nodeB: { id: string; name: string };
    description: string;
    // Pregunta socrática específica para este conflicto
    socraticQuestion: string;
}

export interface NarrativeDependencyGraph {
    nodes: Map<string, NarrativeNode>;
    alerts: CollisionAlert[];
    stats: {
        totalNodes: number;
        totalEdges: number;
        criticalAlerts: number;
        warningAlerts: number;
    };
}

/**
 * Construye el grafo de dependencias en memoria desde WorldEntities.
 */
export async function buildNarrativeGraph(
    db: Firestore,
    userId: string,
    projectId: string
): Promise<NarrativeDependencyGraph> {
    logger.info(`🕸️ [NDG] Construyendo grafo para ${userId}/${projectId}`);

    const nodes = new Map<string, NarrativeNode>();
    const alerts: CollisionAlert[] = [];

    try {
        // 1. CARGAR TODOS LOS NODOS (WorldEntities no-RESOURCE)
        const entitiesSnap = await db
            .collection("users").doc(userId)
            .collection("WorldEntities")
            .where("projectId", "==", projectId)
            .where("status", "!=", "archived")
            .get();

        let totalEdges = 0;

        for (const doc of entitiesSnap.docs) {
            const data = doc.data();
            
            // Saltar recursos
            if (data.category === 'RESOURCE') continue;

            // Calcular peso semántico de cada arista
            const relations: NarrativeEdge[] = (data.modules?.nexus?.relations || []).map(
                (r: any) => ({
                    ...r,
                    semanticWeight: calculateSemanticWeight(r.relationType, r.context)
                })
            );

            totalEdges += relations.length;

            nodes.set(doc.id, {
                id: doc.id,
                name: data.name,
                category: data.category,
                tier: data.tier,
                psychology: data.modules?.forge?.psychology,
                physicalState: data.modules?.forge?.physicalState,
                summary: data.modules?.forge?.summary,
                relations
            });
        }

        logger.info(`📊 [NDG] Grafo construido: ${nodes.size} nodos, ${totalEdges} aristas`);

        // 2. DETECTAR COLISIONES
        const detectedAlerts = detectCollisions(nodes);
        alerts.push(...detectedAlerts);

        return {
            nodes,
            alerts,
            stats: {
                totalNodes: nodes.size,
                totalEdges,
                criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
                warningAlerts: alerts.filter(a => a.severity === 'warning').length
            }
        };

    } catch (e) {
        logger.error("[NDG] Error construyendo grafo:", e);
        return {
            nodes: new Map(),
            alerts: [],
            stats: { totalNodes: 0, totalEdges: 0, criticalAlerts: 0, warningAlerts: 0 }
        };
    }
}

/**
 * Calcula el peso semántico de una arista basado en su tipo y contexto.
 * Peso alto = relación crítica que si se rompe genera mayor fricción narrativa.
 */
function calculateSemanticWeight(relationType: string, context: string): number {
    const typeWeights: Record<string, number> = {
        'ENEMY': 0.9,
        'FAMILY': 0.85,
        'LOVE': 0.8,
        'MENTOR': 0.75,
        'ALLY': 0.6,
        'OWNED_BY': 0.7,
        'LOCATED_IN': 0.65,
        'FEARS': 0.7,
        'NEUTRAL': 0.3,
        'KNOWS': 0.4
    };

    const baseWeight = typeWeights[relationType?.toUpperCase()] || 0.5;
    
    // Contexto más largo = más detallado = mayor peso semántico
    const contextBonus = Math.min(context?.length / 500, 0.2);
    
    return Math.min(baseWeight + contextBonus, 1.0);
}

/**
 * Motor de reglas simbólicas.
 * Detecta colisiones entre nodos del grafo.
 * 
 * NOTA: Las colisiones complejas (magia vs economía) las detecta el LLM.
 * Este motor detecta colisiones deterministas: muertos que hablan,
 * objetos destruidos que reaparecen, heridas ignoradas.
 */
function detectCollisions(nodes: Map<string, NarrativeNode>): CollisionAlert[] {
    const alerts: CollisionAlert[] = [];

    // REGLA 1: Personaje muerto con relaciones activas
    for (const [id, node] of nodes) {
        if (node.category === 'PERSON' || node.category === 'CREATURE') {
            const isDeceased = node.physicalState?.currentStatus === 'deceased';
            
            if (isDeceased && node.relations.length > 0) {
                // Verificar si alguna relación debería ser imposible post-muerte
                const activeRelations = node.relations.filter(r => 
                    ['ALLY', 'ENEMY', 'LOVE', 'MENTOR'].includes(r.relationType.toUpperCase())
                );

                if (activeRelations.length > 0) {
                    alerts.push({
                        type: 'PHYSICAL_CONTINUITY',
                        severity: 'warning',
                        nodeA: { id, name: node.name },
                        nodeB: { 
                            id: activeRelations[0].targetId, 
                            name: activeRelations[0].targetName 
                        },
                        description: `${node.name} está marcado como fallecido pero mantiene ${activeRelations.length} relación(es) activa(s). Verifica si estas relaciones ocurren antes o después de su muerte.`,
                        socraticQuestion: `${node.name} figura como muerto en tu worldbuilding. Sin embargo, su relación con ${activeRelations[0].targetName} no tiene una fecha clara. ¿Esta relación ocurre en un flashback, o hay una inconsistencia temporal que debemos resolver?`
                    });
                }
            }
        }
    }

    // REGLA 2: Lesiones físicas no resueltas en personajes activos
    for (const [id, node] of nodes) {
        const injuries = node.physicalState?.injuries || [];
        const unresolvedInjuries = injuries.filter((inj: any) => !inj.isResolved);
        
        if (unresolvedInjuries.length > 0) {
            alerts.push({
                type: 'PHYSICAL_CONTINUITY',
                severity: 'info',
                nodeA: { id, name: node.name },
                nodeB: { id, name: node.name }, // Self-reference
                description: `${node.name} tiene ${unresolvedInjuries.length} lesión(es) no resuelta(s): ${unresolvedInjuries.map((i: any) => i.description).join(', ')}.`,
                socraticQuestion: `${node.name} fue lesionado en ${unresolvedInjuries[0]?.chapterIntroduced}. Esta herida tiene un impacto mecánico: "${unresolvedInjuries[0]?.mechanicalImpact}". ¿Cómo afecta esto a las escenas que has planificado posteriormente? ¿O lo has resuelto sin registrarlo?`
            });
        }
    }

    // REGLA 3: Relaciones contradictorias (A es ALLY de B, pero B es ENEMY de A)
    for (const [id, node] of nodes) {
        for (const relation of node.relations) {
            const targetNode = nodes.get(relation.targetId);
            if (!targetNode) continue;

            // Buscar si la relación inversa contradice
            const inverseRelation = targetNode.relations.find(r => r.targetId === id);
            if (!inverseRelation) continue;

            const isContradiction = 
                (relation.relationType === 'ALLY' && inverseRelation.relationType === 'ENEMY') ||
                (relation.relationType === 'ENEMY' && inverseRelation.relationType === 'ALLY') ||
                (relation.relationType === 'LOVE' && inverseRelation.relationType === 'ENEMY');

            if (isContradiction) {
                alerts.push({
                    type: 'CAUSAL_PARADOX',
                    severity: 'warning',
                    nodeA: { id, name: node.name },
                    nodeB: { id: relation.targetId, name: relation.targetName },
                    description: `Relación asimétrica detectada: ${node.name} ve a ${relation.targetName} como ${relation.relationType}, pero ${relation.targetName} ve a ${node.name} como ${inverseRelation.relationType}.`,
                    socraticQuestion: `${node.name} considera a ${relation.targetName} un ${relation.relationType.toLowerCase()}, pero ${relation.targetName} considera a ${node.name} un ${inverseRelation.relationType.toLowerCase()}. ¿Es esto intencional (una relación de traición o engaño), o es una inconsistencia que debemos alinear?`
                });
            }
        }
    }

    return alerts;
}

/**
 * Serializa el grafo para inyectarlo en el contexto del Arquitecto.
 * Formato compacto para no consumir excesivos tokens.
 */
export function serializeGraphForLLM(graph: NarrativeDependencyGraph): string {
    const lines: string[] = [];
    
    lines.push(`=== GRAFO DE DEPENDENCIAS NARRATIVAS ===`);
    lines.push(`Nodos: ${graph.stats.totalNodes} | Aristas: ${graph.stats.totalEdges}`);
    lines.push(`Alertas críticas: ${graph.stats.criticalAlerts} | Advertencias: ${graph.stats.warningAlerts}`);
    lines.push('');

    // Solo incluir nodos con relaciones o alertas (para eficiencia de tokens)
    for (const [id, node] of graph.nodes) {
        if (node.relations.length === 0 && !node.psychology) continue;

        lines.push(`[${node.name} | ${node.category} | ${node.tier}]`);
        
        if (node.psychology) {
            const psych = node.psychology;
            if (psych.goal) lines.push(`  Objetivo: ${psych.goal}`);
            if (psych.flaw) lines.push(`  Defecto: ${psych.flaw}`);
            if (psych.lie) lines.push(`  La Mentira: ${psych.lie}`);
        }

        for (const rel of node.relations.slice(0, 5)) { // Max 5 relaciones por nodo
            lines.push(`  → ${rel.relationType} → ${rel.targetName} (peso: ${rel.semanticWeight.toFixed(2)})`);
            if (rel.context) lines.push(`    Contexto: ${rel.context.substring(0, 100)}`);
        }
    }

    if (graph.alerts.length > 0) {
        lines.push('');
        lines.push('=== COLISIONES DETECTADAS ===');
        for (const alert of graph.alerts) {
            lines.push(`[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.description}`);
        }
    }

    return lines.join('\n');
}
