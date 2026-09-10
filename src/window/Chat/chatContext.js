const DATA_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

export const CHAT_CONTEXT_VERSION = 1;
export const CHAT_KIND_RECOGNIZE = 'recognize';
export const CHAT_KIND_TRANSLATE = 'translate';

const APP_LANGUAGE_TO_NATURAL = {
    zh_cn: 'Simplified Chinese',
    zh_tw: 'Traditional Chinese',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    es: 'Spanish',
    ru: 'Russian',
    de: 'German',
    it: 'Italian',
    tr: 'Turkish',
    pt_pt: 'Portuguese',
    pt_br: 'Brazilian Portuguese',
    vi: 'Vietnamese',
    id: 'Indonesian',
    th: 'Thai',
    ms: 'Malay',
    ar: 'Arabic',
    hi: 'Hindi',
    nb_no: 'Norwegian Bokmål',
    nn_no: 'Norwegian Nynorsk',
    fa: 'Persian',
    sv: 'Swedish',
    pl: 'Polish',
    nl: 'Dutch',
    uk: 'Ukrainian',
    he: 'Hebrew',
};

export function resolveLanguageName(appLanguage) {
    return APP_LANGUAGE_TO_NATURAL[appLanguage] || 'English';
}

export function toImageDataUrl(imageBase64) {
    if (typeof imageBase64 !== 'string') return null;
    const trimmed = imageBase64.trim();
    if (trimmed === '') return null;
    if (DATA_URL_RE.test(trimmed)) return trimmed;
    return `${PNG_DATA_URL_PREFIX}${trimmed.replace(/\s+/g, '')}`;
}

export function getImageParts(content) {
    if (!Array.isArray(content)) return [];
    return content.filter((part) => part && part.type === 'image_url' && typeof part.image_url?.url === 'string');
}

export function getTextFromContent(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n\n');
}

export function hasImageContent(messages) {
    return Array.isArray(messages) && messages.some((message) => getImageParts(message?.content).length > 0);
}

export function replaceTextInContent(content, newText) {
    const text = typeof newText === 'string' ? newText : '';
    if (!Array.isArray(content) || getImageParts(content).length === 0) return text;

    const images = getImageParts(content);
    return text === '' ? images : [...images, { type: 'text', text }];
}

export function toApiMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.filter((message) => message && !message.localOnly).map(({ role, content }) => ({ role, content }));
}

export function normalizeInitialMessages(initialMessages) {
    if (!Array.isArray(initialMessages)) return [];

    return initialMessages.flatMap((message) => {
        if (!message || (message.role !== 'user' && message.role !== 'assistant')) return [];
        if (typeof message.content === 'string') {
            return message.content.trim() === '' ? [] : [{ role: message.role, content: message.content }];
        }
        if (!Array.isArray(message.content)) return [];

        const content = message.content.filter((part) => {
            if (!part || typeof part !== 'object') return false;
            if (part.type === 'text') return typeof part.text === 'string' && part.text !== '';
            return part.type === 'image_url' && typeof part.image_url?.url === 'string';
        });
        return content.length === 0 ? [] : [{ role: message.role, content }];
    });
}

export function buildSystemPrompt({ kind, languageName } = {}) {
    const language = languageName || 'English';
    if (kind === CHAT_KIND_RECOGNIZE) {
        return (
            `Reply in ${language}. You are a helpful assistant. The user may attach the original image from an ` +
            'OCR run together with its recognized text. Treat the image as the authoritative source when the text ' +
            'is incomplete, garbled, or contradicts the image.'
        );
    }
    if (kind === CHAT_KIND_TRANSLATE) {
        return (
            `Reply in ${language}. You are a translation assistant. Explain the supplied translation using its ` +
            'original text, including meaning, wording, notable terms, idioms, tone, and any mistake or better ' +
            'alternative you notice.'
        );
    }
    return `Reply in ${language}. You are a helpful assistant.`;
}

export function buildLegacySystemPrompt(languageName, resultText) {
    const language = languageName || 'English';
    const result = typeof resultText === 'string' ? resultText : '';
    if (result === '') return `Reply in ${language}. You are a helpful assistant.`;
    return (
        `Reply in ${language}. Analyze the following content carefully and provide a concise answer or opinion ` +
        `with a short explanation:\n\n'''\n${result}\n'''`
    );
}

export function buildRecognitionChatContext({ text, imageBase64, apiConfig } = {}) {
    const recognizedText = typeof text === 'string' ? text.trim() : '';
    const imageUrl = toImageDataUrl(imageBase64);
    let content = null;

    if (imageUrl !== null) {
        content = [{ type: 'image_url', image_url: { url: imageUrl } }];
        if (recognizedText !== '') {
            content.push({ type: 'text', text: `Recognized text:\n\n${recognizedText}` });
        }
    } else if (recognizedText !== '') {
        content = recognizedText;
    }

    return {
        version: CHAT_CONTEXT_VERSION,
        kind: CHAT_KIND_RECOGNIZE,
        autoSubmit: false,
        apiConfig: apiConfig || null,
        initialMessages: content === null ? [] : [{ role: 'user', content }],
    };
}

export function buildTranslationChatContext({ sourceText, resultText, apiConfig } = {}) {
    const source = typeof sourceText === 'string' ? sourceText.trim() : '';
    const translation = typeof resultText === 'string' ? resultText.trim() : '';
    const sections = [];

    if (source !== '') sections.push(`Original text:\n'''\n${source}\n'''`);
    if (translation !== '') sections.push(`Translation to explain:\n'''\n${translation}\n'''`);
    if (sections.length > 0) sections.push('Explain this translation.');

    return {
        version: CHAT_CONTEXT_VERSION,
        kind: CHAT_KIND_TRANSLATE,
        autoSubmit: sections.length > 0,
        apiConfig: apiConfig || null,
        initialMessages: sections.length === 0 ? [] : [{ role: 'user', content: sections.join('\n\n') }],
    };
}
