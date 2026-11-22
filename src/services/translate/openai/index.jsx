import { fetch, Body } from '@tauri-apps/api/http';
import { Language } from './info';
import { defaultRequestArguments } from './Config';

async function readTranslationStream(body, publish) {
    if (!body) throw new Error('Translation response did not contain a stream');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let target = '';
    let closed = false;
    try {
        stream: while (!closed) {
            const { done, value } = await reader.read();
            closed = done;
            pending += decoder.decode(value, { stream: !done });

            const events = pending.split(/\r?\n\r?\n/);
            pending = done ? '' : events.pop();
            for (const event of events) {
                const lines = event.split(/\r?\n/);
                if (lines.includes('event: error')) throw new Error('Translation provider returned a stream error');
                const data = lines
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).replace(/^ /, ''))
                    .join('\n')
                    .trim();
                if (!data) continue;
                if (data === '[DONE]') break stream;

                let result;
                try {
                    result = JSON.parse(data);
                } catch {
                    throw new Error('Translation provider returned invalid stream data');
                }
                if (result?.error) throw new Error('Translation provider returned a stream error');

                const text = result?.choices?.[0]?.delta?.content;
                if (typeof text === 'string' && text) {
                    target += text;
                    if (publish) {
                        publish(target + '_');
                    } else if (target.trim()) {
                        return '[STREAM]';
                    }
                }
            }
        }

        const result = target.trim();
        if (!result) throw new Error('Translation stream returned no text');
        publish?.(result);
        return result;
    } finally {
        if (!closed) void reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

export async function translate(text, from, to, options) {
    const { config, setResult, detect } = options;

    let { service, requestPath, model, apiKey, stream, promptList, requestArguments } = config;

    if (!/https?:\/\/.+/.test(requestPath)) {
        requestPath = `https://${requestPath}`;
    }
    const apiUrl = new URL(requestPath);

    // in openai like api, /v1 is not required
    if (service === 'openai' && !apiUrl.pathname.endsWith('/chat/completions')) {
        // not openai like, populate completion endpoint
        apiUrl.pathname += apiUrl.pathname.endsWith('/') ? '' : '/';
        apiUrl.pathname += 'v1/chat/completions';
    }

    // 兼容旧版
    if (promptList === undefined) {
        promptList = [
            {
                role: 'system',
                content:
                    'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.',
            },
            { role: 'user', content: `Translate into $to:\n"""\n$text\n"""` },
        ];
    }

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

    const headers =
        service === 'openai'
            ? {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`,
              }
            : {
                  'Content-Type': 'application/json',
                  'api-key': apiKey,
              };
    const body = {
        ...JSON.parse(requestArguments ?? defaultRequestArguments),
        stream: stream,
        messages: promptList,
    };
    if (service === 'openai') {
        body['model'] = model;
    }
    if (stream) {
        const res = await window.fetch(apiUrl.href, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
        });
        if (res.ok) {
            return readTranslationStream(res.body, typeof setResult === 'function' ? setResult : undefined);
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    } else {
        let res = await fetch(apiUrl.href, {
            method: 'POST',
            headers: headers,
            body: Body.json(body),
        });
        if (res.ok) {
            let result = res.data;
            const { choices } = result;
            if (choices) {
                let target = choices[0].message.content.trim();
                if (target) {
                    if (target.startsWith('"')) {
                        target = target.slice(1);
                    }
                    if (target.endsWith('"')) {
                        target = target.slice(0, -1);
                    }
                    return target.trim();
                } else {
                    throw JSON.stringify(choices);
                }
            } else {
                throw JSON.stringify(result);
            }
        } else {
            throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
        }
    }
}

export * from './Config';
export * from './info';
