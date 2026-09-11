import { NextUIProvider } from '@nextui-org/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
    context: null,
    responses: [],
    invoke: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    chatStream: vi.fn(),
}));

Element.prototype.scrollIntoView = vi.fn();

vi.mock('@tauri-apps/api/tauri', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/api/window', () => ({
    appWindow: {
        label: 'chat-test-window',
        show: native.show,
        close: native.close,
        setAlwaysOnTop: native.setAlwaysOnTop,
    },
}));
vi.mock('../../hooks', () => ({
    useConfig: (key) => [key === 'app_language' ? 'en' : false],
}));
vi.mock('../../utils/env', () => ({ osType: 'Windows_NT' }));
vi.mock('./chatApi', () => ({ chatStream: native.chatStream }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) =>
            options?.defaultValue ||
            {
                'chat.title': 'Chat',
                'chat.clear': 'Clear',
                'chat.system_prompt': 'System prompt',
                'chat.placeholder': 'Ask a follow-up question',
                'chat.regenerate': 'Regenerate',
                'chat.regenerate_prompt': 'Regenerate from here?',
                'chat.yes': 'Yes',
                'chat.no': 'No',
            }[key] ||
            key,
    }),
}));

import Chat from './index';
import { buildRecognitionChatContext, buildTranslationChatContext } from './chatContext';

const IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==';

