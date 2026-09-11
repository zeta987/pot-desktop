import { NextUIProvider } from '@nextui-org/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
    globalThis.AudioContext = class {};
    return {
        config: new Map(),
        get: vi.fn(),
        listeners: new Map(),
        ocr: vi.fn(),
        invoke: vi.fn(),
        writeText: vi.fn(),
        fetch: vi.fn(),
        save: vi.fn(),
        set: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        pluginSource: new Map(),
    };
});

vi.mock('@tauri-apps/api', () => ({ invoke: native.invoke, http: { fetch: native.fetch } }));
vi.mock('@tauri-apps/api/tauri', () => ({
    invoke: native.invoke,
    convertFileSrc: (path) => path,
}));
vi.mock('@tauri-apps/api/http', () => ({ fetch: native.fetch, Body: { text: (payload) => payload } }));
vi.mock('@tauri-apps/api/clipboard', () => ({ writeText: native.writeText }));
vi.mock('@tauri-apps/api/notification', () => ({ sendNotification: vi.fn() }));
vi.mock('../../utils/env', () => ({ osType: 'Windows_NT' }));
vi.mock('@tauri-apps/api/window', () => ({
    appWindow: {
        label: 'recognize',
        hide: native.hide,
        show: native.show,
        setFocus: vi.fn(),
        setAlwaysOnTop: vi.fn(),
        close: vi.fn(),
        isMaximized: vi.fn(async () => false),
    },
}));
vi.mock('@tauri-apps/api/path', () => ({
    appConfigDir: async () => '/config',
    appCacheDir: async () => '/cache',
    join: async (...parts) => parts.join('/'),
}));
vi.mock('@tauri-apps/api/fs', () => ({
    BaseDirectory: { AppConfig: 1 },
    exists: async () => true,
    readDir: async () => [{ name: 'plugin_alpha' }, { name: 'plugin_beta' }],
    readTextFile: async (path) => {
        if (path.endsWith('info.json')) {
            return JSON.stringify({
                display: path.includes('alpha') ? 'Alpha' : 'Beta',
                language: { auto: 'auto', en: 'en' },
            });
        }
        const name = path.includes('alpha') ? 'plugin_alpha' : 'plugin_beta';
        if (native.pluginSource.has(name)) return native.pluginSource.get(name);
        return `function recognize(base64, language, { config, utils }) {
            return utils.run('ocr', { base64, language, marker: config.marker });
        }`;
    },
    readBinaryFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(async (name, callback) => {
        if (!native.listeners.has(name)) native.listeners.set(name, new Set());
        native.listeners.get(name).add(callback);
        return () => native.listeners.get(name)?.delete(callback);
    }),
    emit: vi.fn(async (name, payload) => {
        for (const callback of native.listeners.get(name) ?? []) callback({ payload });
    }),
}));
vi.mock('../../utils/store', () => ({
    store: {
        get: native.get,
        set: native.set,
        save: native.save,
    },
}));

import Recognize from './index';
import '../../i18n';

const alpha = 'plugin_alpha@first';
const beta = 'plugin_beta@second';
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
};
const renderWindow = () =>
    render(
        <Provider store={createStore()}>
            <NextUIProvider>
                <Recognize />
            </NextUIProvider>
        </Provider>
    );

