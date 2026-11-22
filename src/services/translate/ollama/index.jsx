import { Language } from './info';
import { Ollama } from 'ollama/browser';

export async function translate(text, from, to, options = {}) {
    const { config, detect } = options;
    const setResult = typeof options.setResult === 'function' ? options.setResult : undefined;

    let { stream, promptList, requestPath, model } = config;

    if (!/https?:\/\/.+/.test(requestPath)) {
        requestPath = `https://${requestPath}`;
    }
    if (requestPath.endsWith('/')) {
        requestPath = requestPath.slice(0, -1);
    }
    const ollama = new Ollama({ host: requestPath });

    promptList = promptList.map((item) => {
        return {
            ...item,
            content: item.content
                .replaceAll('$text', text)
                .replaceAll('$from', from)
                .replaceAll('$to', to)
                .replaceAll('$detect', Language[detect]),
        };
    });

    const response = await ollama.chat({ model, messages: promptList, stream: stream });

    if (stream) {
        let target = '';
        for await (const part of response) {
            if (!part.message.content) continue;
            target += part.message.content;
            if (setResult) {
                setResult(target + '_');
            } else if (target.trim()) {
                ollama.abort();
                return '[STREAM]';
            }
        }
        const result = target.trim();
        if (!result) throw new Error('Translation stream returned no text');
        setResult?.(result);
        return result;
    } else {
        return response.message.content;
    }
}

export * from './Config';
export * from './info';
