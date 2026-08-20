import { describe, expect, it, vi } from 'vitest';

import { LANGUAGE_NOT_SUPPORTED, runTranslation } from './translation_run';
import type { TranslateCall, TranslateCallOptions, TranslationRunRequest } from './translation_run';

const targetArea = () => ({
    setIsLoading: vi.fn(),
    setError: vi.fn(),
    setResult: vi.fn(),
    reveal: {
        collapse: vi.fn(),
        open: vi.fn(),
        settle: vi.fn(),
    },
});

const request = (overrides: Partial<TranslationRunRequest> = {}): TranslationRunRequest => ({
    isLanguagePairSupported: true,
    load: async () => (async () => 'hola') as TranslateCall,
    text: 'hello',
    from: 'en',
    to: 'es',
    config: { api_key: 'k' },
    detect: 'en',
    applyResult: vi.fn(),
    ...overrides,
});

/** A translate call that hands its options back, so a test can drive the streamed chunks itself. */
const capturing = (result: unknown = 'hola') => {
    const calls: Array<{ text: string; from: unknown; to: unknown; options: TranslateCallOptions }> = [];
    const translate: TranslateCall = async (text, from, to, options) => {
        calls.push({ text, from, to, options });
        return result;
    };
    return { calls, translate };
};

describe('runTranslation', () => {
    it('turns down a language pair the Service Instance does not cover, without starting a run', async () => {
        const area = targetArea();
        const load = vi.fn();

        const outcome = await runTranslation(request({ isLanguagePairSupported: false, load }), area);

        expect(outcome).toEqual({ status: 'unsupported' });
        expect(area.setError).toHaveBeenCalledWith(LANGUAGE_NOT_SUPPORTED);
        expect(area.reveal.open).toHaveBeenCalled();
        expect(load).not.toHaveBeenCalled();
        expect(area.setIsLoading).not.toHaveBeenCalledWith(true);
        expect(area.setIsLoading).toHaveBeenCalledWith(false);
        expect(area.reveal.collapse).not.toHaveBeenCalled();
    });

    it('settles the spinner a superseded run must leave behind when the next run turns the pair down', async () => {
        const area = targetArea();
        let superseded = false;
        let finish!: (value: unknown) => void;
        const inFlight = new Promise((resolve) => {
            finish = resolve;
        });

        const first = runTranslation(
            request({
                isSuperseded: () => superseded,
                load: async () => (() => inFlight) as TranslateCall,
            }),
            area
        );

        superseded = true;
        const second = await runTranslation(request({ isLanguagePairSupported: false }), area);
        finish('hola');

        expect(second).toEqual({ status: 'unsupported' });
        expect(await first).toEqual({ status: 'superseded' });
        expect(area.setIsLoading).toHaveBeenCalledTimes(2);
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
    });

    it('collapses the Target Area and marks it loading on the way out', async () => {
        const area = targetArea();

        await runTranslation(request(), area);

        expect(area.reveal.collapse).toHaveBeenCalled();
        expect(area.setIsLoading).toHaveBeenNthCalledWith(1, true);
    });

    it('hands the text and language pair to the Service Instance', async () => {
        const area = targetArea();
        const { calls, translate } = capturing();

        await runTranslation(
            request({
                load: async () => translate,
                text: 'hello',
                from: 'en',
                to: 'es',
                config: { api_key: 'k' },
                detect: 'en',
            }),
            area
        );

        expect(calls).toHaveLength(1);
        expect(calls[0].text).toBe('hello');
        expect(calls[0].from).toBe('en');
        expect(calls[0].to).toBe('es');
        expect(calls[0].options.config).toEqual({ api_key: 'k' });
        expect(calls[0].options.detect).toBe('en');
    });

    it('lands the final result, stops loading, and settles the Target Area', async () => {
        const area = targetArea();
        const applyResult = vi.fn();
        const onResolved = vi.fn();

        const outcome = await runTranslation(
            request({ load: async () => (async () => 'hola') as TranslateCall, applyResult, onResolved }),
            area
        );

        expect(outcome).toEqual({ status: 'resolved', result: 'hola' });
        expect(applyResult).toHaveBeenCalledWith('hola');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(area.reveal.settle).toHaveBeenCalledWith('hola');
        expect(onResolved).toHaveBeenCalledWith('hola');
    });

    it('opens the Target Area for every streamed chunk it shows', async () => {
        const area = targetArea();
        const { calls, translate } = capturing();

        await runTranslation(
            request({
                load: async () => async (text, from, to, options) => {
                    options.setResult('ho');
                    options.setResult('hol');
                    return translate(text, from, to, options);
                },
            }),
            area
        );

        expect(area.setResult).toHaveBeenNthCalledWith(1, 'ho');
        expect(area.setResult).toHaveBeenNthCalledWith(2, 'hol');
        expect(area.reveal.open).toHaveBeenCalledTimes(2);
        expect(calls).toHaveLength(1);
    });

    it('shows the reason a run failed and opens the Target Area to make it readable', async () => {
        const area = targetArea();
        const applyResult = vi.fn();

        const failure = new Error('service is down');
        const outcome = await runTranslation(
            request({ load: async () => (async () => Promise.reject(failure)) as TranslateCall, applyResult }),
            area
        );

        expect(outcome).toEqual({ status: 'rejected', error: failure });
        expect(area.setError).toHaveBeenCalledWith('Error: service is down');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(area.reveal.open).toHaveBeenCalled();
        expect(applyResult).not.toHaveBeenCalled();
    });

    it('shows a plugin that would not load the same way as a run that failed', async () => {
        const area = targetArea();

        const failure = new Error('plugin missing');
        const outcome = await runTranslation(
            request({
                load: async () => {
                    throw failure;
                },
            }),
            area
        );

        expect(outcome).toEqual({ status: 'load-failed', error: failure });
        expect(area.setError).toHaveBeenCalledWith('Error: plugin missing');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(area.reveal.open).toHaveBeenCalled();
    });

    it('leaves the Target Area alone when a newer run superseded this one mid-flight', async () => {
        const area = targetArea();
        const applyResult = vi.fn();
        const onResolved = vi.fn();
        let superseded = false;

        const outcome = await runTranslation(
            request({
                isSuperseded: () => superseded,
                applyResult,
                onResolved,
                load: async () => async (_text, _from, _to, options) => {
                    options.setResult('ho');
                    superseded = true;
                    options.setResult('hol');
                    return 'hola';
                },
            }),
            area
        );

        expect(outcome).toEqual({ status: 'superseded' });
        expect(area.setResult).toHaveBeenCalledTimes(1);
        expect(area.setResult).toHaveBeenCalledWith('ho');
        expect(applyResult).not.toHaveBeenCalled();
        expect(onResolved).not.toHaveBeenCalled();
        expect(area.reveal.settle).not.toHaveBeenCalled();
    });

    it('keeps a superseded failure out of the Target Area', async () => {
        const area = targetArea();

        const outcome = await runTranslation(
            request({
                isSuperseded: () => true,
                load: async () => (async () => Promise.reject(new Error('too late'))) as TranslateCall,
            }),
            area
        );

        expect(outcome).toEqual({ status: 'superseded' });
        expect(area.setError).not.toHaveBeenCalled();
    });

    it('keeps a superseded plugin load failure out of the Target Area', async () => {
        const area = targetArea();

        const outcome = await runTranslation(
            request({
                isSuperseded: () => true,
                load: async () => {
                    throw new Error('too late');
                },
            }),
            area
        );

        expect(outcome).toEqual({ status: 'superseded' });
        expect(area.setError).not.toHaveBeenCalled();
    });

    it('logs both outcomes before the supersession check, so a superseded run still leaves a trace', async () => {
        const area = targetArea();
        const resolved = vi.fn();
        const rejected = vi.fn();

        await runTranslation(request({ isSuperseded: () => true, log: { resolved, rejected } }), area);
        await runTranslation(
            request({
                isSuperseded: () => true,
                log: { resolved, rejected },
                load: async () => (async () => Promise.reject('boom')) as TranslateCall,
            }),
            area
        );

        expect(resolved).toHaveBeenCalledWith('hola');
        expect(rejected).toHaveBeenCalledWith('boom');
    });

    it('leaves the Target Area collapsed when a run settles with nothing to show', async () => {
        const area = targetArea();

        await runTranslation(request({ load: async () => (async () => '') as TranslateCall }), area);

        expect(area.reveal.settle).toHaveBeenCalledWith('');
        expect(area.reveal.open).not.toHaveBeenCalled();
    });
});
