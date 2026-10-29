// Oct 2026: envoltorio de onCall que guarda el uid en el contexto de la petición.
// Se importa en lugar de onCall de firebase-functions/v2/https.
import { onCall as baseOnCall, CallableRequest, CallableOptions } from "firebase-functions/v2/https";
import { requestContext } from "./request_context";

type Handler<T, R> = (request: CallableRequest<T>, response?: any) => R;

const levelOf = (d: any) => (['gratis', 'propia', 'myworld'].includes(d?._aiLevel) ? d._aiLevel : undefined);
const anthropicOf = (d: any) => {
    const k = d?._anthropicOverride || d?.customAnthropicKey;
    return typeof k === 'string' && k.startsWith('sk-ant-') ? k : undefined;
};

export function onCall<T = any, R = any>(optsOrHandler: CallableOptions | Handler<T, R>, maybeHandler?: Handler<T, R>) {
    if (typeof optsOrHandler === 'function') {
        const h = optsOrHandler;
        return baseOnCall<T, R>(((req: CallableRequest<T>, res?: any) =>
            requestContext.run({ uid: req.auth?.uid, claudeQuality: (req.data as any)?._claudeQuality, aiLevel: levelOf(req.data), anthropicKey: anthropicOf(req.data) }, () => h(req, res))) as any);
    }
    const h = maybeHandler!;
    return baseOnCall<T, R>(optsOrHandler, ((req: CallableRequest<T>, res?: any) =>
        requestContext.run({ uid: req.auth?.uid, claudeQuality: (req.data as any)?._claudeQuality, aiLevel: levelOf(req.data), anthropicKey: anthropicOf(req.data) }, () => h(req, res))) as any);
}
