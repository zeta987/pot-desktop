import { emit } from '@tauri-apps/api/event';
import { useCallback, useRef } from 'react';

import { useConfig } from '../../../../hooks';
import { store } from '../../../../utils/store';

async function restoreStoredList(key, previousList) {
    try {
        if (previousList === null) {
            await store.delete(key);
        } else {
            await store.set(key, previousList);
        }
        await store.save();
    } catch {
        // Preserve the original persistence failure for the caller.
    }
}

export function useServiceInstanceList(key, defaultValue) {
    const [list, setListState] = useConfig(key, defaultValue, { sync: false });
    const listRef = useRef(list);
    const operationQueueRef = useRef(Promise.resolve());
    listRef.current = list;

    const getCurrentList = useCallback(() => listRef.current, []);
    const publishCurrentList = useCallback(
        async (nextList) => {
            listRef.current = nextList;
            setListState(nextList);
            const eventKey = key.replaceAll('.', '_').replaceAll('@', ':');
            try {
                await emit(`${eventKey}_changed`, nextList);
            } catch {
                // The list is already durable and visible locally.
            }
        },
        [key, setListState]
    );
    const persistCurrentList = useCallback(
        async (nextList) => {
            const previousList = await store.get(key);
            try {
                await store.set(key, nextList);
                await store.save();
            } catch (error) {
                await restoreStoredList(key, previousList);
                throw error;
            }
            await publishCurrentList(nextList);
        },
        [key, publishCurrentList]
    );
    const runExclusive = useCallback(
        (operation) => {
            const result = operationQueueRef.current.then(() =>
                operation({ getCurrentList, persistCurrentList, publishCurrentList })
            );
            operationQueueRef.current = result.then(
                () => undefined,
                () => undefined
            );
            return result;
        },
        [getCurrentList, persistCurrentList, publishCurrentList]
    );
    const updateCurrentList = useCallback(
        (update) =>
            runExclusive(async ({ getCurrentList: getLatestList, persistCurrentList: persistLatestList }) => {
                const currentList = getLatestList() ?? [];
                const nextList = typeof update === 'function' ? update(currentList) : update;
                if (nextList !== currentList) {
                    await persistLatestList(nextList);
                }
                return nextList;
            }),
        [runExclusive]
    );

    return [list, updateCurrentList, runExclusive];
}
