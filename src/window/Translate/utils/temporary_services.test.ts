import { describe, expect, it } from 'vitest';

import {
    deriveTemporaryServiceState,
    getTranslationRuntimeConfig,
    updateTemporaryServiceSelection,
} from './temporary_services';

describe('deriveTemporaryServiceState', () => {
    const serviceList = ['active', 'paused', 'disabled', 'both'];
    const serviceInstanceConfigMap = {
        active: { enable: true },
        paused: { enable: true },
        disabled: { enable: false },
        both: { enable: false },
    };
    const pausedKeys = ['paused', 'both'];

    it('temporarily activates baseline paused and disabled Service Instances without changing their settings', () => {
        const configBefore = structuredClone(serviceInstanceConfigMap);
        const pausedBefore = [...pausedKeys];

        const state = deriveTemporaryServiceState({
            serviceList,
            serviceInstanceConfigMap,
            pausedKeys,
            selectedKeys: ['paused', 'disabled', 'both'],
        });

        expect(state).toEqual({
            candidateKeys: ['paused', 'disabled', 'both'],
            activeTemporaryKeys: ['paused', 'disabled', 'both'],
            effectivePausedKeys: [],
            effectiveDisabledKeys: [],
        });
        expect(serviceInstanceConfigMap).toEqual(configBefore);
        expect(pausedKeys).toEqual(pausedBefore);
    });

    it('restores the exact baseline when a temporary selection is cleared', () => {
        const state = deriveTemporaryServiceState({
            serviceList,
            serviceInstanceConfigMap,
            pausedKeys,
            selectedKeys: [],
        });

        expect(state.activeTemporaryKeys).toEqual([]);
        expect(state.effectivePausedKeys).toEqual(['paused', 'both']);
        expect(state.effectiveDisabledKeys).toEqual(['disabled', 'both']);
    });

    it('ignores stale and already-active selections', () => {
        const state = deriveTemporaryServiceState({
            serviceList,
            serviceInstanceConfigMap,
            pausedKeys,
            selectedKeys: ['missing', 'active', 'disabled'],
        });

        expect(state.activeTemporaryKeys).toEqual(['disabled']);
        expect(state.candidateKeys).toEqual(['paused', 'disabled', 'both']);
    });
});

describe('updateTemporaryServiceSelection', () => {
    it('accepts the controlled selection outside a drag', () => {
        expect(updateTemporaryServiceSelection(['paused'], ['disabled', 'both'], false)).toEqual(['disabled', 'both']);
    });

    it('keeps the same membership while a drag is in progress', () => {
        const current = ['paused'];

        const next = updateTemporaryServiceSelection(current, ['disabled'], true);

        expect(next).toBe(current);
    });
});

describe('getTranslationRuntimeConfig', () => {
    it('activates a plugin through a cloned runtime config without mutating the stored config', () => {
        const stored = { enable: false, apiKey: 'public-test-value' };

        const runtime = getTranslationRuntimeConfig(stored, true);

        expect(runtime).toEqual({ enable: 'true', apiKey: 'public-test-value' });
        expect(runtime).not.toBe(stored);
        expect(stored).toEqual({ enable: false, apiKey: 'public-test-value' });
    });

    it('keeps a built-in Service Instance config unchanged', () => {
        const stored = { enable: false, apiKey: 'public-test-value' };

        expect(getTranslationRuntimeConfig(stored, false)).toBe(stored);
    });
});
