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

function redactSensitiveText(value, secrets = []) {
    let text = String(value ?? '');
    text = text.replace(/(https?:\/\/)[^@\s/:]+:[^@\s/]+@/gi, '$1[credentials omitted]@');
    text = text.replace(/([?&](?:api[-_]?key|key|token|access_token)=)[^\s&#)]+/gi, '$1[credential omitted]');
    text = text.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=_-]+/g, '[image data omitted]');
    for (const secret of secrets) {
        if (typeof secret === 'string' && secret !== '') {
            text = text.split(secret).join('[credential omitted]');
        }
    }
    return text;
}

function describeRequest(url, model) {
    let endpoint = url;
    try {
        const safeUrl = new URL(url);
        safeUrl.username = '';
        safeUrl.password = '';
        safeUrl.search = '';
        safeUrl.hash = '';
        endpoint = safeUrl.href;
    } catch {
        // The invalid URL is redacted by the caller before it is displayed.
    }
    return model ? `${endpoint} (model: ${model})` : endpoint;
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

    const reportError = (message) => onError(redactSensitiveText(message, [apiKey]));

    let url;
    let headers;
    try {
        url = buildApiUrl(requestPath, service);
        headers = buildHeaders(service, apiKey);
    } catch {
        reportError('Invalid request path.');
        return () => {};
    }

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

    let payload;
    try {
        payload = JSON.stringify(body);
    } catch (error) {
        reportError(`Could not serialize the request for ${describeRequest(url, model)}\n${error.toString()}`);
        return abort;
    }

    if (stream) {
        // Use window.fetch for streaming support
        window
            .fetch(url, {
                method: 'POST',
                headers,
                body: payload,
            })
            .then(async (res) => {
                if (!res.ok) {
                    let errorText = '(no response body)';
                    try {
                        errorText = await res.text();
                    } catch {
                        // Keep the fallback error body.
                    }
                    reportError(`Http Status: ${res.status}\n${describeRequest(url, model)}\n${errorText}`);
                    return;
                }
                if (!res.body) {
                    reportError(`The response from ${describeRequest(url, model)} carried no readable stream body.`);
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
                    reportError(`${e.toString()}\n${describeRequest(url, model)}`);
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
                        reportError(`Unexpected response format from ${describeRequest(url, model)}`);
                    }
                } else {
                    reportError(
                        `Http Status: ${res.status}\n${describeRequest(url, model)}\n${JSON.stringify(res.data)}`
                    );
                }
            })
            .catch((e) => {
                if (!aborted) {
                    reportError(`${e.toString()}\n${describeRequest(url, model)}`);
                }
            });
    }

    return abort;
}
