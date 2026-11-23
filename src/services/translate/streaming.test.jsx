import { NextUIProvider } from '@nextui-org/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn(), ollamaChat: vi.fn() }));

vi.mock('../../hooks/useConfig', async () => {
    const { useState } = await import('react');
    return {
        useConfig: (_key, defaults) => {
            const [draft, setDraft] = useState({
                ...defaults,
                model: 'gemini-4-carbon-high',
                requestPath: 'https://translate.invalid/v1/chat/completions',
            });
            return [
                draft,
                (next, save) => {
                    setDraft(next);
                    if (save) mocks.save(next);
                },
            ];
        },
    };
});
vi.mock('../../hooks', () => ({ useToastStyle: () => ({}) }));
vi.mock('ollama/browser', () => ({
    Ollama: class {
        chat = mocks.ollamaChat;
        abort() {}
    },
}));

import { Config, translate as translateOpenAI } from './openai';
import { translate as translateGemini } from './geminipro';
import { translate as translateOllama } from './ollama';
import '../../i18n';

const config = {
    service: 'openai',
    model: 'gemini-4-carbon-high',
    requestPath: 'https://translate.invalid/v1/chat/completions',
    stream: true,
    promptList: [],
};
const packet = (delta) => 'data: ' + JSON.stringify({ choices: [{ delta }] }) + '\r\n\r\n';
const newApiEvents = ': ping\r\n\r\n' + packet({ reasoning_content: 'hidden' }) + packet({ content: '妳好' });
const useStream = (chunks, { keepOpen = false } = {}) => {
    const cancel = vi.fn();
    vi.stubGlobal(
        'fetch',
        vi.fn(
            async () =>
                new Response(
                    new ReadableStream({
                        start(controller) {
                            chunks.forEach((chunk) => controller.enqueue(chunk));
                            if (!keepOpen) controller.close();
                        },
                        cancel,
                    })
                )
        )
    );
    return cancel;
};
const encode = (value) => new TextEncoder().encode(value);

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

it('tests and saves Carbon High with streaming enabled after a heartbeat and reasoning deltas', async () => {
    const cancel = useStream([encode(newApiEvents)], { keepOpen: true });
    const onClose = vi.fn();
    const updateServiceList = vi.fn();
    render(
        <NextUIProvider>
            <Config
                instanceKey='openai@carbon'
                onClose={onClose}
                updateServiceList={updateServiceList}
            />
        </NextUIProvider>
    );

    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-4-carbon-high', stream: true }));
    expect(updateServiceList).toHaveBeenCalledWith('openai@carbon');
    expect(cancel).toHaveBeenCalledOnce();
});

it('publishes only translation text even when the SSE field and UTF-8 characters cross reads', async () => {
    const bytes = encode(newApiEvents + 'data: {"choices":[],"usage":{}}\n\ndata: [DONE]\n\n');
    const char = encode(newApiEvents.split('妳')[0]).length;
    const firstField = encode(': ping\r\n\r\nda').length;
    useStream([bytes.slice(0, firstField), bytes.slice(firstField, char + 1), bytes.slice(char + 1)]);
    const setResult = vi.fn();

    await expect(translateOpenAI('hello', 'en', 'zh', { config, setResult })).resolves.toBe('妳好');
    expect(setResult.mock.calls).toEqual([['妳好_'], ['妳好']]);
});

it('rejects a callback-free OpenAI-compatible stream that finishes with reasoning only', async () => {
    useStream([encode(packet({ reasoning_content: 'hidden' }) + 'data: [DONE]\n\n')]);
    await expect(translateOpenAI('hello', 'en', 'zh', { config })).rejects.toThrow(
        'Translation stream returned no text'
    );
});

it('reports a callback-free Gemini stream without a translation as empty', async () => {
    useStream([encode('[]')]);
    await expect(translateGemini('hello', 'en', 'zh', { config })).rejects.toThrow(
        'Translation stream returned no text'
    );
});

it('does not count an Ollama metadata-only stream as a passed configuration test', async () => {
    mocks.ollamaChat.mockResolvedValue(
        (async function* () {
            yield { message: { content: '' }, done: true };
        })()
    );
    await expect(translateOllama('hello', 'en', 'zh', { config })).rejects.toThrow(
        'Translation stream returned no text'
    );
});
