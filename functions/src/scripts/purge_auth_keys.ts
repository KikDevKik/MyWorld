import '../admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

async function purgeAuthKeys() {
    const db = getFirestore();
    console.log("🛡️ Iniciando purga de claves expuestas en Firestore...");

    // Buscar en project_config de todos los usuarios
    const snapshot = await db
        .collectionGroup('profile')
        .get();

    const batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        if (doc.id !== 'project_config') continue;
        
        const data = doc.data();
        const hasExposedKeys = data._authOverride || 
                               data.customGeminiKey || 
                               data.apiKey ||
                               data.accessToken;

        if (hasExposedKeys) {
            batch.update(doc.ref, {
                _authOverride: FieldValue.delete(),
                customGeminiKey: FieldValue.delete(),
                apiKey: FieldValue.delete(),
                accessToken: FieldValue.delete(),
            });
            count++;
            console.log(`  Purgando: ${doc.ref.path}`);
        }
    }

    if (count > 0) {
        await batch.commit();
        console.log(`✅ Purgados ${count} documentos con claves expuestas.`);
    } else {
        console.log("✅ Sin claves expuestas encontradas. Base de datos limpia.");
    }
}

purgeAuthKeys()
    .then(() => {
        console.log("Script completado.");
        process.exit(0);
    })
    .catch(e => {
        console.error("💥 Error en purga:", e);
        process.exit(1);
    });