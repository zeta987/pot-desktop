import { NextUIProvider } from '@nextui-org/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
    globalThis.AudioContext = class {};
    return {
        invoke: vi.fn(),
        listeners: new Map(),
        hide: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
    };
});

vi.mock('@tauri-apps/api', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/api/window', () => ({
    appWindow: { hide: native.hide, show: native.show, setFocus: native.focus },
}));
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(async (event, callback) => {
        native.listeners.set(event, callback);
        return () => native.listeners.delete(event);
    }),
    emit: vi.fn(),
}));
vi.mock('../../../utils/store', () => ({
    store: { get: vi.fn(async () => false), set: vi.fn(), save: vi.fn() },
}));

import ImageArea from './index';
import '../../../i18n';

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => (resolve = done));
    return { promise, resolve };
};

describe('OCR image loading', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        native.listeners.clear();
    });

    it('keeps the newest screenshot when image loads finish out of order', async () => {
        const previous = deferred();
        const latest = deferred();
        native.invoke.mockReturnValueOnce(previous.promise).mockReturnValueOnce(latest.promise);
        render(
            <Provider store={createStore()}>
                <NextUIProvider>
                    <ImageArea />
                </NextUIProvider>
            </Provider>
        );
        await waitFor(() => expect(native.listeners.has('new_image')).toBe(true));
        act(() => {
            void native.listeners.get('new_image')({});
        });
        await act(async () => latest.resolve('NEW_IMAGE'));
        await act(async () => previous.resolve('OLD_IMAGE'));

        expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,NEW_IMAGE');
    });

    it('stops listening and ignores a pending load after the window unmounts', async () => {
        const pending = deferred();
        native.invoke.mockReturnValueOnce(pending.promise);
        const view = render(
            <Provider store={createStore()}>
                <NextUIProvider>
                    <ImageArea />
                </NextUIProvider>
            </Provider>
        );
        await waitFor(() => expect(native.listeners.has('new_image')).toBe(true));
        view.unmount();
        await act(async () => pending.resolve('CLOSED_WINDOW_IMAGE'));

        expect(native.listeners.has('new_image')).toBe(false);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
});
