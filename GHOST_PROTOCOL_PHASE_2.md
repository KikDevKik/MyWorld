# PROTOCOLO FANTASMA: FASE 2 (AUDITORÍA PROFUNDA)

Este documento define las instrucciones para la **Fase 2 de Auditoría** en Modo Ghost (`VITE_JULES_MODE=true`).
El objetivo es ir más allá de la funcionalidad básica y estresar la lógica, la coherencia y la usabilidad del sistema "World Engine" (Nexus, Builder, Graph).

## 🎯 OBJETIVOS DE LA MISIÓN
Buscar activamente:
1.  **Errores de Lógica**: Estados imposibles, desincronización entre UI y Datos.
2.  **Problemas CRUD**: Fallos al añadir, eliminar o editar nodos/aristas.
3.  **Coherencia Narrativa**: ¿El grafo refleja lo que dice el texto? ¿El Builder obedece el prompt?
4.  **Fricción de Uso**: Bloqueos, interfaces confusas, falta de feedback.

---

## 🛠️ ESTRATEGIA DE PRUEBAS (PLAYWRIGHT)

Se deben implementar los siguientes escenarios en `tests/ghost_deep_dive.spec.ts`:

### 1. PRUEBAS DE LÓGICA & CONSISTENCIA (The Builder)
*   **Scenario: "La Paradoja"**
    *   **Acción**: Enviar un prompt al Builder que contradiga un nodo existente (ej. "Cipher está muerto" cuando ya existe como "Vivo").
    *   **Verificación**: ¿El sistema sugiere un conflicto? ¿Crea un duplicado?
    *   **Expectativa**: Debe detectar la ambigüedad o permitir la edición, no sobrescribir silenciosamente.
*   **Scenario: "Tabula Rasa"**
    *   **Acción**: Preguntar por algo fuera del contexto (ej. "Darth Vader").
    *   **Verificación**: La respuesta debe ser ignorancia o alucinación controlada (según modo).
    *   **Check**: En modo `RIGOR`, no debe inventar.

### 2. PRUEBAS DE AÑADIR / ELIMINAR (CRUD)
*   **Scenario: "El Huerfano"**
    *   **Acción**: Crear dos nodos conectados (A -> B). Eliminar nodo A.
    *   **Verificación**: ¿Desaparece la arista? ¿Queda B corrupto?
    *   **Deep Check**: Inspeccionar el estado interno (mock store) para asegurar limpieza.
*   **Scenario: "Resurrección"**
    *   **Acción**: Eliminar un nodo y luego usar "Undo" (si existe) o volver a escanear el mismo texto.
    *   **Verificación**: ¿Reaparece con el mismo ID o uno nuevo? (Persistencia de identidad).

### 3. PRUEBAS DE NEXUS (Scanning)
*   **Scenario: "El Camaleón"**
    *   **Acción**: Modificar un archivo mock (`Mock File.md`) cambiando el nombre de una entidad levemente (ej. "Cipher" -> "Cypher").
    *   **Verificación**: ¿Nexus sugiere **FUSIÓN** o crea uno nuevo?
    *   **Expectativa**: Debe detectar similitud (Levenshtein) y sugerir fusión.
*   **Scenario: "Ruido Blanco"**
    *   **Acción**: Escanear un archivo con mucho texto irrelevante.
    *   **Verificación**: ¿Filtra correctamente el ruido? ¿O crea nodos basura ("The", "And")?

### 4. PRUEBAS DE USO (UX Friction)
*   **Scenario: "Cancelación de Pánico"**
    *   **Acción**: Iniciar un escaneo Nexus y cerrar el modal inmediatamente.
    *   **Verificación**: ¿Se rompe la UI? ¿Queda el estado `isScanning` trabado?
*   **Scenario: "Edición Rápida"**
    *   **Acción**: Editar un nodo en el grafo mientras el Builder está "escribiendo" (streaming).
    *   **Verificación**: ¿Colisionan los estados?

---

## 📝 LISTA DE VERIFICACIÓN MANUAL (Coherencia)

Si se realiza testing manual, verificar visualmente:

1.  **Coherencia Visual**:
    *   Si el texto dice "Castillo en la montaña", el nodo `Location` debe estar visualmente cerca o conectado a `Mountain` (si la física lo permite).
    *   Los colores de los nodos deben coincidir estrictamente con su tipo (`Personaje` = Amarillo, `Lugar` = Cyan).

2.  **Persistencia de la Verdad**:
    *   Lo que se "Cristaliza" (Guarda) no debe cambiar por capricho del Builder en la siguiente sesión.

3.  **Feedback del Sistema**:
    *   Cada acción destructiva debe tener confirmación.
    *   Cada proceso largo (>2s) debe tener spinner/feedback.

## 🚀 EJECUCIÓN
Para ejecutar la nueva suite (cuando se cree):
```bash
npx playwright test tests/ghost_deep_dive.spec.ts
```