function renderChat(strict = false) {
    const content = (
        <NextUIProvider>
            <Chat />
        </NextUIProvider>
    );
    return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

async function submit(text) {
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('Ask a follow-up question');
    await user.type(input, text);
    await user.keyboard('{Control>}{Enter}{/Control}');
}

describe('Chat window conversations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        native.responses = [];
        native.invoke.mockImplementation(async (command) => {
            if (command === 'get_chat_context') return JSON.stringify(native.context);
            return null;
        });
        native.chatStream.mockImplementation(({ onComplete, onError }) => {
            const response = native.responses.shift();
            if (response?.error) onError(response.error);
            else onComplete(response?.complete || 'Assistant response');
            return vi.fn();
        });
    });

    it('requests the initial translation explanation once in StrictMode and keeps its real history and config', async () => {
        const apiConfig = {
            service: 'openai',
            requestPath: 'https://selected.invalid/v1/chat/completions',
            apiKey: 'selected-key',
            model: 'selected-model',
        };
        native.context = buildTranslationChatContext({
            sourceText: 'Guten Morgen',
            resultText: 'Good morning',
            apiConfig,
        });
        native.responses = [{ complete: 'First explanation' }, { complete: 'Follow-up answer' }];

        renderChat(true);

        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(1));
        expect(native.invoke).toHaveBeenCalledTimes(1);
        expect(native.chatStream.mock.calls[0][0].apiConfig).toEqual(apiConfig);
        expect(await screen.findByText('First explanation')).toBeInTheDocument();

        await submit('Why this wording?');

        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(2));
        expect(native.chatStream.mock.calls[1][0].apiConfig).toEqual(apiConfig);
        expect(native.chatStream.mock.calls[1][0].messages.map(({ role, content }) => ({ role, content }))).toEqual([
            expect.objectContaining({ role: 'system' }),
            native.context.initialMessages[0],
            { role: 'assistant', content: 'First explanation' },
            { role: 'user', content: 'Why this wording?' },
        ]);
    });

    it('keeps legacy launcher messages without auto-submitting them', async () => {
        const apiConfig = {
            service: 'openai',
            requestPath: 'https://legacy.invalid/v1/chat/completions',
            apiKey: 'legacy-key',
            model: 'legacy-model',
        };
        native.context = {
            resultText: 'Legacy translation',
            apiConfig,
            initialMessages: [
                { role: 'user', content: 'Legacy original text' },
                { role: 'assistant', content: 'Legacy translation' },
            ],
        };
        native.responses = [{ complete: 'Legacy follow-up answer' }];

        renderChat();
        expect(await screen.findByText('Legacy translation')).toBeInTheDocument();
        expect(native.chatStream).not.toHaveBeenCalled();

        await submit('Explain the legacy result.');

        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(1));
        expect(native.chatStream.mock.calls[0][0].apiConfig).toEqual(apiConfig);
        expect(native.chatStream.mock.calls[0][0].messages.map(({ role, content }) => ({ role, content }))).toEqual([
            expect.objectContaining({ role: 'system' }),
            { role: 'user', content: 'Legacy original text' },
            { role: 'assistant', content: 'Legacy translation' },
            { role: 'user', content: 'Explain the legacy result.' },
        ]);
    });

    it('keeps one OCR image through follow-ups and regeneration while showing a redacted rejection', async () => {
        const apiConfig = {
            service: 'openai',
            requestPath: 'https://url-user:url-pass@vision.invalid/v1/chat/completions?api-key=query-secret',
            apiKey: 'header-secret',
            model: 'text-only-model',
        };
        native.context = buildRecognitionChatContext({ imageBase64: IMAGE_BASE64, apiConfig });
        native.responses = [
            {
                error:
                    `Provider rejected data:image/png;base64,${IMAGE_BASE64} ` +
                    'header-secret https://echo-user:echo-pass@vision.invalid/v1/chat/completions?api-key=query-secret',
            },
            { complete: 'Second attempt' },
            { complete: 'Regenerated answer' },
        ];

        renderChat();
        expect(await screen.findByRole('img', { name: 'Attached image' })).toBeInTheDocument();

        await submit('What is in this image?');
        expect(await screen.findByText(/Provider rejected/)).toBeInTheDocument();
        expect(document.body.textContent).not.toContain(IMAGE_BASE64);
        expect(document.body.textContent).not.toContain('header-secret');
        expect(document.body.textContent).not.toContain('query-secret');
        expect(document.body.textContent).not.toContain('url-user');
        expect(document.body.textContent).not.toContain('url-pass');
        expect(document.body.textContent).not.toContain('echo-user');
        expect(document.body.textContent).not.toContain('echo-pass');
        expect(document.body.textContent).toContain('may not accept image input');

        await submit('Please try once more.');
        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(2));
        const followUpMessages = native.chatStream.mock.calls[1][0].messages;
        expect(followUpMessages.some((message) => String(message.content).includes('Provider rejected'))).toBe(false);
        expect(JSON.stringify(followUpMessages).match(/data:image\/png;base64,/g)).toHaveLength(1);
        expect(followUpMessages.at(-1)).toEqual({ role: 'user', content: 'Please try once more.' });

        await userEvent.click(await screen.findByTitle('Regenerate'));
        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(3));
        expect(
            JSON.stringify(native.chatStream.mock.calls[2][0].messages).match(/data:image\/png;base64,/g)
        ).toHaveLength(1);
    });

    it('keeps the OCR image when edited text is regenerated', async () => {
        native.context = buildRecognitionChatContext({
            text: 'Old OCR text',
            imageBase64: IMAGE_BASE64,
            apiConfig: {
                service: 'openai',
                requestPath: 'https://vision.invalid/v1/chat/completions',
                apiKey: 'test-key',
                model: 'vision-model',
            },
        });
        native.responses = [{ complete: 'Corrected explanation' }];
        const user = userEvent.setup();

        renderChat();
        await screen.findByText(/Old OCR text/);
        await user.click(screen.getByRole('button', { name: 'Edit message' }));
        const editor = screen.getByDisplayValue(/Old OCR text/);
        await user.clear(editor);
        await user.type(editor, 'Corrected OCR text');
        await user.click(screen.getByRole('button', { name: 'Confirm edit' }));
        await user.click(await screen.findByRole('button', { name: 'Yes' }));

        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(1));
        const regenerated = native.chatStream.mock.calls[0][0].messages;
        expect(JSON.stringify(regenerated).match(/data:image\/png;base64,/g)).toHaveLength(1);
        expect(JSON.stringify(regenerated)).toContain('Corrected OCR text');
        expect(JSON.stringify(regenerated)).not.toContain('Old OCR text');
    });
});
