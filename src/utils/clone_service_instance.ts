import { store as defaultStore } from './store';
import { createServiceInstanceKey, getServiceName } from './service_instance';

export interface CloneServiceInstanceStore {
    get(key: string): unknown | Promise<unknown>;
    set(key: string, value: unknown): void | Promise<void>;
    has(key: string): boolean | Promise<boolean>;
    delete(key: string): unknown | Promise<unknown>;
    save(): void | Promise<void>;
}

interface CloneServiceInstanceOptions {
    store?: CloneServiceInstanceStore;
    createKey?: (serviceName: string) => string;
    listKey: string;
    getCurrentList: () => readonly string[] | null;
    publishCurrentList: (nextList: string[]) => void | Promise<void>;
}

const MAX_KEY_GENERATION_ATTEMPTS = 1000;

function cloneConfig(sourceConfig: unknown): unknown {
    return JSON.parse(JSON.stringify(sourceConfig ?? {}));
}

function getList(getCurrentList: CloneServiceInstanceOptions['getCurrentList']): readonly string[] {
    return getCurrentList() ?? [];
}

export async function cloneServiceInstance(sourceKey: string, options: CloneServiceInstanceOptions): Promise<string> {
    const {
        store = defaultStore,
        createKey = createServiceInstanceKey,
        listKey,
        getCurrentList,
        publishCurrentList,
    } = options;
    const serviceName = getServiceName(sourceKey);
    const initialList = getList(getCurrentList);
    if (!initialList.includes(sourceKey)) {
        throw new Error('Source service instance is no longer configured');
    }
    let clonedKey = '';

    for (let attempt = 0; attempt < MAX_KEY_GENERATION_ATTEMPTS; attempt += 1) {
        const candidate = createKey(serviceName);
        if (!initialList.includes(candidate) && !(await store.has(candidate))) {
            clonedKey = candidate;
            break;
        }
    }

    if (clonedKey === '') {
        throw new Error('Unable to generate a unique service instance key');
    }

    const sourceConfig = await store.get(sourceKey);
    const previousStoredList = await store.get(listKey);
    const latestList = getList(getCurrentList);
    const nextList = latestList.includes(clonedKey) ? [...latestList] : [...latestList, clonedKey];
    try {
        await store.set(clonedKey, cloneConfig(sourceConfig));
        await store.set(listKey, nextList);
        await store.save();
    } catch (error) {
        try {
            await store.delete(clonedKey);
            if (previousStoredList === null) {
                await store.delete(listKey);
            } else {
                await store.set(listKey, previousStoredList);
            }
            await store.save();
        } catch {
            // Preserve the original persistence failure for the caller.
        }
        throw error;
    }

    await publishCurrentList(nextList);

    return clonedKey;
}
