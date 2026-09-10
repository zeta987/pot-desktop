import { describe, expect, it, vi } from 'vitest';

import { LANGUAGE_NOT_SUPPORTED, runRecognition } from './recognition_run';
import type { RecognitionRunRequest, RecognizeCall } from './recognition_run';

const targetArea = () => ({
    setIsLoading: vi.fn(),
    setText: vi.fn(),
    setError: vi.fn(),
});

const request = (overrides: Partial<RecognitionRunRequest> = {}): RecognitionRunRequest => ({
    isLanguageSupported: true,
    load: () => (() => 'recognized') as RecognizeCall,
    base64: 'image-base64',
    language: 'eng',
    config: { apiKey: 'key' },
    ...overrides,
});

const deferred = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

describe('runRecognition', () => {
    it('leaves an unmounted Target Area untouched before loading a Service Instance', async () => {
        const area = targetArea();
        const load = vi.fn();

        const outcome = await runRecognition(request({ load, isSuperseded: () => true }), area);

        expect(outcome).toEqual({ status: 'superseded' });
        expect(load).not.toHaveBeenCalled();
        expect(area.setText).not.toHaveBeenCalled();
        expect(area.setError).not.toHaveBeenCalled();
        expect(area.setIsLoading).not.toHaveBeenCalled();
    });

    it('clears prior content and turns down an unsupported language without loading', async () => {
        const area = targetArea();
        const load = vi.fn();

        const outcome = await runRecognition(request({ isLanguageSupported: false, load }), area);

        expect(outcome).toEqual({ status: 'unsupported' });
        expect(area.setText).toHaveBeenNthCalledWith(1, '');
        expect(area.setError).toHaveBeenNthCalledWith(1, '');
        expect(area.setError).toHaveBeenNthCalledWith(2, LANGUAGE_NOT_SUPPORTED);
        expect(area.setIsLoading).toHaveBeenCalledOnce();
        expect(area.setIsLoading).toHaveBeenCalledWith(false);
        expect(load).not.toHaveBeenCalled();
    });

    it('forwards the image, mapped language, and config before landing cleaned text', async () => {
        const area = targetArea();
        const calls: Array<{ base64: string; language: unknown; options: { config: unknown } }> = [];
        const recognize: RecognizeCall = (base64, language, options) => {
            calls.push({ base64, language, options });
            return '  hyphen-\nated\n\n text  ';
        };
        const onResolved = vi.fn();

        const outcome = await runRecognition(
            request({
                load: () => recognize,
                base64: 'actual-image',
                language: { provider: 'mapped-language' },
                config: { token: 'secret' },
                deleteNewline: true,
                onResolved,
            }),
            area
        );

        expect(calls).toEqual([
            {
                base64: 'actual-image',
                language: { provider: 'mapped-language' },
                options: { config: { token: 'secret' } },
            },
        ]);
        expect(outcome).toEqual({ status: 'resolved', result: 'hyphenated text' });
        expect(area.setIsLoading).toHaveBeenNthCalledWith(1, true);
        expect(area.setText).toHaveBeenLastCalledWith('hyphenated text');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(onResolved).toHaveBeenCalledOnce();
        expect(onResolved).toHaveBeenCalledWith('hyphenated text');
    });

    it('trims text without collapsing internal whitespace when newline deletion is disabled', async () => {
        const area = targetArea();

        const outcome = await runRecognition(
            request({ load: () => (() => '  first\n\nsecond  ') as RecognizeCall, deleteNewline: false }),
            area
        );

        expect(outcome).toEqual({ status: 'resolved', result: 'first\n\nsecond' });
        expect(area.setText).toHaveBeenLastCalledWith('first\n\nsecond');
    });

    it('treats an empty string as a successful recognition result', async () => {
        const area = targetArea();
        const onResolved = vi.fn();

        const outcome = await runRecognition(request({ load: () => (() => '   ') as RecognizeCall, onResolved }), area);

        expect(outcome).toEqual({ status: 'resolved', result: '' });
        expect(area.setText).toHaveBeenLastCalledWith('');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(onResolved).toHaveBeenCalledWith('');
        expect(area.setError).toHaveBeenCalledTimes(1);
        expect(area.setError).toHaveBeenCalledWith('');
    });

    it.each([
        [
            'synchronous throw',
            () => {
                throw new Error('plugin missing');
            },
        ],
        ['rejected promise', () => Promise.reject(new Error('plugin missing'))],
    ])('isolates a %s while loading the Service Instance', async (_label, load) => {
        const area = targetArea();

        const outcome = await runRecognition(request({ load }), area);

        expect(outcome).toMatchObject({ status: 'load-failed', error: expect.any(Error) });
        expect(area.setError).toHaveBeenLastCalledWith('Error: plugin missing');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(area.setText).toHaveBeenCalledTimes(1);
        expect(area.setText).toHaveBeenCalledWith('');
    });

    it.each([
        [
            'synchronous throw',
            () => {
                throw new Error('service unavailable');
            },
        ],
        ['rejected promise', () => Promise.reject(new Error('service unavailable'))],
    ])('isolates a provider %s from successful result handling', async (_label, recognize) => {
        const area = targetArea();
        const onResolved = vi.fn();

        const outcome = await runRecognition(request({ load: () => recognize as RecognizeCall, onResolved }), area);

        expect(outcome).toMatchObject({ status: 'rejected', error: expect.any(Error) });
        expect(area.setError).toHaveBeenLastCalledWith('Error: service unavailable');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(area.setText).toHaveBeenCalledTimes(1);
        expect(onResolved).not.toHaveBeenCalled();
    });

    it('rejects a non-string provider result instead of writing it into the Target Area', async () => {
        const area = targetArea();
        const onResolved = vi.fn();

        const outcome = await runRecognition(
            request({ load: () => (() => ({ text: 'recognized' })) as RecognizeCall, onResolved }),
            area
        );

        expect(outcome).toMatchObject({ status: 'rejected', error: expect.any(TypeError) });
        expect(area.setError).toHaveBeenLastCalledWith('TypeError: Recognition result must be a string');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(area.setText).toHaveBeenCalledTimes(1);
        expect(onResolved).not.toHaveBeenCalled();
    });

    it.each([null, undefined])(
        'stringifies a %s provider rejection without throwing a second error',
        async (failure) => {
            const area = targetArea();

            const outcome = await runRecognition(
                request({ load: () => (() => Promise.reject(failure)) as RecognizeCall }),
                area
            );

            expect(outcome).toEqual({ status: 'rejected', error: failure });
            expect(area.setError).toHaveBeenLastCalledWith(String(failure));
            expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        }
    );

    it('does not invoke a provider after its load resolves into a superseded run', async () => {
        const area = targetArea();
        const loaded = deferred<RecognizeCall>();
        const recognize = vi.fn(() => 'too late');
        const onResolved = vi.fn();
        let superseded = false;

        const outcomePromise = runRecognition(
            request({ load: () => loaded.promise, isSuperseded: () => superseded, onResolved }),
            area
        );
        superseded = true;
        loaded.resolve(recognize);

        expect(await outcomePromise).toEqual({ status: 'superseded' });
        expect(recognize).not.toHaveBeenCalled();
        expect(area.setText).toHaveBeenCalledTimes(1);
        expect(area.setError).toHaveBeenCalledTimes(1);
        expect(area.setIsLoading).toHaveBeenCalledTimes(1);
        expect(area.setIsLoading).toHaveBeenCalledWith(true);
        expect(onResolved).not.toHaveBeenCalled();
    });

    it('keeps a superseded load rejection out of the Target Area and resolved callback', async () => {
        const area = targetArea();
        const loaded = deferred<RecognizeCall>();
        const onResolved = vi.fn();
        let superseded = false;

        const outcomePromise = runRecognition(
            request({ load: () => loaded.promise, isSuperseded: () => superseded, onResolved }),
            area
        );
        superseded = true;
        loaded.reject(new Error('late load'));

        expect(await outcomePromise).toEqual({ status: 'superseded' });
        expect(area.setError).toHaveBeenCalledTimes(1);
        expect(area.setError).toHaveBeenCalledWith('');
        expect(area.setIsLoading).toHaveBeenCalledTimes(1);
        expect(onResolved).not.toHaveBeenCalled();
    });

    it('keeps a superseded provider success out of the Target Area and resolved callback', async () => {
        const area = targetArea();
        const recognized = deferred<unknown>();
        const onResolved = vi.fn();
        let superseded = false;

        const outcomePromise = runRecognition(
            request({
                load: () => (() => recognized.promise) as RecognizeCall,
                isSuperseded: () => superseded,
                onResolved,
            }),
            area
        );
        await Promise.resolve();
        superseded = true;
        recognized.resolve('late result');

        expect(await outcomePromise).toEqual({ status: 'superseded' });
        expect(area.setText).toHaveBeenCalledTimes(1);
        expect(area.setText).toHaveBeenCalledWith('');
        expect(area.setError).toHaveBeenCalledTimes(1);
        expect(area.setIsLoading).toHaveBeenCalledTimes(1);
        expect(onResolved).not.toHaveBeenCalled();
    });

    it('keeps a superseded provider failure out of the Target Area and resolved callback', async () => {
        const area = targetArea();
        const recognized = deferred<unknown>();
        const onResolved = vi.fn();
        let superseded = false;

        const outcomePromise = runRecognition(
            request({
                load: () => (() => recognized.promise) as RecognizeCall,
                isSuperseded: () => superseded,
                onResolved,
            }),
            area
        );
        await Promise.resolve();
        superseded = true;
        recognized.reject(new Error('late failure'));

        expect(await outcomePromise).toEqual({ status: 'superseded' });
        expect(area.setText).toHaveBeenCalledTimes(1);
        expect(area.setError).toHaveBeenCalledTimes(1);
        expect(area.setError).toHaveBeenCalledWith('');
        expect(area.setIsLoading).toHaveBeenCalledTimes(1);
        expect(onResolved).not.toHaveBeenCalled();
    });

    it('lets two parallel callers govern their own lifetime without a shared request id', async () => {
        const firstArea = targetArea();
        const secondArea = targetArea();
        const firstResult = deferred<unknown>();
        const secondResult = deferred<unknown>();
        const firstResolved = vi.fn();
        const secondResolved = vi.fn();

        const firstRun = runRecognition(
            request({ load: () => (() => firstResult.promise) as RecognizeCall, onResolved: firstResolved }),
            firstArea
        );
        const secondRun = runRecognition(
            request({ load: () => (() => secondResult.promise) as RecognizeCall, onResolved: secondResolved }),
            secondArea
        );
        await Promise.resolve();

        secondResult.resolve('second');
        expect(await secondRun).toEqual({ status: 'resolved', result: 'second' });
        firstResult.resolve('first');
        expect(await firstRun).toEqual({ status: 'resolved', result: 'first' });

        expect(firstArea.setText).toHaveBeenLastCalledWith('first');
        expect(firstArea.setText).not.toHaveBeenCalledWith('second');
        expect(secondArea.setText).toHaveBeenLastCalledWith('second');
        expect(secondArea.setText).not.toHaveBeenCalledWith('first');
        expect(firstResolved).toHaveBeenCalledWith('first');
        expect(secondResolved).toHaveBeenCalledWith('second');
    });

    it('isolates a failed parallel run from a successful run owned by another caller', async () => {
        const failedArea = targetArea();
        const successfulArea = targetArea();
        const failedResult = deferred<unknown>();
        const successfulResult = deferred<unknown>();
        const failedResolved = vi.fn();
        const successfulResolved = vi.fn();

        const failedRun = runRecognition(
            request({ load: () => (() => failedResult.promise) as RecognizeCall, onResolved: failedResolved }),
            failedArea
        );
        const successfulRun = runRecognition(
            request({
                load: () => (() => successfulResult.promise) as RecognizeCall,
                onResolved: successfulResolved,
            }),
            successfulArea
        );
        await Promise.resolve();

        successfulResult.resolve('current result');
        expect(await successfulRun).toEqual({ status: 'resolved', result: 'current result' });
        failedResult.reject(new Error('isolated failure'));
        expect(await failedRun).toMatchObject({ status: 'rejected', error: expect.any(Error) });

        expect(successfulArea.setText).toHaveBeenLastCalledWith('current result');
        expect(successfulArea.setError).toHaveBeenCalledTimes(1);
        expect(successfulResolved).toHaveBeenCalledWith('current result');
        expect(failedArea.setText).toHaveBeenCalledTimes(1);
        expect(failedArea.setError).toHaveBeenLastCalledWith('Error: isolated failure');
        expect(failedResolved).not.toHaveBeenCalled();
    });

    it('checks caller ownership directly before invoking the resolved callback', async () => {
        const area = targetArea();
        const onResolved = vi.fn();
        let superseded = false;
        area.setIsLoading.mockImplementation((loading) => {
            if (!loading) {
                superseded = true;
            }
        });

        const outcome = await runRecognition(
            request({
                isSuperseded: () => superseded,
                onResolved,
            }),
            area
        );

        expect(outcome).toEqual({ status: 'superseded' });
        expect(area.setText).toHaveBeenLastCalledWith('recognized');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(onResolved).not.toHaveBeenCalled();
    });

    it('does not reinterpret a synchronous UI callback error as a provider rejection', async () => {
        const area = targetArea();
        const callbackFailure = new Error('clipboard unavailable');

        await expect(
            runRecognition(
                request({
                    onResolved: () => {
                        throw callbackFailure;
                    },
                }),
                area
            )
        ).rejects.toBe(callbackFailure);
        expect(area.setText).toHaveBeenLastCalledWith('recognized');
        expect(area.setIsLoading).toHaveBeenLastCalledWith(false);
        expect(area.setError).toHaveBeenCalledTimes(1);
        expect(area.setError).toHaveBeenCalledWith('');
    });

    it('leaves asynchronous effects started by the resolved callback under caller ownership', async () => {
        const area = targetArea();
        const callbackFinished = deferred<void>();
        const onResolved = vi.fn(() => callbackFinished.promise);

        const outcome = await runRecognition(request({ onResolved }), area);

        expect(outcome).toEqual({ status: 'resolved', result: 'recognized' });
        expect(onResolved).toHaveBeenCalledWith('recognized');
        callbackFinished.resolve();
        await callbackFinished.promise;
    });
});
