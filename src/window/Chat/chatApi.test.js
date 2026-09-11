import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@tauri-apps/api/http', () => ({
    fetch: native.fetch,
    Body: { json: (value) => value },
}));

import { chatStream } from './chatApi';

const IMAGE_URL = 'data:image/png;base64,IMAGE_BYTES';

describe('chatStream request boundary', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        native.fetch.mockReset();
    });

    it('sends the complete multimodal conversation history without duplicating the image', async () => {
        const browserFetch = vi.fn().mockResolvedValue({
            ok: true,
            body: {
                getReader: () => ({
                    read: vi.fn().mockResolvedValue({ done: true }),
                    releaseLock: vi.fn(),
                }),
            },
        });
        vi.stubGlobal('fetch', browserFetch);
        const messages = [
            { role: 'system', content: 'Use the image as the source.' },
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: IMAGE_URL } },
                    { type: 'text', text: 'Recognized text' },
                ],
            },
            { role: 'assistant', content: 'Initial answer' },
            { role: 'user', content: 'Read the heading again.' },
        ];

        chatStream({
            apiConfig: {
                service: 'openai',
                requestPath: 'https://chat.invalid/v1/chat/completions',
                model: 'vision-model',
                apiKey: 'test-key',
                stream: true,
            },
            messages,
            onChunk: vi.fn(),
            onComplete: vi.fn(),
            onError: vi.fn(),
        });

        await vi.waitFor(() => expect(browserFetch).toHaveBeenCalledTimes(1));
        const [url, options] = browserFetch.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(url).toBe('https://chat.invalid/v1/chat/completions');
        expect(body.model).toBe('vision-model');
        expect(body.messages).toEqual(messages);
        expect(options.body.match(/data:image\/png;base64,/g)).toHaveLength(1);
    });

    it('redacts image bytes and API credentials from provider rejection messages', async () => {
        const browserFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            text: async () => `unsupported image ${IMAGE_URL}; credential=test-secret`,
        });
        vi.stubGlobal('fetch', browserFetch);
        const onError = vi.fn();

        chatStream({
            apiConfig: {
                service: 'openai',
                requestPath: 'https://url-user:url-pass@chat.invalid/v1/chat/completions?api-version=query-secret',
                model: 'text-only-model',
                apiKey: 'test-secret',
                stream: true,
            },
            messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: IMAGE_URL } }] }],
            onChunk: vi.fn(),
            onComplete: vi.fn(),
            onError,
        });

        await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
        const error = onError.mock.calls[0][0];
        expect(error).toContain('Http Status: 400');
        expect(error).toContain('[image data omitted]');
        expect(error).not.toContain('IMAGE_BYTES');
        expect(error).not.toContain('test-secret');
        expect(error).not.toContain('url-user');
        expect(error).not.toContain('url-pass');
        expect(error).not.toContain('query-secret');
    });

    it('reports an invalid request path without repeating the raw value', () => {
        const onError = vi.fn();

        chatStream({
            apiConfig: {
                service: 'openai',
                requestPath: 'https://url-user:url-pass@invalid host/?token=query-secret',
                apiKey: 'header-secret',
            },
            messages: [{ role: 'user', content: 'Hello' }],
            onChunk: vi.fn(),
            onComplete: vi.fn(),
            onError,
        });

        expect(onError).toHaveBeenCalledWith('Invalid request path.');
    });
});
