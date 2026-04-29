export function openAISettings() {
    window.dispatchEvent(new CustomEvent('OPEN_SETTINGS_MODAL', { detail: { tab: 'ai_config' } }));
}

export function showAPIKeyOnboarding() {
    window.dispatchEvent(new CustomEvent('SHOW_API_KEY_ONBOARDING'));
}
