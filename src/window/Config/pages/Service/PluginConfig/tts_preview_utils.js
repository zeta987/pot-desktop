export const DEFAULT_TTS_PREVIEW_TEXT = '哈囉！這是一段台灣正體中文的語音預覽，聽聽看這個聲音的口音和語氣喜不喜歡吧！';
export const BATCH_PREVIEW_CONCURRENCY = 2;

const SECRET_KEY_PATTERN = /apikey|api_key|secret|token|password/i;
const NON_SYNTHESIS_CONFIG_KEYS = new Set(['instanceName']);

export function buildEffectivePluginConfig(pluginInfo, pluginConfig = {}) {
    const effective = { ...(pluginConfig || {}) };
    const needs = Array.isArray(pluginInfo?.needs) ? pluginInfo.needs : [];
    for (const item of needs) {
        if (!item?.key) continue;
        if (item.type === 'select' && item.options && !Object.prototype.hasOwnProperty.call(effective, item.key)) {
            const firstKey = Object.keys(item.options)[0];
            if (firstKey !== undefined) {
                effective[item.key] = firstKey;
            }
        } else if (item.type === 'switch' && typeof effective[item.key] !== 'boolean') {
            effective[item.key] = item.default === true;
        }
    }
    return effective;
}

export function resolvePreviewLanguage(pluginInfo, preferredLangKey) {
    const langMap = pluginInfo?.language || {};
    const candidates = [preferredLangKey, pluginInfo?.tts_preview?.default_lang, 'zh_tw', 'zh_cn', 'auto'];
    for (const key of candidates) {
        if (key && Object.prototype.hasOwnProperty.call(langMap, key)) {
            return langMap[key];
        }
    }
    const firstKey = Object.keys(langMap)[0];
    return firstKey ? langMap[firstKey] : 'zh-TW';
}

export function inferVoiceGroupKey(pluginInfo, effectiveConfig) {
    const previewMeta = pluginInfo?.tts_preview;
    const groups = previewMeta?.voice_groups;
    if (!groups || typeof groups !== 'object') {
        return null;
    }

    const modelKey = previewMeta.model_key || 'model';
    const customModelKey = previewMeta.custom_model_key || 'customModel';
    const customModel =
        typeof effectiveConfig?.[customModelKey] === 'string' ? effectiveConfig[customModelKey].trim() : '';
    const selectedModel = typeof effectiveConfig?.[modelKey] === 'string' ? effectiveConfig[modelKey].trim() : '';
    const model = customModel || selectedModel;
    const requestPath = typeof effectiveConfig?.requestPath === 'string' ? effectiveConfig.requestPath.trim() : '';

    const isGeminiHost = /generativelanguage\.googleapis\.com/i.test(requestPath);
    if ((/^gemini/i.test(model) || (isGeminiHost && !/^gpt-/i.test(model))) && Array.isArray(groups.gemini)) {
        return 'gemini';
    }
    if (
        (/^gpt-audio/i.test(model) || (/audio/i.test(model) && !/realtime/i.test(model))) &&
        Array.isArray(groups.openai_chat_audio)
    ) {
        return 'openai_chat_audio';
    }
    if (Array.isArray(groups.openai_realtime)) {
        return 'openai_realtime';
    }
    const firstGroup = Object.keys(groups).find((k) => Array.isArray(groups[k]));
    return firstGroup || null;
}

export function resolveVoicePreviewCatalog(pluginInfo, effectiveConfig) {
    const previewMeta = pluginInfo?.tts_preview || {};
    const voiceKey = previewMeta.voice_key || 'voice';
    const customVoiceKey = previewMeta.custom_voice_key || 'customVoice';
    const modelKey = previewMeta.model_key || 'model';
    const customModelKey = previewMeta.custom_model_key || 'customModel';

    const needs = Array.isArray(pluginInfo?.needs) ? pluginInfo.needs : [];
    const voiceNeed = needs.find((item) => item?.key === voiceKey && item?.type === 'select' && item?.options);
    const voiceOptions = voiceNeed?.options || {};
    const descriptions = previewMeta.voice_descriptions || {};

    const activeGroup = inferVoiceGroupKey(pluginInfo, effectiveConfig);
    let voiceKeys = [];
    if (activeGroup && Array.isArray(previewMeta.voice_groups?.[activeGroup])) {
        voiceKeys = previewMeta.voice_groups[activeGroup];
    } else {
        voiceKeys = Object.keys(voiceOptions).filter((key) => key !== 'auto');
    }

    const currentVoice = typeof effectiveConfig?.[voiceKey] === 'string' ? effectiveConfig[voiceKey] : '';
    const activeModel =
        (typeof effectiveConfig?.[customModelKey] === 'string' && effectiveConfig[customModelKey].trim()) ||
        (typeof effectiveConfig?.[modelKey] === 'string' && effectiveConfig[modelKey].trim()) ||
        '';

    const voices = voiceKeys.map((key) => ({
        key,
        label: key,
        optionLabel: voiceOptions[key] || key,
        description: descriptions[key] || '',
        isSelected: currentVoice === key,
    }));

    return {
        voiceKey,
        customVoiceKey,
        activeGroup,
        activeModel,
        voices,
    };
}

