import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
    globalThis.AudioContext = class {};
    return {
        emit: vi.fn(),
        get: vi.fn(),
        set: vi.fn(),
        save: vi.fn(),
        has: vi.fn(),
        delete: vi.fn(),
        toastError: vi.fn(),
        values: new Map(),
        onDragEnd: null,
    };
});

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(async () => () => {}),
    emit: native.emit,
}));

vi.mock('../../../../../utils/store', () => ({
    store: {
        get: native.get,
        set: native.set,
        save: native.save,
        has: native.has,
        delete: native.delete,
    },
}));

vi.mock('../../../../../hooks', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useToastStyle: () => ({}) };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('react-hot-toast', () => ({
    default: { error: native.toastError },
    Toaster: () => null,
}));

vi.mock('@nextui-org/react', () => ({
    Card: ({ children, className }) => <div className={className}>{children}</div>,
    Spacer: () => null,
    Button: ({ children, onPress, startContent, 'aria-label': ariaLabel }) => (
        <button
            aria-label={ariaLabel}
            onClick={onPress}
        >
            {startContent}
            {children}
        </button>
    ),
    Switch: ({ children, isSelected, onValueChange, 'aria-label': ariaLabel }) => (
        <label>
            <input
                type='checkbox'
                role='switch'
                aria-label={ariaLabel}
                checked={isSelected}
                onChange={(event) => onValueChange(event.target.checked)}
            />
            {children}
        </label>
    ),
    useDisclosure: () => ({
        isOpen: false,
        onOpen: vi.fn(),
        onOpenChange: vi.fn(),
    }),
}));

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children, onDragEnd }) => {
        native.onDragEnd = onDragEnd;
        return <>{children}</>;
    },
    Droppable: ({ children }) =>
        children({
            innerRef: () => {},
            droppableProps: {},
        }),
    Draggable: ({ children }) =>
        children({
            innerRef: () => {},
            draggableProps: {},
            dragHandleProps: {},
        }),
}));

vi.mock('../../../../../services/recognize', () => ({
    system: { info: { icon: 'system.svg' } },
    tesseract: { info: { icon: 'tesseract.svg' } },
}));

vi.mock('../SelectPluginModal', () => ({ default: () => null }));
vi.mock('./SelectModal', () => ({ default: () => null }));
vi.mock('./ConfigModal', () => ({
    default: ({ updateServiceInstanceList }) => (
        <button onClick={() => updateServiceInstanceList('tesseract@new')}>add-test-service</button>
    ),
}));

import Recognize from './index';

const SERVICE_LIST_KEY = 'recognize_service_list';
const AUTO_SERVICE_LIST_KEY = 'recognize_auto_service_list';

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

const seedServices = (serviceKeys, autoServiceKeys) => {
    native.values.set(SERVICE_LIST_KEY, serviceKeys);
    serviceKeys.forEach((key) => native.values.set(key, {}));
    if (autoServiceKeys !== undefined) {
        native.values.set(AUTO_SERVICE_LIST_KEY, autoServiceKeys);
    }
};

const renderSettings = () => render(<Recognize pluginList={{}} />);

