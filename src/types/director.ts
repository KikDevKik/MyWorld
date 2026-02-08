
export interface ChatMessageData {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    timestamp?: any;

    // 🟢 HYBRID TYPES
    type?: 'text' | 'analysis_card' | 'verdict_card' | 'system_alert';

    // 🟢 DATA PAYLOADS
    inspectorData?: any;
    verdictData?: any;
    driftData?: any;
    driftCategory?: string;

    // 🟢 FLAGS (Legacy/Aux)
    isError?: boolean;
    isDriftAlert?: boolean;
    attachmentPreview?: string; // 🟢 Base64/Url preview of attachment
    attachmentType?: 'image' | 'audio';
}