export function buildVoiceRunConfig(effectiveConfig, voiceOverride, { voiceKey, customVoiceKey, hasCustomVoiceKey }) {
    if (!voiceOverride) {
        return effectiveConfig;
    }
    const next = {
        ...(effectiveConfig || {}),
        [voiceKey]: voiceOverride,
    };
    if (hasCustomVoiceKey || Object.prototype.hasOwnProperty.call(next, customVoiceKey)) {
        next[customVoiceKey] = '';
    }
    return next;
}

export function buildPreviewCacheKey({ pluginName, lang, text, config }) {
    const safeConfig = {};
    for (const [key, value] of Object.entries(config || {})) {
        if (SECRET_KEY_PATTERN.test(key) || NON_SYNTHESIS_CONFIG_KEYS.has(key)) {
            continue;
        }
        safeConfig[key] = value;
    }
    const sortedKeys = Object.keys(safeConfig).sort();
    const normalizedConfig = {};
    for (const key of sortedKeys) {
        normalizedConfig[key] = safeConfig[key];
    }
    return JSON.stringify({
        pluginName,
        lang,
        text: String(text || '').trim(),
        config: normalizedConfig,
    });
}

export function buildBatchScopeKey({ pluginName, lang, text, config, voiceKey, customVoiceKey, voiceKeys }) {
    const safeConfig = {};
    for (const [key, value] of Object.entries(config || {})) {
        if (
            SECRET_KEY_PATTERN.test(key) ||
            NON_SYNTHESIS_CONFIG_KEYS.has(key) ||
            key === voiceKey ||
            key === customVoiceKey
        ) {
            continue;
        }
        safeConfig[key] = value;
    }
    const sortedKeys = Object.keys(safeConfig).sort();
    const normalizedConfig = {};
    for (const key of sortedKeys) {
        normalizedConfig[key] = safeConfig[key];
    }
    return JSON.stringify({
        pluginName,
        lang,
        text: String(text || '').trim(),
        voiceKeys: Array.isArray(voiceKeys) ? voiceKeys : [],
        config: normalizedConfig,
    });
}

export function haveSecretConfigValuesChanged(prevConfig, nextConfig) {
    const secretKeys = new Set([
        ...Object.keys(prevConfig || {}).filter((key) => SECRET_KEY_PATTERN.test(key)),
        ...Object.keys(nextConfig || {}).filter((key) => SECRET_KEY_PATTERN.test(key)),
    ]);
    for (const key of secretKeys) {
        if ((prevConfig?.[key] ?? '') !== (nextConfig?.[key] ?? '')) {
            return true;
        }
    }
    return false;
}

export function sanitizeErrorMessage(error, config) {
    let raw = '';
    if (error instanceof Error) {
        raw = error.message;
    } else if (typeof error === 'string') {
        raw = error;
    } else if (error && typeof error.message === 'string') {
        raw = error.message;
    } else {
        raw = String(error ?? '');
    }

    let sanitized = raw.replace(/\s+/g, ' ').trim();
    if (!sanitized) {
        return 'Unknown error';
    }

    const secretCandidates = [];
    for (const [key, value] of Object.entries(config || {})) {
        if (!SECRET_KEY_PATTERN.test(key) || typeof value !== 'string') {
            continue;
        }
        const trimmed = value.trim();
        if (trimmed.length >= 3) {
            secretCandidates.push(trimmed);
        }
        if (value.length >= 3 && value !== trimmed) {
            secretCandidates.push(value);
        }
    }
    secretCandidates.sort((a, b) => b.length - a.length);
    for (const secret of secretCandidates) {
        sanitized = sanitized.split(secret).join('[REDACTED]');
    }

    sanitized = sanitized
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
        .replace(/\bAIza[0-9A-Za-z_-]{16,}\b/g, '[REDACTED]')
        .replace(/\bAQ\.[A-Za-z0-9._-]{16,}\b/g, '[REDACTED]');

    return sanitized;
}

export function formatBatchFailureDetails(failures, maxShown = 3) {
    if (!Array.isArray(failures) || failures.length === 0) {
        return '';
    }
    const visible = failures.slice(0, maxShown).map(({ voice, message }) => {
        const cleanMsg = String(message || '').trim();
        const shortMsg = cleanMsg.length > 80 ? `${cleanMsg.slice(0, 77)}...` : cleanMsg;
        return shortMsg ? `${voice} (${shortMsg})` : voice;
    });
    const remaining = failures.length - visible.length;
    return remaining > 0 ? `${visible.join(', ')} (+${remaining})` : visible.join(', ');
}

export async function runWithConcurrency(items, concurrency, worker, isCancelled = () => false) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
        return;
    }
    const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
    let nextIndex = 0;

    async function runWorker() {
        while (nextIndex < list.length) {
            if (isCancelled()) {
                return;
            }
            const currentIndex = nextIndex;
            nextIndex += 1;
            await worker(list[currentIndex], currentIndex);
        }
    }

    const runners = [];
    for (let i = 0; i < limit; i += 1) {
        runners.push(runWorker());
    }
    await Promise.all(runners);
}
