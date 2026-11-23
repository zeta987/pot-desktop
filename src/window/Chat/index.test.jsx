import { NextUIProvider } from '@nextui-org/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
    context: null,
    responses: [],
    invoke: vi.fn(),
    show: vi.fn(),
    setFocus: vi.fn(),
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
        setFocus: native.setFocus,
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

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

describe('Chat window conversations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        native.responses = [];
        native.context = null;
        native.show.mockResolvedValue();
        native.setFocus.mockResolvedValue();
        native.setAlwaysOnTop.mockResolvedValue();
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

    it.each(['recognize', 'translate'])('accepts typing without a click when opened from %s', async (kind) => {
        const apiConfig = { service: 'openai', requestPath: 'https://chat.invalid', model: 'test' };
        native.context =
            kind === 'recognize'
                ? buildRecognitionChatContext({ text: 'Recognized text', apiConfig })
                : buildTranslationChatContext({ sourceText: 'Guten Morgen', resultText: 'Good morning', apiConfig });
        const user = userEvent.setup();

        renderChat(true);

        const input = screen.getByPlaceholderText('Ask a follow-up question');
        await waitFor(() => expect(input).toHaveFocus());
        expect(native.setFocus).toHaveBeenCalledTimes(1);
        await user.keyboard('Explain this');
        expect(input).toHaveValue('Explain this');
    });

    it('waits for the native window to be shown and activated before focusing the input', async () => {
        const shown = deferred();
        const focused = deferred();
        native.show.mockReturnValueOnce(shown.promise);
        native.setFocus.mockReturnValueOnce(focused.promise);

        renderChat();

        const input = screen.getByPlaceholderText('Ask a follow-up question');
        expect(input).not.toHaveFocus();
        expect(native.setFocus).not.toHaveBeenCalled();
        await act(async () => shown.resolve());
        expect(native.setFocus).toHaveBeenCalledTimes(1);
        expect(input).not.toHaveFocus();
        await act(async () => focused.resolve());
        expect(input).toHaveFocus();
    });

    it('does not activate a chat that was closed while its window was being shown', async () => {
        const shown = deferred();
        native.show.mockReturnValueOnce(shown.promise);

        const { unmount } = renderChat();
        unmount();
        await act(async () => shown.resolve());

        expect(native.setFocus).not.toHaveBeenCalled();
    });

    it('allows drafting during the initial response without stealing focus back from another editor', async () => {
        native.context = buildTranslationChatContext({
            sourceText: 'Guten Morgen',
            resultText: 'Good morning',
            apiConfig: { service: 'openai', requestPath: 'https://chat.invalid', model: 'test' },
        });
        let stream;
        native.chatStream.mockImplementationOnce((callbacks) => {
            stream = callbacks;
            return vi.fn();
        });
        const user = userEvent.setup();

        renderChat();

        const input = screen.getByPlaceholderText('Ask a follow-up question');
        await waitFor(() => expect(input).toHaveFocus());
        await user.keyboard('My next question');
        expect(input).toHaveValue('My next question');

        await user.click(screen.getByRole('button', { name: /System prompt/ }));
        const editor = screen.getAllByRole('textbox').find((element) => element !== input);
        await user.click(editor);
        act(() => stream.onChunk('Partial explanation'));
        expect(editor).toHaveFocus();
        act(() => stream.onComplete('Completed explanation'));
        expect(editor).toHaveFocus();
        expect(input).toHaveValue('My next question');
        expect(native.setFocus).toHaveBeenCalledTimes(1);
    });

    it('starts pinned and lets the user unpin and pin the chat window', async () => {
        const user = userEvent.setup();
        renderChat();

        const unpin = screen.getByRole('button', { name: 'Unpin', pressed: true });
        await user.click(unpin);
        expect(native.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
        await user.click(screen.getByRole('button', { name: 'Pin', pressed: false }));
        expect(native.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
        expect(screen.getByRole('button', { name: 'Unpin', pressed: true })).toBeInTheDocument();
    });

    it.each([
        ['image and text', { text: 'Recognized heading', imageBase64: IMAGE_BASE64 }],
        ['image only', { imageBase64: IMAGE_BASE64 }],
        ['text only', { text: 'Recognized heading' }],
    ])('explains OCR %s once on opening and retains the explanation for follow-ups', async (_name, source) => {
        const apiConfig = { service: 'openai', requestPath: 'https://vision.invalid', model: 'vision-model' };
        native.context = buildRecognitionChatContext({ ...source, apiConfig });
        native.responses = [{ complete: 'Initial OCR explanation' }, { complete: 'Follow-up answer' }];

        renderChat(true);

        expect(await screen.findByText('Initial OCR explanation')).toBeInTheDocument();
        expect(native.chatStream).toHaveBeenCalledTimes(1);
        expect(native.chatStream.mock.calls[0][0].apiConfig).toEqual(apiConfig);
        expect(native.chatStream.mock.calls[0][0].messages).toEqual([
            { role: 'system', content: expect.stringContaining('explain') },
            native.context.initialMessages[0],
        ]);

        await submit('Explain the heading further.');
        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(2));
        expect(native.chatStream.mock.calls[1][0].messages).toEqual([
            expect.objectContaining({ role: 'system' }),
            native.context.initialMessages[0],
            { role: 'assistant', content: 'Initial OCR explanation' },
            { role: 'user', content: 'Explain the heading further.' },
        ]);
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

        expect(await screen.findByText(/Provider rejected/)).toBeInTheDocument();
        expect(native.chatStream).toHaveBeenCalledTimes(1);
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
        native.responses = [{ complete: 'Initial OCR explanation' }, { complete: 'Corrected explanation' }];
        const user = userEvent.setup();

        renderChat();
        await screen.findByText('Initial OCR explanation');
        await user.click(screen.getAllByRole('button', { name: 'Edit message' })[0]);
        const editor = screen.getByDisplayValue(/Old OCR text/);
        await user.clear(editor);
        await user.type(editor, 'Corrected OCR text');
        await user.click(screen.getByRole('button', { name: 'Confirm edit' }));
        await user.click(await screen.findByRole('button', { name: 'Yes' }));

        await waitFor(() => expect(native.chatStream).toHaveBeenCalledTimes(2));
        const regenerated = native.chatStream.mock.calls[1][0].messages;
        expect(JSON.stringify(regenerated).match(/data:image\/png;base64,/g)).toHaveLength(1);
        expect(JSON.stringify(regenerated)).toContain('Corrected OCR text');
        expect(JSON.stringify(regenerated)).not.toContain('Old OCR text');
    });
});
