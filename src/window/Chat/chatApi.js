import { fetch, Body } from '@tauri-apps/api/http';

// Build the full API URL from the requestPath config
function buildApiUrl(requestPath, service) {
    if (!/https?:\/\/.+/.test(requestPath)) {
        requestPath = `https://${requestPath}`;
    }
    const apiUrl = new URL(requestPath);

    if (service === 'openai' && !apiUrl.pathname.endsWith('/chat/completions')) {
        apiUrl.pathname += apiUrl.pathname.endsWith('/') ? '' : '/';
        apiUrl.pathname += 'v1/chat/completions';
    }
    return apiUrl.href;
}

// Build request headers based on service type
function buildHeaders(service, apiKey) {
    if (service === 'openai') {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        };
    }
    // Azure style
    return {
        'Content-Type': 'application/json',
        'api-key': apiKey,
    };
}

/**
 * Send a chat message with streaming support.
 *
 * @param {Object} params
 * @param {Object} params.apiConfig - { service, requestPath, model, apiKey, stream, requestArguments }
 * @param {Array} params.messages - Array of { role, content } message objects
 * @param {Function} params.onChunk - Called with accumulated text on each chunk
 * @param {Function} params.onComplete - Called with final text when stream ends
 * @param {Function} params.onError - Called with error message on failure
 * @returns {Function} abort - Call this function to cancel the request
 */
export function chatStream({ apiConfig, messages, onChunk, onComplete, onError }) {
    const { service = 'openai', requestPath, model, apiKey, stream = true, requestArguments } = apiConfig;

    const url = buildApiUrl(requestPath, service);
    const headers = buildHeaders(service, apiKey);

    let defaultArgs = {};
    if (requestArguments) {
        try {
            defaultArgs = typeof requestArguments === 'string' ? JSON.parse(requestArguments) : requestArguments;
        } catch {
            // Ignore parse errors, use empty defaults
        }
    }

    const body = {
        ...defaultArgs,
        stream,
        messages,
    };
    if (service === 'openai') {
        body['model'] = model;
    }

    let aborted = false;
    const abort = () => {
        aborted = true;
    };

    if (stream) {
        // Use window.fetch for streaming support
        window
            .fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            })
            .then(async (res) => {
                if (!res.ok) {
                    const errorText = await res.text();
                    onError(`Http Status: ${res.status}\n${errorText}`);
                    return;
                }

                let target = '';
                const reader = res.body.getReader();
                try {
                    let temp = '';
                    while (true) {
                        if (aborted) {
                            reader.cancel();
                            break;
                        }
                        const { done, value } = await reader.read();
                        if (done) {
                            onComplete(target.trim());
                            return;
                        }
                        const str = new TextDecoder().decode(value);
                        let datas = str.split('data:');
                        for (let data of datas) {
                            if (data.trim() !== '' && data.trim() !== '[DONE]') {
                                try {
                                    let chunk = temp !== '' ? temp + data.trim() : data.trim();
                                    let result = JSON.parse(chunk);
                                    if (result.choices && result.choices[0]?.delta?.content) {
                                        target += result.choices[0].delta.content;
                                        if (!aborted) {
                                            onChunk(target);
                                        }
                                    }
                                    temp = '';
                                } catch {
                                    temp = data.trim();
                                }
                            }
                        }
                    }
                } finally {
                    reader.releaseLock();
                }
            })
            .catch((e) => {
                if (!aborted) {
                    onError(e.toString());
                }
            });
    } else {
        // Use Tauri HTTP for non-streaming
        fetch(url, {
            method: 'POST',
            headers,
            body: Body.json(body),
        })
            .then((res) => {
                if (aborted) return;
                if (res.ok) {
                    const { choices } = res.data;
                    if (choices && choices[0]?.message?.content) {
                        const content = choices[0].message.content.trim();
                        onChunk(content);
                        onComplete(content);
                    } else {
                        onError('Unexpected response format');
                    }
                } else {
                    onError(`Http Status: ${res.status}\n${JSON.stringify(res.data)}`);
                }
            })
            .catch((e) => {
                if (!aborted) {
                    onError(e.toString());
                }
            });
    }

    return abort;
}
