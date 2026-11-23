import { NextUIProvider } from '@nextui-org/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ save: vi.fn(), initial: {} }));

vi.mock('../../../../../hooks', async () => {
    const { useState } = await import('react');
    return {
        useConfig: () => {
            const [value, setValue] = useState(config.initial);
            return [
                value,
                (next, save) => {
                    setValue(next);
                    if (save) config.save(next);
                },
            ];
        },
    };
});

import { PluginConfig } from './index';
import { buildPreviewCacheKey, sanitizeErrorMessage } from './tts_preview_utils';
import '../../../../../i18n';

const AI_TTS_PLUGIN_INFO = {
    id: 'plugin.com.pot-app.ai_tts',
    plugin_type: 'tts',
    display: 'AI TTS',
    homepage: 'https://github.com/zeta987/pot-app-tts-plugin-openai',
    needs: [
        {
            key: 'model',
            display: 'Model',
            type: 'select',
            options: {
                'gpt-realtime-2.1-mini': 'gpt-realtime-2.1-mini',
                'gpt-audio-1.5': 'gpt-audio-1.5',
                'gemini-3.8-flash-lite-tts': 'gemini-3.8-flash-lite-tts',
            },
        },
        { key: 'customModel', display: 'Custom Model', type: 'input' },
        { key: 'apiKey', display: 'API Key', type: 'input' },
        {
            key: 'voice',
            display: 'Voice',
            type: 'select',
            options: {
                auto: 'Auto',
                marin: 'OpenAI · marin',
                coral: 'OpenAI · coral',
                nova: 'OpenAI · nova',
                Kore: 'Gemini · Kore',
                Puck: 'Gemini · Puck',
            },
        },
        { key: 'customVoice', display: 'Custom Voice', type: 'input' },
        { key: 'instructions', display: 'Instructions', type: 'input' },
    ],
    tts_preview: {
        default_text: '哈囉！這是一段台灣正體中文的語音預覽。',
        default_lang: 'zh_tw',
        voice_key: 'voice',
        model_key: 'model',
        custom_model_key: 'customModel',
        custom_voice_key: 'customVoice',
        voice_groups: {
            openai_realtime: ['marin', 'coral'],
            openai_chat_audio: ['marin', 'coral', 'nova'],
            gemini: ['Kore', 'Puck'],
        },
        voice_descriptions: {
            marin: '自然推薦',
            coral: '明亮親切',
            nova: '活潑現代',
            Kore: '堅定',
            Puck: '活潑',
        },
    },
    language: {
        zh_tw: 'zh-TW',
        en: 'en',
    },
};

let audioSources = [];
let OriginalAudioContext;

beforeEach(() => {
    config.save.mockReset();
    config.initial = {};
    audioSources = [];
    OriginalAudioContext = window.AudioContext;

    class MockAudioContext {
        constructor() {
            this.state = 'running';
            this.destination = {};
        }

        async resume() {
            this.state = 'running';
        }

        async decodeAudioData(buffer) {
            return { byteLength: buffer.byteLength, duration: 1.5 };
        }

        createBufferSource() {
            const source = {
                buffer: null,
                onended: null,
                connect: vi.fn(),
                disconnect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            };
            audioSources.push(source);
            return source;
        }

        async close() {}
    }

    window.AudioContext = MockAudioContext;
});

afterEach(() => {
    window.AudioContext = OriginalAudioContext;
});