describe('batch OCR window', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        native.ocr.mockReset();
        native.invoke.mockReset();
        native.listeners.clear();
        native.pluginSource.clear();
        native.config = new Map([
            ['recognize_service_list', [alpha, beta]],
            ['recognize_auto_service_list', [alpha, beta]],
            ['recognize_language', 'auto'],
            ['recognize_auto_copy', false],
            ['recognize_delete_newline', false],
            ['recognize_hide_window', false],
            ['recognize_close_on_blur', false],
            ['server_port', 60828],
            [alpha, { instanceName: 'Alpha', marker: 'alpha' }],
            [beta, { instanceName: 'Beta', marker: 'beta' }],
        ]);
        native.set.mockImplementation(async (key, value) => native.config.set(key, value));
        native.get.mockImplementation(async (key) => native.config.get(key) ?? null);
        native.save.mockResolvedValue(undefined);
        native.writeText.mockResolvedValue(undefined);
        native.fetch.mockResolvedValue({ ok: true });
        native.invoke.mockImplementation(async (command, args) => {
            if (command === 'get_base64') return 'IMAGE';
            if (command === 'run_binary') return native.ocr(args.args);
        });
    });

    it('starts selected services together and displays each result without waiting for the other', async () => {
        const slow = deferred();
        native.ocr.mockImplementation(({ marker }) => (marker === 'alpha' ? slow.promise : 'Beta output'));
        renderWindow();

        await waitFor(() => expect(native.ocr).toHaveBeenCalledTimes(2));
        expect(await screen.findByDisplayValue('Beta output')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('Alpha output')).not.toBeInTheDocument();
        await act(async () => slow.resolve('Alpha output'));
        expect(await screen.findByDisplayValue('Alpha output')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Beta output')).toBeInTheDocument();
    });

    it('adds a temporary service without repeating or replacing the existing result or saved selection', async () => {
        native.config.set('recognize_auto_service_list', [alpha]);
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        renderWindow();
        expect(await screen.findByDisplayValue('alpha output')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Services for this window' }));
        await userEvent.click(await screen.findByRole('checkbox', { name: 'Beta' }));

        expect(await screen.findByDisplayValue('beta output')).toBeInTheDocument();
        expect(screen.getByDisplayValue('alpha output')).toBeInTheDocument();
        expect(native.ocr).toHaveBeenCalledTimes(2);
        expect(native.config.get('recognize_auto_service_list')).toEqual([alpha]);
        expect(native.set).not.toHaveBeenCalledWith('recognize_auto_service_list', expect.anything());
    });

    it('recognizes a new screenshot event even when the image bytes are unchanged', async () => {
        native.ocr.mockImplementation(({ marker }) => `${marker} original`);
        renderWindow();
        await screen.findByDisplayValue('alpha original');
        await screen.findByDisplayValue('beta original');
        native.ocr.mockImplementation(({ marker }) => `${marker} replacement`);

        act(() => {
            for (const callback of native.listeners.get('new_image')) void callback({});
        });

        expect(await screen.findByDisplayValue('alpha replacement')).toBeInTheDocument();
        expect(await screen.findByDisplayValue('beta replacement')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('alpha original')).not.toBeInTheDocument();
        expect(native.ocr).toHaveBeenCalledTimes(4);
    });

    it('keeps multiple OCR results readable inside the scrolling result column', async () => {
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        renderWindow();

        await screen.findByDisplayValue('alpha output');
        await screen.findByDisplayValue('beta output');
        const resultAreas = screen.getAllByRole('region');

        expect(resultAreas).toHaveLength(2);
        for (const resultArea of resultAreas) {
            expect(resultArea).toHaveClass('min-h-[320px]', 'flex-shrink-0');
            expect(resultArea).not.toHaveClass('max-h-[300px]');
        }
        expect(resultAreas[0].parentElement).toHaveClass('overflow-y-auto');
    });

    it('filters temporary services by label, service, and instance id while preserving hidden selections', async () => {
        native.config.set(alpha, { instanceName: 'Friendly Vision', marker: 'alpha' });
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        renderWindow();
        await screen.findByDisplayValue('alpha output');
        await screen.findByDisplayValue('beta output');

        await userEvent.click(screen.getByRole('button', { name: 'Services for this window' }));
        const search = await screen.findByRole('textbox', { name: 'Search services' });

        await userEvent.type(search, 'FRIENDLY');
        expect(screen.getByRole('checkbox', { name: 'Friendly Vision' })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Beta' })).not.toBeInTheDocument();

        await userEvent.clear(search);
        await userEvent.type(search, 'PLUGIN_BETA');
        expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Friendly Vision' })).not.toBeInTheDocument();

        await userEvent.clear(search);
        await userEvent.type(search, 'PLUGIN_BETA@SECOND');
        expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeInTheDocument();

        await userEvent.clear(search);
        await userEvent.type(search, 'SECOND');
        await userEvent.click(screen.getByRole('checkbox', { name: 'Beta' }));
        await userEvent.clear(search);

        expect(screen.getByRole('checkbox', { name: 'Friendly Vision' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Beta' })).not.toBeChecked();
        expect(screen.getByDisplayValue('alpha output')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: /Beta/ })).not.toBeInTheDocument();

        await userEvent.type(search, 'no matching service');
        expect(screen.getByRole('status')).toHaveTextContent('No matching services');
        await userEvent.click(screen.getByRole('button', { name: 'clear input' }));
        expect(screen.getByRole('checkbox', { name: 'Friendly Vision' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeInTheDocument();
    });

    it('shows the whole temporary service name instead of clipping it', async () => {
        const longName = 'Google | 哈基米 3.5FL High 文字辨識 with an unusually long instance label that keeps going';
        native.config.set(alpha, { instanceName: longName, marker: 'alpha' });
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        renderWindow();
        await screen.findByDisplayValue('alpha output');

        await userEvent.click(screen.getByRole('button', { name: 'Services for this window' }));
        const picker = within(await screen.findByRole('group', { name: 'Services for this window' }));
        expect(picker.getByRole('checkbox', { name: longName })).toBeInTheDocument();
        const name = picker.getByText(longName);
        expect(name).toHaveClass('break-words');
        expect(name).not.toHaveClass('truncate');
        expect(name.closest('label')).not.toHaveClass('truncate');
        expect(name.closest('label').querySelector('.truncate, .whitespace-nowrap')).toBeNull();
    });

    it('allows replacing all text in one result and retries only that service', async () => {
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        renderWindow();
        await screen.findByDisplayValue('alpha output');
        await screen.findByDisplayValue('beta output');
        const alphaArea = within(screen.getByRole('region', { name: /Alpha/ }));
        const betaArea = within(screen.getByRole('region', { name: /Beta/ }));

        await userEvent.clear(betaArea.getByRole('textbox'));
        await userEvent.type(betaArea.getByRole('textbox'), 'Edited Beta');
        await userEvent.click(betaArea.getByRole('button', { name: 'Copy' }));
        expect(native.writeText).toHaveBeenLastCalledWith('Edited Beta');
        await userEvent.click(betaArea.getByRole('button', { name: 'Translate' }));
        expect(native.fetch).toHaveBeenLastCalledWith(
            'http://127.0.0.1:60828/translate',
            expect.objectContaining({ body: 'Edited Beta' })
        );

        native.ocr.mockImplementation(({ marker }) => `${marker} retried`);
        await userEvent.click(alphaArea.getByRole('button', { name: 'Try again' }));
        expect(await alphaArea.findByDisplayValue('alpha retried')).toBeInTheDocument();
        expect(betaArea.getByDisplayValue('Edited Beta')).toBeInTheDocument();
        expect(native.ocr).toHaveBeenCalledTimes(3);
    });

    it('auto-copies only the first pre-selected service regardless of response order', async () => {
        native.config.set('recognize_auto_copy', true);
        const first = deferred();
        native.ocr.mockImplementation(({ marker }) => (marker === 'alpha' ? first.promise : 'Beta fast'));
        renderWindow();
        await screen.findByDisplayValue('Beta fast');
        expect(native.writeText).not.toHaveBeenCalled();

        await act(async () => first.resolve('Alpha preferred'));
        await waitFor(() => expect(native.writeText).toHaveBeenCalledWith('Alpha preferred'));
        expect(native.writeText).toHaveBeenCalledTimes(1);
    });

    it('invalidates pending results and auto-copy as soon as another image starts loading', async () => {
        native.config.set('recognize_auto_copy', true);
        const previousResult = deferred();
        const nextImage = deferred();
        native.ocr.mockImplementation(({ marker }) => (marker === 'alpha' ? previousResult.promise : 'Beta original'));
        renderWindow();
        await screen.findByDisplayValue('Beta original');
        native.invoke.mockImplementation(async (command, args) => {
            if (command === 'get_base64') return nextImage.promise;
            if (command === 'run_binary') return native.ocr(args.args);
        });
        act(() => {
            for (const callback of native.listeners.get('new_image')) void callback({});
        });
        await act(async () => previousResult.resolve('Stale Alpha'));
        expect(screen.queryByDisplayValue('Stale Alpha')).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('Beta original')).not.toBeInTheDocument();
        expect(native.writeText).not.toHaveBeenCalled();

        native.ocr.mockImplementation(({ marker }) => `${marker} latest`);
        await act(async () => nextImage.resolve('NEW_IMAGE'));
        expect(await screen.findByDisplayValue('alpha latest')).toBeInTheDocument();
        expect(await screen.findByDisplayValue('beta latest')).toBeInTheDocument();
        expect(native.writeText).toHaveBeenCalledExactlyOnceWith('alpha latest');
    });

    it('keeps another service usable when the preferred service fails, without copying a fallback', async () => {
        native.config.set('recognize_auto_copy', true);
        native.ocr.mockImplementation(({ marker }) => {
            if (marker === 'alpha') throw new Error('Alpha failed');
            return 'Beta success';
        });
        renderWindow();
        expect(await screen.findByDisplayValue('Error: Alpha failed')).toBeInTheDocument();
        expect(await screen.findByDisplayValue('Beta success')).toBeInTheDocument();
        expect(native.writeText).not.toHaveBeenCalled();
        expect(
            within(screen.getByRole('region', { name: /Alpha/ })).getByRole('button', { name: 'Copy' })
        ).toBeDisabled();
        expect(
            within(screen.getByRole('region', { name: /Beta/ })).getByRole('button', { name: 'Copy' })
        ).toBeEnabled();
    });

    it('waits for selection hydration and respects an empty selection even in hidden-window mode', async () => {
        const selection = deferred();
        native.config.set('recognize_auto_service_list', selection.promise);
        native.config.set('recognize_hide_window', true);
        renderWindow();
        await waitFor(() => expect(native.get).toHaveBeenCalledWith('recognize_auto_service_list'));
        expect(native.ocr).not.toHaveBeenCalled();
        await act(async () => selection.resolve([]));

        expect(
            await screen.findByText('No services selected. Check at least one service to start OCR.')
        ).toBeInTheDocument();
        expect(native.ocr).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Recognize selected' })).toBeDisabled();
        await waitFor(() => expect(native.show).toHaveBeenCalled());
        expect(native.hide).not.toHaveBeenCalled();
    });

    it('preserves the legacy first-service default when no auto-selection was saved', async () => {
        native.config.delete('recognize_auto_service_list');
        native.ocr.mockImplementation(({ marker }) => `${marker} legacy`);
        renderWindow();
        expect(await screen.findByDisplayValue('alpha legacy')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: /Beta/ })).not.toBeInTheDocument();
        expect(native.ocr).toHaveBeenCalledTimes(1);
        expect(native.config.get('recognize_auto_service_list')).toEqual([alpha]);
    });

    it('discards temporary selections when the window closes and reopens', async () => {
        native.config.set('recognize_auto_service_list', [alpha]);
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        const firstWindow = renderWindow();
        await screen.findByDisplayValue('alpha output');
        await userEvent.click(screen.getByRole('button', { name: 'Services for this window' }));
        await userEvent.click(await screen.findByRole('checkbox', { name: 'Beta' }));
        await screen.findByDisplayValue('beta output');
        firstWindow.unmount();

        renderWindow();
        await screen.findByDisplayValue('alpha output');
        expect(screen.queryByRole('region', { name: /Beta/ })).not.toBeInTheDocument();
        expect(native.config.get('recognize_auto_service_list')).toEqual([alpha]);
        expect(native.ocr.mock.calls.filter(([args]) => args.marker === 'beta')).toHaveLength(1);
    });

    it('ignores a pending preferred result after the window unmounts', async () => {
        native.config.set('recognize_auto_copy', true);
        const pending = deferred();
        native.ocr.mockImplementation(({ marker }) => (marker === 'alpha' ? pending.promise : 'Beta output'));
        const view = renderWindow();
        await screen.findByDisplayValue('Beta output');
        view.unmount();
        await act(async () => pending.resolve('Closed window result'));
        expect(native.writeText).not.toHaveBeenCalled();
    });

    it('keeps separate instances of the same OCR plugin independent', async () => {
        const secondAlpha = 'plugin_alpha@another';
        native.config.set('recognize_service_list', [alpha, secondAlpha]);
        native.config.set('recognize_auto_service_list', [alpha, secondAlpha]);
        native.config.set(secondAlpha, { instanceName: 'Second Alpha', marker: 'second-alpha' });
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        renderWindow();

        expect(await screen.findByDisplayValue('alpha output')).toBeInTheDocument();
        expect(await screen.findByDisplayValue('second-alpha output')).toBeInTheDocument();
        expect(native.ocr).toHaveBeenCalledTimes(2);
    });

    it('settles plugin load errors and unsupported languages without leaving other services loading', async () => {
        native.pluginSource.set('plugin_alpha', "throw new Error('Plugin load failed');");
        native.ocr.mockResolvedValue('Beta output');
        renderWindow();
        await screen.findByDisplayValue('Error: Plugin load failed');
        await screen.findByDisplayValue('Beta output');
        expect(screen.getByRole('region', { name: /Alpha/ })).toHaveAttribute('aria-busy', 'false');

        await userEvent.click(screen.getByRole('button', { name: 'Recognition Language' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'French' }));
        await waitFor(() =>
            expect(screen.getAllByDisplayValue("This service doesn't support the selected language.")).toHaveLength(2)
        );
        expect(native.ocr).toHaveBeenCalledTimes(1);
        for (const area of screen.getAllByRole('region')) expect(area).toHaveAttribute('aria-busy', 'false');
    });

    it('runs an instance-suffixed native OCR service alongside a plugin with mapped language', async () => {
        native.config.set('recognize_service_list', ['system@native', beta]);
        native.config.set('recognize_auto_service_list', ['system@native', beta]);
        native.config.set('recognize_language', 'en');
        native.config.set('system@native', { instanceName: 'Native OCR' });
        native.invoke.mockImplementation(async (command, args) => {
            if (command === 'get_base64') return 'IMAGE';
            if (command === 'system_ocr') return 'System output';
            if (command === 'run_binary') return native.ocr(args.args);
        });
        native.ocr.mockResolvedValue('Plugin output');
        renderWindow();

        expect(await screen.findByDisplayValue('System output')).toBeInTheDocument();
        expect(await screen.findByDisplayValue('Plugin output')).toBeInTheDocument();
        expect(native.invoke).toHaveBeenCalledWith('system_ocr', { lang: 'en-US' });
    });

    it('keeps temporary selections for new images and never changes auto-copy to a replacement service', async () => {
        native.config.set('recognize_auto_service_list', [alpha]);
        native.config.set('recognize_auto_copy', true);
        native.ocr.mockImplementation(({ marker }) => `${marker} output`);
        renderWindow();
        await screen.findByDisplayValue('alpha output');
        await userEvent.click(screen.getByRole('button', { name: 'Services for this window' }));
        await userEvent.click(await screen.findByRole('checkbox', { name: 'Beta' }));
        await userEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
        await userEvent.keyboard('{Escape}');
        await screen.findByDisplayValue('beta output');
        native.writeText.mockClear();
        native.ocr.mockImplementation(({ marker }) => `${marker} new image`);

        act(() => {
            for (const callback of native.listeners.get('new_image')) void callback({});
        });
        await screen.findByDisplayValue('beta new image');
        expect(screen.queryByRole('region', { name: /Alpha/ })).not.toBeInTheDocument();
        expect(native.writeText).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Recognize selected' }));
        await waitFor(() => expect(native.ocr.mock.calls.filter(([args]) => args.marker === 'beta')).toHaveLength(3));
        expect(native.ocr.mock.calls.filter(([args]) => args.marker === 'alpha')).toHaveLength(1);
        expect(native.config.get('recognize_auto_service_list')).toEqual([alpha]);
    });

    it('opens follow-up chat with the selected OCR card image, text, and instance configuration', async () => {
        native.config.set(alpha, {
            instanceName: 'Alpha',
            marker: 'alpha',
            apiKey: 'test-only-alpha',
            requestPath: 'https://alpha.invalid/v1/chat/completions',
            model: 'alpha-model',
        });
        native.config.set(beta, {
            instanceName: 'Beta',
            marker: 'beta',
            apiKey: 'test-only-beta',
            requestPath: 'https://beta.invalid/v1/chat/completions',
            model: 'beta-model',
        });
        native.ocr.mockImplementation(({ marker }) => `${marker} answer`);
        renderWindow();
        await screen.findByText('alpha answer');
        await screen.findByText('beta answer');
        const betaArea = within(screen.getByRole('region', { name: /Beta/ }));
        await userEvent.click(betaArea.getByRole('button', { name: 'Follow-up Chat' }));
        const chatCall = native.invoke.mock.calls.find(([command]) => command === 'open_chat_window');
        expect(chatCall).toBeDefined();
        const context = JSON.parse(chatCall[1].context);
        expect(context).toMatchObject({
            version: 1,
            kind: 'recognize',
            autoSubmit: true,
            apiConfig: {
                service: 'openai',
                apiKey: 'test-only-beta',
                requestPath: 'https://beta.invalid/v1/chat/completions',
                model: 'beta-model',
                stream: true,
            },
        });
        expect(context.initialMessages).toHaveLength(1);
        expect(context.initialMessages[0].role).toBe('user');
        expect(context.initialMessages[0].content[0]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,IMAGE' },
        });
        expect(context.initialMessages[0].content[1]).toMatchObject({ type: 'text' });
        expect(context.initialMessages[0].content[1].text).toContain('beta answer');
    });

    it('opens image-only follow-up chat when OCR returns no text', async () => {
        native.config.set(alpha, {
            instanceName: 'Alpha',
            marker: 'alpha',
            apiKey: 'test-only-alpha',
            requestPath: 'https://alpha.invalid/v1/chat/completions',
            model: 'alpha-model',
        });
        native.config.set('recognize_auto_service_list', [alpha]);
        native.ocr.mockResolvedValue('');
        renderWindow();

        const alphaArea = within(await screen.findByRole('region', { name: /Alpha/ }));
        const followUp = alphaArea.getByRole('button', { name: 'Follow-up Chat' });
        await waitFor(() => expect(followUp).toBeEnabled());
        await userEvent.click(followUp);

        const chatCall = native.invoke.mock.calls.find(([command]) => command === 'open_chat_window');
        const context = JSON.parse(chatCall[1].context);
        expect(context.initialMessages).toEqual([
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: 'data:image/png;base64,IMAGE' },
                    },
                ],
            },
        ]);
    });

    it('keeps text-only follow-up available when no OCR image exists', async () => {
        native.config.set(alpha, {
            instanceName: 'Alpha',
            marker: 'alpha',
            apiKey: 'test-only-alpha',
            requestPath: 'https://alpha.invalid/v1/chat/completions',
            model: 'alpha-model',
        });
        native.config.set('recognize_auto_service_list', [alpha]);
        native.invoke.mockImplementation(async (command, args) => {
            if (command === 'get_base64') return '';
            if (command === 'run_binary') return native.ocr(args.args);
        });
        renderWindow();

        const alphaArea = within(await screen.findByRole('region', { name: /Alpha/ }));
        await userEvent.click(alphaArea.getByRole('button', { name: 'Edit Text' }));
        await userEvent.type(alphaArea.getByRole('textbox'), 'manually entered OCR text');
        await userEvent.click(alphaArea.getByRole('button', { name: 'Follow-up Chat' }));

        const chatCall = native.invoke.mock.calls.find(([command]) => command === 'open_chat_window');
        const context = JSON.parse(chatCall[1].context);
        expect(context.initialMessages).toEqual([{ role: 'user', content: 'manually entered OCR text' }]);
    });
});
