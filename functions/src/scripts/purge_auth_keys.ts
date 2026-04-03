import '../admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

async function purgeAuthKeys() {
    const db = getFirestore();
    console.log("🛡️ Iniciando purga de claves expuestas...");

    const snapshot = await db.collectionGroup('project_config').get();
    
    if (snapshot.empty) {
        console.log("✅ Sin documentos que purgar.");
        return;
    }

    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Solo actualizar si tiene alguno de estos campos
        if (data._authOverride || data.customGeminiKey || data.apiKey) {
            batch.update(doc.ref, {
                _authOverride: FieldValue.delete(),
                customGeminiKey: FieldValue.delete(),
                apiKey: FieldValue.delete(),
            });
            count++;
        }
    });

    if (count > 0) {
        await batch.commit();
        console.log(`✅ Purgados ${count} documentos con claves expuestas.`);
    } else {
        console.log("✅ Sin claves expuestas encontradas.");
    }
}

purgeAuthKeys().then(() => process.exit(0)).catch(e => {
    console.error("💥 Error en purga:", e);
    process.exit(1);
});