describe('OCR automatic service settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        native.values.clear();
        native.onDragEnd = null;
        native.get.mockImplementation(async (key) => (native.values.has(key) ? native.values.get(key) : null));
        native.set.mockImplementation((key, value) => native.values.set(key, value));
        native.has.mockImplementation((key) => native.values.has(key));
        native.delete.mockImplementation((key) => native.values.delete(key));
    });

    it('waits for service hydration before defaulting legacy settings to only the first full instance key', async () => {
        const serviceListLoad = deferred();
        const serviceKeys = ['system@primary', 'tesseract@fast'];
        serviceKeys.forEach((key) => native.values.set(key, {}));
        native.get.mockImplementation((key) => {
            if (key === SERVICE_LIST_KEY) return serviceListLoad.promise;
            return Promise.resolve(native.values.has(key) ? native.values.get(key) : null);
        });

        renderSettings();

        expect(native.get).toHaveBeenCalledWith(SERVICE_LIST_KEY);
        expect(native.get).not.toHaveBeenCalledWith(AUTO_SERVICE_LIST_KEY);
        expect(native.set).not.toHaveBeenCalledWith(AUTO_SERVICE_LIST_KEY, expect.anything());

        await act(async () => {
            serviceListLoad.resolve(serviceKeys);
            await serviceListLoad.promise;
        });

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(2));
        expect(screen.getAllByRole('switch')[0]).toBeChecked();
        expect(screen.getAllByRole('switch')[1]).not.toBeChecked();
        expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['system@primary']);
    });

    it('preserves an explicitly empty automatic service selection', async () => {
        seedServices(['system@primary', 'tesseract@fast'], []);

        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(2));
        expect(screen.getAllByRole('switch')[0]).not.toBeChecked();
        expect(screen.getAllByRole('switch')[1]).not.toBeChecked();
        expect(native.set).not.toHaveBeenCalledWith(AUTO_SERVICE_LIST_KEY, expect.anything());
    });

    it('treats a non-array legacy value as the first service and persists normalized full keys on interaction', async () => {
        seedServices(['system@primary', 'tesseract@fast'], false);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch', { name: 'recognize.auto_run' })).toHaveLength(2));
        expect(screen.getAllByRole('switch', { name: 'recognize.auto_run' })[0]).toBeChecked();
        expect(screen.getAllByRole('switch', { name: 'recognize.auto_run' })[1]).not.toBeChecked();

        fireEvent.click(screen.getAllByRole('switch', { name: 'recognize.auto_run' })[1]);
        await waitFor(() =>
            expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['system@primary', 'tesseract@fast'])
        );
    });

    it('persists enabling and disabling multiple full instance keys, including an empty selection', async () => {
        seedServices(['system@primary', 'tesseract@fast'], ['system@primary']);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(2));
        fireEvent.click(screen.getAllByRole('switch')[1]);
        await waitFor(() =>
            expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['system@primary', 'tesseract@fast'])
        );

        fireEvent.click(screen.getAllByRole('switch')[0]);
        await waitFor(() => expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['tesseract@fast']));

        fireEvent.click(screen.getAllByRole('switch')[1]);
        await waitFor(() => expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual([]));
    });

    it('keeps a newly added service disabled for automatic recognition', async () => {
        seedServices(['system@primary'], ['system@primary']);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(1));
        fireEvent.click(screen.getByRole('button', { name: 'add-test-service' }));

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(2));
        expect(screen.getAllByRole('switch')[1]).not.toBeChecked();
        await waitFor(() => expect(native.values.get(SERVICE_LIST_KEY)).toEqual(['system@primary', 'tesseract@new']));
        expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['system@primary']);
    });

    it('removes a deleted service from both ordered lists while retaining the other automatic picks', async () => {
        seedServices(['system@primary', 'tesseract@fast', 'tesseract@spare'], ['system@primary', 'tesseract@spare']);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(3));
        const firstServiceRow = screen.getByText('services.recognize.system.title').closest('.bg-content2');
        fireEvent.click(within(firstServiceRow).getByRole('button', { name: 'common.delete' }));

        await waitFor(() => expect(native.values.get(SERVICE_LIST_KEY)).toEqual(['tesseract@fast', 'tesseract@spare']));
        await waitFor(() => expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['tesseract@spare']));
        expect(native.values.has('system@primary')).toBe(false);
    });

    it('keeps the service and its config when the list cannot be durably updated before deletion', async () => {
        seedServices(['system@primary', 'tesseract@spare'], ['system@primary']);
        native.set.mockImplementation((key, value) => {
            if (key === SERVICE_LIST_KEY && Array.isArray(value) && value.length === 1) {
                throw new Error('list write failed');
            }
            native.values.set(key, value);
        });
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(2));
        const firstServiceRow = screen.getByText('services.recognize.system.title').closest('.bg-content2');
        fireEvent.click(within(firstServiceRow).getByRole('button', { name: 'common.delete' }));

        await waitFor(() =>
            expect(native.toastError).toHaveBeenCalledWith('common.service_list_save_failed', { style: {} })
        );
        expect(native.values.get(SERVICE_LIST_KEY)).toEqual(['system@primary', 'tesseract@spare']);
        expect(native.values.has('system@primary')).toBe(true);
        expect(native.delete).not.toHaveBeenCalledWith('system@primary');
    });

    it('keeps every current key when a queued drag targets a service deleted by a delayed save', async () => {
        seedServices(['system@primary', 'tesseract@fast', 'tesseract@spare'], ['system@primary']);
        const deleteSave = deferred();
        native.save.mockImplementationOnce(() => deleteSave.promise);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(3));
        const firstServiceRow = screen.getByText('services.recognize.system.title').closest('.bg-content2');
        fireEvent.click(within(firstServiceRow).getByRole('button', { name: 'common.delete' }));
        await waitFor(() => expect(native.save).toHaveBeenCalledOnce());

        fireEvent.click(screen.getAllByRole('switch')[2]);
        let dragPromise;
        act(() => {
            dragPromise = native.onDragEnd({
                draggableId: 'tesseract@spare',
                source: { index: 2 },
                destination: { index: 0 },
            });
        });

        await act(async () => {
            deleteSave.resolve();
            await dragPromise;
        });

        await waitFor(() => expect(native.values.get(SERVICE_LIST_KEY)).toEqual(['tesseract@fast', 'tesseract@spare']));
        await waitFor(() => expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['tesseract@spare']));
        expect(native.values.get(SERVICE_LIST_KEY)).not.toContain(undefined);
        expect(new Set(native.values.get(SERVICE_LIST_KEY)).size).toBe(2);
    });

    it('duplicates a configured service from its row and persists the copied instance', async () => {
        const sourceConfig = {
            apiKey: 'secret-value',
            apiUrl: 'https://ocr.example.test/v1',
            enable: false,
            prompts: { system: 'Read every line' },
        };
        seedServices(['tesseract@primary'], ['tesseract@primary']);
        native.values.set('tesseract@primary', sourceConfig);
        const persisted = deferred();
        native.save.mockImplementationOnce(() => persisted.promise);
        renderSettings();

        await waitFor(() => expect(screen.getByText('services.recognize.tesseract.title')).toBeInTheDocument());
        const serviceRow = screen.getByText('services.recognize.tesseract.title').closest('.bg-content2');
        fireEvent.click(within(serviceRow).getByRole('button', { name: 'common.clone_service' }));

        await waitFor(() => expect(native.save).toHaveBeenCalledOnce());
        expect(native.values.get(SERVICE_LIST_KEY)).toHaveLength(2);
        expect(screen.getAllByText('services.recognize.tesseract.title')).toHaveLength(1);
        persisted.resolve();
        await waitFor(() => expect(native.values.get(SERVICE_LIST_KEY)).toHaveLength(2));
        await waitFor(() => expect(screen.getAllByText('services.recognize.tesseract.title')).toHaveLength(2));
        const clonedKey = native.values.get(SERVICE_LIST_KEY)[1];
        expect(clonedKey).toMatch(/^tesseract@/);
        expect(clonedKey).not.toBe('tesseract@primary');
        expect(native.values.get(clonedKey)).toEqual(sourceConfig);
        expect(native.values.get(clonedKey)).not.toBe(sourceConfig);
        expect(native.save).toHaveBeenCalled();
        expect(native.emit).toHaveBeenCalledWith('recognize_service_list_changed', ['tesseract@primary', clonedKey]);
    });

    it('retains both new instances when two different service rows are duplicated together', async () => {
        seedServices(['tesseract@primary', 'tesseract@secondary'], ['tesseract@primary']);
        native.values.set('tesseract@primary', { apiKey: 'first-secret' });
        native.values.set('tesseract@secondary', { apiKey: 'second-secret' });
        renderSettings();

        await waitFor(() => expect(screen.getAllByText('services.recognize.tesseract.title')).toHaveLength(2));
        const serviceRows = screen
            .getAllByText('services.recognize.tesseract.title')
            .map((title) => title.closest('.bg-content2'));

        fireEvent.click(within(serviceRows[0]).getByRole('button', { name: 'common.clone_service' }));
        fireEvent.click(within(serviceRows[1]).getByRole('button', { name: 'common.clone_service' }));

        await waitFor(() => expect(native.values.get(SERVICE_LIST_KEY)).toHaveLength(4));
        const [firstCloneKey, secondCloneKey] = native.values.get(SERVICE_LIST_KEY).slice(2);
        expect(firstCloneKey).toMatch(/^tesseract@/);
        expect(secondCloneKey).toMatch(/^tesseract@/);
        expect(firstCloneKey).not.toBe(secondCloneKey);
        expect(native.values.get(firstCloneKey)).toEqual({ apiKey: 'first-secret' });
        expect(native.values.get(secondCloneKey)).toEqual({ apiKey: 'second-secret' });
    });

    it('rolls back and reports a safe error when final-list persistence fails after writing the copied config', async () => {
        seedServices(['tesseract@primary'], ['tesseract@primary']);
        native.values.set('tesseract@primary', { apiKey: 'secret-value' });
        let failedFinalListWrite = false;
        native.set.mockImplementation((key, value) => {
            if (key === SERVICE_LIST_KEY && Array.isArray(value) && value.length === 2 && !failedFinalListWrite) {
                failedFinalListWrite = true;
                throw new Error('list write failed');
            }
            native.values.set(key, value);
        });
        renderSettings();

        await waitFor(() => expect(screen.getByText('services.recognize.tesseract.title')).toBeInTheDocument());
        const serviceRow = screen.getByText('services.recognize.tesseract.title').closest('.bg-content2');
        fireEvent.click(within(serviceRow).getByRole('button', { name: 'common.clone_service' }));

        await waitFor(() =>
            expect(native.toastError).toHaveBeenCalledWith('common.clone_service_failed', { style: {} })
        );
        expect(native.values.get(SERVICE_LIST_KEY)).toEqual(['tesseract@primary']);
        expect([...native.values.keys()].filter((key) => key.startsWith('tesseract@'))).toEqual(['tesseract@primary']);
    });

    it('reorders the complete service list and retains automatic picks in the new configured order', async () => {
        seedServices(['system@primary', 'tesseract@fast', 'tesseract@spare'], ['system@primary', 'tesseract@spare']);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(3));
        await act(async () => {
            await native.onDragEnd({
                draggableId: 'system@primary',
                source: { index: 0 },
                destination: { index: 2 },
            });
        });

        await waitFor(() =>
            expect(native.values.get(SERVICE_LIST_KEY)).toEqual(['tesseract@fast', 'tesseract@spare', 'system@primary'])
        );
        await waitFor(() =>
            expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['tesseract@spare', 'system@primary'])
        );
    });

    it('retains an automatic OCR toggle changed while a reordered service list is still saving', async () => {
        seedServices(['system@primary', 'tesseract@fast'], ['system@primary']);
        const reorderSave = deferred();
        native.save.mockImplementationOnce(() => reorderSave.promise);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(2));
        let reorderPromise;
        act(() => {
            reorderPromise = native.onDragEnd({
                draggableId: 'system@primary',
                source: { index: 0 },
                destination: { index: 1 },
            });
        });
        await waitFor(() => expect(native.save).toHaveBeenCalledOnce());
        fireEvent.click(screen.getAllByRole('switch')[1]);

        await act(async () => {
            reorderSave.resolve();
            await reorderPromise;
        });

        await waitFor(() => expect(native.values.get(SERVICE_LIST_KEY)).toEqual(['tesseract@fast', 'system@primary']));
        await waitFor(() =>
            expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(['tesseract@fast', 'system@primary'])
        );
        expect(screen.getAllByRole('switch')[0]).toBeChecked();
        expect(screen.getAllByRole('switch')[1]).toBeChecked();
    });

    it('does not write either service list when a drag is cancelled', async () => {
        const serviceKeys = ['system@primary', 'tesseract@fast'];
        const autoServiceKeys = ['system@primary'];
        seedServices(serviceKeys, autoServiceKeys);
        renderSettings();

        await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(2));
        native.set.mockClear();
        await act(async () => {
            await native.onDragEnd({ source: { index: 0 }, destination: null });
            await new Promise((resolve) => setTimeout(resolve, 550));
        });

        expect(native.values.get(SERVICE_LIST_KEY)).toEqual(serviceKeys);
        expect(native.values.get(AUTO_SERVICE_LIST_KEY)).toEqual(autoServiceKeys);
        expect(native.set).not.toHaveBeenCalledWith(SERVICE_LIST_KEY, expect.anything());
        expect(native.set).not.toHaveBeenCalledWith(AUTO_SERVICE_LIST_KEY, expect.anything());
    });
});