it('shows the plugin switch default for an existing instance and saves an explicit false', async () => {
    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin_ocr@first'
                name='plugin_ocr'
                pluginType='recognize'
                onClose={() => {}}
                pluginList={{
                    plugin_ocr: {
                        display: 'OCR',
                        needs: [{ key: 'stream', display: 'Stream output', type: 'switch', default: true }],
                    },
                }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    expect(screen.queryByRole('button', { name: /Preview Current/i })).not.toBeInTheDocument();
    const streaming = screen.getByRole('switch', { name: 'Stream output' });
    expect(streaming).toBeChecked();
    await userEvent.click(streaming);
    expect(streaming).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(config.save).toHaveBeenCalledExactlyOnceWith({ stream: false });
});

it('previews OpenAI and Gemini voices in Traditional Chinese, caches replays, and selects voices', async () => {
    config.initial = {
        apiKey: 'sk-test-key',
        customVoice: 'voice_old_custom',
        instructions: 'Taiwanese Mandarin accent',
    };
    const ttsFn = vi.fn(async () => [0x52, 0x49, 0x46, 0x46]);
    const invokePlugin = vi.fn(async () => [ttsFn, { http: {} }]);

    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin.com.pot-app.ai_tts@first'
                name='plugin.com.pot-app.ai_tts'
                pluginType='tts'
                invokePlugin={invokePlugin}
                onClose={() => {}}
                pluginList={{ 'plugin.com.pot-app.ai_tts': AI_TTS_PLUGIN_INFO }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    const previewInput = screen.getByRole('textbox', { name: 'Preview Text' });
    expect(previewInput).toHaveValue('哈囉！這是一段台灣正體中文的語音預覽。');

    // Default model gpt-realtime-2.1-mini exposes OpenAI Realtime voices (not nova / Kore)
    expect(screen.getByRole('button', { name: 'Preview marin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview coral' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview nova' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview Kore' })).not.toBeInTheDocument();

    // Preview coral using live unsaved config (clearing customVoice override for preset audition)
    await userEvent.click(screen.getByRole('button', { name: 'Preview coral' }));
    await waitFor(() => expect(audioSources.length).toBe(1));
    expect(ttsFn).toHaveBeenCalledTimes(1);
    expect(ttsFn).toHaveBeenCalledWith(
        '哈囉！這是一段台灣正體中文的語音預覽。',
        'zh-TW',
        expect.objectContaining({
            config: expect.objectContaining({
                apiKey: 'sk-test-key',
                model: 'gpt-realtime-2.1-mini',
                voice: 'coral',
                customVoice: '',
                instructions: 'Taiwanese Mandarin accent',
            }),
        })
    );
    expect(audioSources[0].start).toHaveBeenCalledTimes(1);

    // Finish playback, then replay coral: must use in-memory cache (no second API call)
    act(() => {
        audioSources[0].onended?.();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Preview coral' }));
    await waitFor(() => expect(audioSources.length).toBe(2));
    expect(ttsFn).toHaveBeenCalledTimes(1);

    // Switch model to gpt-audio-1.5 -> gallery expands to include Chat Audio voices (nova)
    await userEvent.click(screen.getByRole('button', { name: 'gpt-realtime-2.1-mini' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'gpt-audio-1.5' }));
    expect(await screen.findByRole('button', { name: 'Preview nova' })).toBeInTheDocument();

    // Switch model to Gemini -> gallery updates to Gemini voices
    await userEvent.click(screen.getByRole('button', { name: 'gpt-audio-1.5' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'gemini-3.8-flash-lite-tts' }));
    expect(await screen.findByRole('button', { name: 'Preview Kore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview Puck' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview marin' })).not.toBeInTheDocument();

    // Select Puck from the gallery and save
    await userEvent.click(screen.getByText('Puck'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(config.save).toHaveBeenCalledWith(
        expect.objectContaining({
            model: 'gemini-3.8-flash-lite-tts',
            voice: 'Puck',
            customVoice: '',
        })
    );
});

it('displays an inline error when TTS preview synthesis fails', async () => {
    const ttsFn = vi.fn(async () => {
        throw new Error('API Key is required.');
    });
    const invokePlugin = vi.fn(async () => [ttsFn, { http: {} }]);

    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin.com.pot-app.ai_tts@err'
                name='plugin.com.pot-app.ai_tts'
                pluginType='tts'
                invokePlugin={invokePlugin}
                onClose={() => {}}
                pluginList={{ 'plugin.com.pot-app.ai_tts': AI_TTS_PLUGIN_INFO }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Preview Current' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('API Key is required.');
});

const BATCH_TTS_PLUGIN_INFO = {
    ...AI_TTS_PLUGIN_INFO,
    needs: [
        ...AI_TTS_PLUGIN_INFO.needs.slice(0, 3),
        {
            key: 'voice',
            display: 'Voice',
            type: 'select',
            options: {
                auto: 'Auto',
                marin: 'OpenAI · marin',
                coral: 'OpenAI · coral',
                nova: 'OpenAI · nova',
                alloy: 'OpenAI · alloy',
                verse: 'OpenAI · verse',
                Kore: 'Gemini · Kore',
                Puck: 'Gemini · Puck',
            },
        },
        { key: 'customVoice', display: 'Custom Voice', type: 'input' },
        { key: 'speed', display: 'Speed', type: 'input' },
        { key: 'instructions', display: 'Instructions', type: 'input' },
    ],
    tts_preview: {
        ...AI_TTS_PLUGIN_INFO.tts_preview,
        voice_groups: {
            openai_realtime: ['marin', 'coral', 'nova', 'alloy', 'verse'],
            openai_chat_audio: ['marin', 'coral', 'nova', 'alloy', 'verse'],
            gemini: ['Kore', 'Puck'],
        },
        voice_descriptions: {
            marin: '自然推薦',
            coral: '明亮親切',
            nova: '活潑現代',
            alloy: '中性平衡',
            verse: '流暢自然',
            Kore: '堅定',
            Puck: '活潑',
        },
    },
};

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

it('batch pre-fetches all active voices with concurrency <= 2 without auto-playing and replays from cache with 0 extra calls', async () => {
    config.initial = {
        apiKey: 'sk-batch-test-key',
        speed: '1.1',
        instructions: 'Taiwanese Mandarin accent',
    };

    const deferredByVoice = new Map();
    const calledVoices = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const ttsFn = vi.fn(async (_text, _lang, { config: runConfig }) => {
        const voice = runConfig.voice;
        calledVoices.push(voice);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const deferred = createDeferred();
        deferredByVoice.set(voice, deferred);
        try {
            return await deferred.promise;
        } finally {
            inFlight -= 1;
        }
    });
    const invokePlugin = vi.fn(async () => [ttsFn, { http: {} }]);

    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin.com.pot-app.ai_tts@batch'
                name='plugin.com.pot-app.ai_tts'
                pluginType='tts'
                invokePlugin={invokePlugin}
                onClose={() => {}}
                pluginList={{ 'plugin.com.pot-app.ai_tts': BATCH_TTS_PLUGIN_INFO }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    expect(screen.getByText('Cached 0/5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));

    // Only 2 voices should be in flight at once
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral']));
    expect(maxInFlight).toBe(2);
    expect(screen.getByRole('button', { name: 'Stop Batch' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pre-fetching 0/5');

    // Resolve wave 1 -> wave 2 starts while staying <= 2 concurrent
    await act(async () => {
        deferredByVoice.get('marin').resolve([0x52, 0x49, 0x46, 0x46]);
    });
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral', 'nova']));
    expect(maxInFlight).toBe(2);
    expect(screen.getByRole('status')).toHaveTextContent('Pre-fetching 1/5');
    expect(screen.getByText('Cached 1/5')).toBeInTheDocument();

    // Single-voice playback of already-cached voice works DURING batch with 0 extra API calls
    await userEvent.click(screen.getByRole('button', { name: 'Preview marin' }));
    await waitFor(() => expect(audioSources.length).toBe(1));
    expect(audioSources[0].start).toHaveBeenCalledTimes(1);
    expect(calledVoices).toEqual(['marin', 'coral', 'nova']);
    act(() => {
        audioSources[0].onended?.();
    });

    // Resolve remaining voices
    await act(async () => {
        deferredByVoice.get('coral').resolve([0x52, 0x49, 0x46, 0x46]);
    });
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral', 'nova', 'alloy']));

    await act(async () => {
        deferredByVoice.get('nova').resolve([0x52, 0x49, 0x46, 0x46]);
    });
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral', 'nova', 'alloy', 'verse']));

    await act(async () => {
        deferredByVoice.get('alloy').resolve([0x52, 0x49, 0x46, 0x46]);
        deferredByVoice.get('verse').resolve([0x52, 0x49, 0x46, 0x46]);
    });

    await waitFor(() => expect(screen.getByText('Cached 5/5')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Batch Preview All' })).toBeInTheDocument();
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(invokePlugin).toHaveBeenCalledTimes(1);
    expect(ttsFn).toHaveBeenCalledTimes(5);
    // Only the manual single click on marin played audio; batch pre-fetch itself never auto-played
    expect(audioSources.length).toBe(1);

    // Clicking another prefetched voice afterwards plays immediately from cache with ZERO extra calls
    await userEvent.click(screen.getByRole('button', { name: 'Preview verse' }));
    await waitFor(() => expect(audioSources.length).toBe(2));
    expect(audioSources[1].start).toHaveBeenCalledTimes(1);
    expect(ttsFn).toHaveBeenCalledTimes(5);
    expect(invokePlugin).toHaveBeenCalledTimes(1);
});

it('skips already-cached voices when running batch pre-fetch again', async () => {
    const calledVoices = [];
    const ttsFn = vi.fn(async (_text, _lang, { config: runConfig }) => {
        calledVoices.push(runConfig.voice);
        return [0x52, 0x49, 0x46, 0x46];
    });
    const invokePlugin = vi.fn(async () => [ttsFn, { http: {} }]);

    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin.com.pot-app.ai_tts@skip'
                name='plugin.com.pot-app.ai_tts'
                pluginType='tts'
                invokePlugin={invokePlugin}
                onClose={() => {}}
                pluginList={{ 'plugin.com.pot-app.ai_tts': BATCH_TTS_PLUGIN_INFO }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    // First cache 'coral' via single-voice preview
    await userEvent.click(screen.getByRole('button', { name: 'Preview coral' }));
    await waitFor(() => expect(audioSources.length).toBe(1));
    act(() => {
        audioSources[0].onended?.();
    });
    expect(calledVoices).toEqual(['coral']);
    expect(screen.getByText('Cached 1/5')).toBeInTheDocument();

    // Run batch pre-fetch: 'coral' must be skipped
    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));
    await waitFor(() => expect(screen.getByText('Cached 5/5')).toBeInTheDocument());
    expect(calledVoices).toEqual(['coral', 'marin', 'nova', 'alloy', 'verse']);
    // Batch did not auto-play any voice
    expect(audioSources.length).toBe(1);

    // Running batch pre-fetch again when all voices are cached makes ZERO extra calls
    const callCountBeforeSecondBatch = ttsFn.mock.calls.length;
    const invokeCountBeforeSecondBatch = invokePlugin.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));
    expect(ttsFn).toHaveBeenCalledTimes(callCountBeforeSecondBatch);
    expect(invokePlugin).toHaveBeenCalledTimes(invokeCountBeforeSecondBatch);
});

it('cancels remaining queued voices cleanly when clicking Stop and ignores stale completions', async () => {
    const deferredByVoice = new Map();
    const calledVoices = [];
    const ttsFn = vi.fn(async (_text, _lang, { config: runConfig }) => {
        calledVoices.push(runConfig.voice);
        const deferred = createDeferred();
        deferredByVoice.set(runConfig.voice, deferred);
        return await deferred.promise;
    });
    const invokePlugin = vi.fn(async () => [ttsFn, { http: {} }]);

    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin.com.pot-app.ai_tts@stop'
                name='plugin.com.pot-app.ai_tts'
                pluginType='tts'
                invokePlugin={invokePlugin}
                onClose={() => {}}
                pluginList={{ 'plugin.com.pot-app.ai_tts': BATCH_TTS_PLUGIN_INFO }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral']));

    // Finish marin -> nova starts, alloy & verse remain queued
    await act(async () => {
        deferredByVoice.get('marin').resolve([0x52, 0x49, 0x46, 0x46]);
    });
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral', 'nova']));
    expect(screen.getByText('Cached 1/5')).toBeInTheDocument();

    // Stop the batch while coral and nova are still in flight
    await userEvent.click(screen.getByRole('button', { name: 'Stop Batch' }));
    expect(screen.getByRole('button', { name: 'Batch Preview All' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // Settling stale in-flight promises must NOT enqueue alloy/verse or mutate cache/state
    await act(async () => {
        deferredByVoice.get('coral').resolve([0x52, 0x49, 0x46, 0x46]);
        deferredByVoice.get('nova').reject(new Error('stale failure'));
    });

    expect(calledVoices).toEqual(['marin', 'coral', 'nova']);
    expect(screen.getByText('Cached 1/5')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(audioSources.length).toBe(0);
});

it('cancels an active batch cleanly when preview text changes or component unmounts', async () => {
    const deferredByVoice = new Map();
    const calledVoices = [];
    const ttsFn = vi.fn(async (_text, _lang, { config: runConfig }) => {
        calledVoices.push(runConfig.voice);
        const deferred = createDeferred();
        deferredByVoice.set(`${runConfig.voice}-${calledVoices.length}`, deferred);
        return await deferred.promise;
    });
    const invokePlugin = vi.fn(async () => [ttsFn, { http: {} }]);

    const { unmount } = render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin.com.pot-app.ai_tts@cancel-param'
                name='plugin.com.pot-app.ai_tts'
                pluginType='tts'
                invokePlugin={invokePlugin}
                onClose={() => {}}
                pluginList={{ 'plugin.com.pot-app.ai_tts': BATCH_TTS_PLUGIN_INFO }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral']));

    // Changing preview text must abort remaining queued items immediately
    const previewInput = screen.getByRole('textbox', { name: 'Preview Text' });
    await userEvent.type(previewInput, '！');
    expect(screen.getByRole('button', { name: 'Batch Preview All' })).toBeInTheDocument();

    await act(async () => {
        deferredByVoice.get('marin-1').resolve([0x52, 0x49, 0x46, 0x46]);
        deferredByVoice.get('coral-2').resolve([0x52, 0x49, 0x46, 0x46]);
    });
    expect(calledVoices).toEqual(['marin', 'coral']);

    // Start another batch and switch model mid-flight -> remaining items never run and gallery switches
    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral', 'marin', 'coral']));

    await userEvent.click(screen.getByRole('button', { name: 'gpt-realtime-2.1-mini' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'gemini-3.8-flash-lite-tts' }));
    expect(await screen.findByRole('button', { name: 'Preview Kore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Batch Preview All' })).toBeInTheDocument();

    await act(async () => {
        deferredByVoice.get('marin-3').resolve([0x52, 0x49, 0x46, 0x46]);
        deferredByVoice.get('coral-4').resolve([0x52, 0x49, 0x46, 0x46]);
    });
    expect(calledVoices).toEqual(['marin', 'coral', 'marin', 'coral']);

    // Start Gemini batch and unmount mid-flight -> clean teardown with no further calls
    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));
    await waitFor(() => expect(calledVoices).toEqual(['marin', 'coral', 'marin', 'coral', 'Kore', 'Puck']));

    unmount();

    await act(async () => {
        deferredByVoice.get('Kore-5').resolve([0x52, 0x49, 0x46, 0x46]);
        deferredByVoice.get('Puck-6').resolve([0x52, 0x49, 0x46, 0x46]);
    });
    expect(calledVoices).toEqual(['marin', 'coral', 'marin', 'coral', 'Kore', 'Puck']);
});

it('continues batch on partial failures, shows concise sanitized summary without leaking apiKey', async () => {
    const secretKey = 'sk-fake-supersecret999';
    config.initial = {
        apiKey: secretKey,
    };

    const calledVoices = [];
    const ttsFn = vi.fn(async (_text, _lang, { config: runConfig }) => {
        calledVoices.push(runConfig.voice);
        if (runConfig.voice === 'coral') {
            throw new Error(`429 Rate limit for key ${secretKey}`);
        }
        return [0x52, 0x49, 0x46, 0x46];
    });
    const invokePlugin = vi.fn(async () => [ttsFn, { http: {} }]);

    render(
        <NextUIProvider>
            <PluginConfig
                instanceKey='plugin.com.pot-app.ai_tts@partial'
                name='plugin.com.pot-app.ai_tts'
                pluginType='tts'
                invokePlugin={invokePlugin}
                onClose={() => {}}
                pluginList={{ 'plugin.com.pot-app.ai_tts': BATCH_TTS_PLUGIN_INFO }}
                updateServiceList={() => {}}
            />
        </NextUIProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Batch Preview All' }));

    const alert = await screen.findByRole('alert');
    expect(calledVoices).toEqual(['marin', 'coral', 'nova', 'alloy', 'verse']);
    expect(screen.getByText('Cached 4/5')).toBeInTheDocument();
    expect(alert).toHaveTextContent('Completed 4/5, 1 failed: coral (429 Rate limit for key [REDACTED])');
    expect(alert).not.toHaveTextContent(secretKey);
    expect(screen.getByTestId('tts-plugin-preview').innerHTML).not.toContain(secretKey);
    expect(screen.getByLabelText('Failed: 429 Rate limit for key [REDACTED]')).toBeInTheDocument();
    expect(audioSources.length).toBe(0);

    // Succeeded voice still plays instantaneously from cache with 0 additional calls
    await userEvent.click(screen.getByRole('button', { name: 'Preview alloy' }));
    await waitFor(() => expect(audioSources.length).toBe(1));
    expect(ttsFn).toHaveBeenCalledTimes(5);
});

it('strips secrets from preview cache keys and error messages', () => {
    const cacheKey = buildPreviewCacheKey({
        pluginName: 'plugin.com.pot-app.ai_tts',
        lang: 'zh-TW',
        text: '你好',
        config: {
            apiKey: 'sk-fake-secretvalue123',
            token: 'tok-secret-456',
            model: 'gpt-realtime-2.1-mini',
            voice: 'marin',
            instanceName: 'My OpenAI',
        },
    });
    expect(cacheKey).not.toContain('sk-fake-secretvalue123');
    expect(cacheKey).not.toContain('tok-secret-456');
    expect(cacheKey).not.toContain('My OpenAI');

    const sanitized = sanitizeErrorMessage(
        new Error(
            'HTTP 401 Bearer secret-jwt-token https://example.com?key=demo-query-secret AQ.FakeTestToken1234567890 my-secret-key'
        ),
        { apiKey: 'my-secret-key' }
    );
    expect(sanitized).not.toContain('secret-jwt-token');
    expect(sanitized).not.toContain('demo-query-secret');
    expect(sanitized).not.toContain('AQ.FakeTestToken1234567890');
    expect(sanitized).not.toContain('my-secret-key');
    expect(sanitized).toContain('Bearer [REDACTED]');
    expect(sanitized).toContain('?key=[REDACTED]');
});
