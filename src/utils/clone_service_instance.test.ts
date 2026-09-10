import { describe, expect, it, vi } from 'vitest';

import { cloneServiceInstance, type CloneServiceInstanceStore } from './clone_service_instance';

class MemoryStore implements CloneServiceInstanceStore {
    readonly values = new Map<string, unknown>();
    readonly set = vi.fn(async (key: string, value: unknown) => {
        this.values.set(key, value);
    });
    readonly save = vi.fn(async () => {});
    readonly delete = vi.fn(async (key: string) => {
        this.values.delete(key);
    });

    constructor(initialValues: Record<string, unknown>) {
        Object.entries(initialValues).forEach(([key, value]) => this.values.set(key, value));
    }

    async get(key: string) {
        return this.values.get(key) ?? null;
    }

    async has(key: string) {
        return this.values.has(key);
    }
}

describe('cloneServiceInstance', () => {
    it('persists an independent copy of the complete legacy service configuration and appends its key', async () => {
        const sourceConfig = {
            apiKey: 'secret-value',
            apiUrl: 'https://api.example.test/v1',
            enable: false,
            prompts: {
                system: 'Translate into Traditional Chinese',
                examples: ['one', 'two'],
            },
        };
        const store = new MemoryStore({
            deepl: sourceConfig,
            translate_service_list: ['deepl'],
        });
        let currentList = ['deepl'];

        const clonedKey = await cloneServiceInstance('deepl', {
            store,
            createKey: () => 'deepl@copy',
            listKey: 'translate_service_list',
            getCurrentList: () => currentList,
            publishCurrentList: (nextList) => {
                currentList = nextList;
            },
        });

        const clonedConfig = (await store.get(clonedKey)) as typeof sourceConfig;
        expect(clonedKey).toBe('deepl@copy');
        expect(clonedConfig).toEqual(sourceConfig);
        expect(clonedConfig).not.toBe(sourceConfig);
        expect(clonedConfig.prompts).not.toBe(sourceConfig.prompts);
        expect(clonedConfig.prompts.examples).not.toBe(sourceConfig.prompts.examples);
        expect(currentList).toEqual(['deepl', 'deepl@copy']);
        expect(await store.get('translate_service_list')).toEqual(['deepl', 'deepl@copy']);
        expect(store.save).toHaveBeenCalledOnce();
    });

    it('keeps the plugin backend name and retries keys that already exist in the list or store', async () => {
        const store = new MemoryStore({
            'plugin:sample@source': { apiKey: 'secret-value' },
            'plugin:sample@stored': {},
            recognize_service_list: ['plugin:sample@source', 'plugin:sample@listed'],
        });
        const candidates = ['plugin:sample@listed', 'plugin:sample@stored', 'plugin:sample@copy'];
        let currentList = ['plugin:sample@source', 'plugin:sample@listed'];

        const clonedKey = await cloneServiceInstance('plugin:sample@source', {
            store,
            createKey: (serviceName) => {
                expect(serviceName).toBe('plugin:sample');
                return candidates.shift()!;
            },
            listKey: 'recognize_service_list',
            getCurrentList: () => currentList,
            publishCurrentList: (nextList) => {
                currentList = nextList;
            },
        });

        expect(clonedKey).toBe('plugin:sample@copy');
        expect(currentList).toEqual(['plugin:sample@source', 'plugin:sample@listed', 'plugin:sample@copy']);
    });

    it('writes the final list in the combined save but waits to publish it until persistence completes', async () => {
        const store = new MemoryStore({
            lingva_tts: { voice: 'en-US' },
            tts_service_list: ['lingva_tts'],
        });
        let finishSave!: () => void;
        store.save.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishSave = resolve;
                })
        );
        let currentList = ['lingva_tts'];

        const cloning = cloneServiceInstance('lingva_tts', {
            store,
            createKey: () => 'lingva_tts@copy',
            listKey: 'tts_service_list',
            getCurrentList: () => currentList,
            publishCurrentList: (nextList) => {
                currentList = nextList;
            },
        });
        await vi.waitFor(() => expect(store.save).toHaveBeenCalledOnce());
        expect(await store.get('tts_service_list')).toEqual(['lingva_tts', 'lingva_tts@copy']);
        expect(currentList).toEqual(['lingva_tts']);
        finishSave();
        await cloning;

        expect(currentList).toEqual(['lingva_tts', 'lingva_tts@copy']);
    });

    it('does not append a key when persistence fails', async () => {
        const store = new MemoryStore({
            anki: { url: 'http://localhost:8765' },
            collection_service_list: ['anki'],
        });
        store.save.mockRejectedValueOnce(new Error('save failed'));
        let currentList = ['anki'];
        const publishCurrentList = vi.fn((nextList: string[]) => {
            currentList = nextList;
        });

        await expect(
            cloneServiceInstance('anki', {
                store,
                createKey: () => 'anki@copy',
                listKey: 'collection_service_list',
                getCurrentList: () => currentList,
                publishCurrentList,
            })
        ).rejects.toThrow('save failed');

        expect(publishCurrentList).not.toHaveBeenCalled();
        expect(currentList).toEqual(['anki']);
        expect(store.values.has('anki@copy')).toBe(false);
        expect(await store.get('collection_service_list')).toEqual(['anki']);
    });

    it('does not create an empty copy when the queued source has already been removed from the list', async () => {
        const store = new MemoryStore({
            'deepl@removed': { apiKey: 'secret-value' },
            translate_service_list: ['google'],
        });
        const publishCurrentList = vi.fn();

        await expect(
            cloneServiceInstance('deepl@removed', {
                store,
                createKey: () => 'deepl@copy',
                listKey: 'translate_service_list',
                getCurrentList: () => ['google'],
                publishCurrentList,
            })
        ).rejects.toThrow('Source service instance is no longer configured');

        expect(store.values.has('deepl@copy')).toBe(false);
        expect(publishCurrentList).not.toHaveBeenCalled();
    });
});
