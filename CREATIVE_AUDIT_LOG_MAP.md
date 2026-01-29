# Mapa de Protocolo de Auditoría Creativa (Creative Audit Log)

## 1. INYECCIÓN DIRECTA (Escritura)
| Componente | Acción de Usuario | Intento Creativo | Payload de Datos |
| :--- | :--- | :--- | :--- |
| `ForgeChat.tsx` | `handleUserSend` | Inyección de Prompt / Instrucción Narrativa | `user_prompt_content`, `session_id` |
| `HybridEditor.tsx` | `onBlur` / `onSave` (via Parent) | Revisión Humana (Edición de Texto) | `diff_snapshot` (Levenshtein), `file_id` |
| `NodeEditModal.tsx` | `handleSaveNode` | Edición Manual de Entidad | `node_name`, `node_description_diff` |
| `DirectorPanel.tsx` | `handleSendMessage` | Dirección de Escena (Chat) | `user_instruction`, `active_file_context` |

## 2. CURADURÍA Y DECISIÓN (Selección)
| Componente | Acción de Usuario | Intento Creativo | Payload de Datos |
| :--- | :--- | :--- | :--- |
| `NexusTribunalModal.tsx` | `handleAction('APPROVE')` | Validación de Canon (Fiat) | `candidate_id`, `decision: 'APPROVE'` |
| `NexusTribunalModal.tsx` | `handleAction('REJECT_HARD')` | Censura Creativa (Ban) | `candidate_name`, `decision: 'BAN'` |
| `NexusTribunalModal.tsx` | `confirmBatchMerge` | Consolidación de Conceptos | `winner_id`, `loser_ids_list` |
| `CommandBar.tsx` | `onModeChange` | Ajuste de Tono de Realidad | `reality_mode` (RIGOR/FUSION/ENTROPIA) |
| `DirectorPanel.tsx` | `handleInspector` / `handleTribunal` | Invocación de Herramienta | `tool_invoked`, `target_context_id` |

## 3. ESTRUCTURACIÓN (Arquitectura)
| Componente | Acción de Usuario | Intento Creativo | Payload de Datos |
| :--- | :--- | :--- | :--- |
| `WorldEnginePageV2.tsx` | `handleCrystallizeConfirm` | Materialización (Nacimiento de Entidad) | `new_entity_id`, `entity_type`, `source_ghost_id` |
| `ForgeChat.tsx` | `handleCrystallize` | Materialización desde Chat | `new_entity_id`, `chat_summary_used` |
| `GraphSimulationV2.tsx` | `d3Drag.on('end')` | Arreglo Espacial (Composición) | `node_id`, `final_fx`, `final_fy` |
| `NexusTribunalModal.tsx` | `handleTribunalEdit` | Re-definición Taxonómica | `new_type`, `new_subtype` |

## 4. INVESTIGACIÓN (Contexto)
| Componente | Acción de Usuario | Intento Creativo | Payload de Datos |
| :--- | :--- | :--- | :--- |
| `WorldEnginePageV2.tsx` | `handleNexusClick` | Escaneo de Canon (Búsqueda) | `scan_timestamp`, `scope_context` |
| `LaboratoryPanel.tsx` | `handleDragStart` | Selección de Referencia | `resource_file_id`, `resource_name` |
| `LaboratoryPanel.tsx` | `setSearchQuery` / `setActiveTag` | Filtrado de Inspiración | `search_term`, `tag_filter` |
