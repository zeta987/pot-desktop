import { Button, Chip, Input } from '@nextui-org/react';
import { MdErrorOutline, MdPlayArrow, MdPlaylistPlay, MdRefresh, MdStop, MdVolumeUp } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { invoke_plugin } from '../../../../../utils/invoke_plugin';
import {
    BATCH_PREVIEW_CONCURRENCY,
    DEFAULT_TTS_PREVIEW_TEXT,
    buildBatchScopeKey,
    buildEffectivePluginConfig,
    buildPreviewCacheKey,
    buildVoiceRunConfig,
    formatBatchFailureDetails,
    haveSecretConfigValuesChanged,
    resolvePreviewLanguage,
    resolveVoicePreviewCatalog,
    runWithConcurrency,
    sanitizeErrorMessage,
} from './tts_preview_utils';

const CURRENT_CONFIG_SLOT = '__current__';

export function TtsPluginPreview(props) {
    const { pluginName, pluginInfo, pluginConfig, onSelectVoice, invokePlugin = invoke_plugin } = props;
    const { t } = useTranslation();

    const defaultPreviewText = pluginInfo?.tts_preview?.default_text || DEFAULT_TTS_PREVIEW_TEXT;
    const [previewText, setPreviewText] = useState(defaultPreviewText);
    const [voiceFilter, setVoiceFilter] = useState('');
    const [showGallery, setShowGallery] = useState(true);
    const [loadingKey, setLoadingKey] = useState(null);
    const [playingKey, setPlayingKey] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [cachedVersion, setCachedVersion] = useState(0);
    const [isBatchRunning, setIsBatchRunning] = useState(false);
    const [batchProgress, setBatchProgress] = useState(null);
    const [batchLoadingVoices, setBatchLoadingVoices] = useState(() => new Set());
    const [batchVoiceErrors, setBatchVoiceErrors] = useState({});
    const [batchSummary, setBatchSummary] = useState('');

    const cacheRef = useRef(new Map());
    const audioContextRef = useRef(null);
    const activeSourceRef = useRef(null);
    const requestSeqRef = useRef(0);
    const batchTokenRef = useRef(0);
    const prevBatchScopeRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        setPreviewText(defaultPreviewText);
    }, [defaultPreviewText, pluginName]);

    const effectiveConfig = useMemo(
        () => buildEffectivePluginConfig(pluginInfo, pluginConfig),
        [pluginInfo, pluginConfig]
    );

    const catalog = useMemo(
        () => resolveVoicePreviewCatalog(pluginInfo, effectiveConfig),
        [pluginInfo, effectiveConfig]
    );

    const filteredVoices = useMemo(() => {
        const query = voiceFilter.trim().toLowerCase();
        if (!query) {
            return catalog.voices;
        }
        return catalog.voices.filter(
            (item) =>
                item.key.toLowerCase().includes(query) ||
                item.description.toLowerCase().includes(query) ||
                item.optionLabel.toLowerCase().includes(query)
        );
    }, [catalog.voices, voiceFilter]);

    const stopPlayback = useCallback(() => {
        requestSeqRef.current += 1;
        if (activeSourceRef.current) {
            try {
                activeSourceRef.current.onended = null;
                activeSourceRef.current.stop();
                activeSourceRef.current.disconnect();
            } catch {
                // Ignore already-stopped source errors.
            }
            activeSourceRef.current = null;
        }
        if (mountedRef.current) {
            setPlayingKey(null);
            setLoadingKey(null);
        }
    }, []);

    const cancelBatch = useCallback(() => {
        batchTokenRef.current += 1;
        if (mountedRef.current) {
            setIsBatchRunning((prev) => (prev ? false : prev));
            setBatchProgress((prev) => (prev !== null ? null : prev));
            setBatchLoadingVoices((prev) => (prev.size > 0 ? new Set() : prev));
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            batchTokenRef.current += 1;
            stopPlayback();
            if (audioContextRef.current && typeof audioContextRef.current.close === 'function') {
                audioContextRef.current.close().catch(() => {});
                audioContextRef.current = null;
            }
        };
    }, [stopPlayback]);

    const getAudioContext = useCallback(() => {
        if (!audioContextRef.current) {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) {
                throw new Error(
                    t('services.tts_preview.audio_unsupported', {
                        defaultValue: 'Web Audio playback is unavailable in this environment.',
                    })
                );
            }
            audioContextRef.current = new Ctor();
        }
        return audioContextRef.current;
    }, [t]);

    const playAudioBytes = useCallback(
        async (audioBytes, slotKey, requestId) => {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
                await ctx.resume();
            }
            const rawCopy = new Uint8Array(audioBytes).buffer.slice(0);
            const buffer = await ctx.decodeAudioData(rawCopy);
            if (!mountedRef.current || requestSeqRef.current !== requestId) {
                return;
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            activeSourceRef.current = source;
            setLoadingKey(null);
            setPlayingKey(slotKey);
            source.onended = () => {
                if (activeSourceRef.current === source) {
                    activeSourceRef.current = null;
                    if (mountedRef.current) {
                        setPlayingKey(null);
                    }
                }
                try {
                    source.disconnect();
                } catch {
                    // Ignore disconnect errors on teardown.
                }
            };
            source.start(0);
        },
        [getAudioContext]
    );

    const hasCustomVoiceKey = Boolean(pluginInfo?.tts_preview?.custom_voice_key);

    const buildRunConfig = useCallback(
        (voiceOverride) =>
            buildVoiceRunConfig(effectiveConfig, voiceOverride, {
                voiceKey: catalog.voiceKey,
                customVoiceKey: catalog.customVoiceKey,
                hasCustomVoiceKey,
            }),
        [effectiveConfig, catalog.voiceKey, catalog.customVoiceKey, hasCustomVoiceKey]
    );

    const previewLang = useMemo(() => resolvePreviewLanguage(pluginInfo), [pluginInfo]);

    const voiceKeys = useMemo(() => catalog.voices.map((item) => item.key), [catalog.voices]);

    const batchScopeKey = useMemo(
        () =>
            buildBatchScopeKey({
                pluginName,
                lang: previewLang,
                text: previewText,
                config: effectiveConfig,
                voiceKey: catalog.voiceKey,
                customVoiceKey: catalog.customVoiceKey,
                voiceKeys,
            }),
        [pluginName, previewLang, previewText, effectiveConfig, catalog.voiceKey, catalog.customVoiceKey, voiceKeys]
    );

    useEffect(() => {
        if (!prevBatchScopeRef.current) {
            prevBatchScopeRef.current = {
                scopeKey: batchScopeKey,
                config: effectiveConfig,
            };
            return;
        }
        const scopeChanged =
            prevBatchScopeRef.current.scopeKey !== batchScopeKey ||
            haveSecretConfigValuesChanged(prevBatchScopeRef.current.config, effectiveConfig);
        prevBatchScopeRef.current = {
            scopeKey: batchScopeKey,
            config: effectiveConfig,
        };
        if (scopeChanged) {
            cancelBatch();
            setBatchVoiceErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev));
            setBatchSummary((prev) => (prev ? '' : prev));
        }
    }, [batchScopeKey, effectiveConfig, cancelBatch]);

    const isVoiceCached = useCallback(
        (voiceKey) => {
            const cacheKey = buildPreviewCacheKey({
                pluginName,
                lang: previewLang,
                text: previewText,
                config: buildRunConfig(voiceKey),
            });
            return cacheRef.current.has(cacheKey);
        },
        // cachedVersion triggers re-evaluation when cache updates
        [pluginName, previewLang, previewText, buildRunConfig, cachedVersion]
    );

    const cachedCount = useMemo(() => {
        let count = 0;
        for (const voice of catalog.voices) {
            if (isVoiceCached(voice.key)) {
                count += 1;
            }
        }
        return count;
    }, [catalog.voices, isVoiceCached]);

    const handlePreview = useCallback(
        async (voiceOverride = null) => {
            const slotKey = voiceOverride || CURRENT_CONFIG_SLOT;
            if (playingKey === slotKey || loadingKey === slotKey) {
                stopPlayback();
                return;
            }

            const text = previewText.trim();
            if (!text) {
                setErrorMessage(
                    t('services.tts_preview.empty_text', {
                        defaultValue: 'Please enter preview text first.',
                    })
                );
                return;
            }

            stopPlayback();
            const requestId = requestSeqRef.current;
            setErrorMessage('');
            setLoadingKey(slotKey);

            try {
                const runConfig = buildRunConfig(voiceOverride);
                const cacheKey = buildPreviewCacheKey({
                    pluginName,
                    lang: previewLang,
                    text,
                    config: runConfig,
                });

                let audioBytes = cacheRef.current.get(cacheKey);
                if (!audioBytes) {
                    const [ttsFn, utils] = await invokePlugin('tts', pluginName);
                    if (!mountedRef.current || requestSeqRef.current !== requestId) {
                        return;
                    }
                    audioBytes = await ttsFn(text, previewLang, {
                        config: runConfig,
                        utils,
                    });
                    if (!mountedRef.current || requestSeqRef.current !== requestId) {
                        return;
                    }
                    if (!audioBytes || audioBytes.length === 0) {
                        throw new Error(
                            t('services.tts_preview.empty_audio', {
                                defaultValue: 'TTS plugin returned empty audio.',
                            })
                        );
                    }
                    cacheRef.current.set(cacheKey, audioBytes);
                    setCachedVersion((v) => v + 1);
                }

                if (voiceOverride) {
                    setBatchVoiceErrors((prev) => {
                        if (!Object.prototype.hasOwnProperty.call(prev, voiceOverride)) {
                            return prev;
                        }
                        const next = { ...prev };
                        delete next[voiceOverride];
                        return next;
                    });
                }

                await playAudioBytes(audioBytes, slotKey, requestId);
            } catch (err) {
                if (!mountedRef.current || requestSeqRef.current !== requestId) {
                    return;
                }
                setLoadingKey(null);
                setPlayingKey(null);
                setErrorMessage(sanitizeErrorMessage(err, effectiveConfig));
            }
        },
        [
            playingKey,
            loadingKey,
            stopPlayback,
            previewText,
            t,
            buildRunConfig,
            pluginName,
            previewLang,
            invokePlugin,
            playAudioBytes,
            effectiveConfig,
        ]
    );

    const handleBatchPreview = useCallback(async () => {
        if (catalog.voices.length === 0) {
            return;
        }

        const text = previewText.trim();
        if (!text) {
            setErrorMessage(
                t('services.tts_preview.empty_text', {
                    defaultValue: 'Please enter preview text first.',
                })
            );
            return;
        }

        const configSnapshot = effectiveConfig;
        const pluginNameSnapshot = pluginName;
        const langSnapshot = previewLang;
        const voiceKeySnapshot = catalog.voiceKey;
        const customVoiceKeySnapshot = catalog.customVoiceKey;
        const hasCustomVoiceKeySnapshot = hasCustomVoiceKey;
        const voicesSnapshot = catalog.voices.map((item) => item.key);
        const total = voicesSnapshot.length;

        const queue = [];
        let alreadyCachedCount = 0;
        for (const voiceKey of voicesSnapshot) {
            const runConfig = buildVoiceRunConfig(configSnapshot, voiceKey, {
                voiceKey: voiceKeySnapshot,
                customVoiceKey: customVoiceKeySnapshot,
                hasCustomVoiceKey: hasCustomVoiceKeySnapshot,
            });
            const cacheKey = buildPreviewCacheKey({
                pluginName: pluginNameSnapshot,
                lang: langSnapshot,
                text,
                config: runConfig,
            });
            if (cacheRef.current.has(cacheKey)) {
                alreadyCachedCount += 1;
            } else {
                queue.push({ voiceKey, runConfig, cacheKey });
            }
        }

        setErrorMessage('');
        setBatchSummary('');
        setBatchVoiceErrors({});

        if (queue.length === 0) {
            return;
        }

        const token = batchTokenRef.current + 1;
        batchTokenRef.current = token;
        const isCancelled = () => !mountedRef.current || batchTokenRef.current !== token;

        setIsBatchRunning(true);
        setBatchLoadingVoices(new Set());
        setBatchProgress({ done: alreadyCachedCount, total });

        let processedCount = alreadyCachedCount;
        let succeededCount = alreadyCachedCount;
        const failures = [];

        try {
            const [ttsFn, utils] = await invokePlugin('tts', pluginNameSnapshot);
            if (isCancelled()) {
                return;
            }

            await runWithConcurrency(
                queue,
                BATCH_PREVIEW_CONCURRENCY,
                async (item) => {
                    if (isCancelled()) {
                        return;
                    }
                    if (cacheRef.current.has(item.cacheKey)) {
                        succeededCount += 1;
                        processedCount += 1;
                        setBatchProgress({ done: processedCount, total });
                        return;
                    }

                    setBatchLoadingVoices((prev) => {
                        const next = new Set(prev);
                        next.add(item.voiceKey);
                        return next;
                    });

                    try {
                        const audioBytes = await ttsFn(text, langSnapshot, {
                            config: item.runConfig,
                            utils,
                        });
                        if (isCancelled()) {
                            return;
                        }
                        if (!audioBytes || audioBytes.length === 0) {
                            throw new Error(
                                t('services.tts_preview.empty_audio', {
                                    defaultValue: 'TTS plugin returned empty audio.',
                                })
                            );
                        }
                        cacheRef.current.set(item.cacheKey, audioBytes);
                        setCachedVersion((v) => v + 1);
                        succeededCount += 1;
                        processedCount += 1;
                        setBatchProgress({ done: processedCount, total });
                    } catch (err) {
                        if (isCancelled()) {
                            return;
                        }
                        const sanitized = sanitizeErrorMessage(err, configSnapshot);
                        failures.push({ voice: item.voiceKey, message: sanitized });
                        setBatchVoiceErrors((prev) => ({
                            ...prev,
                            [item.voiceKey]: sanitized,
                        }));
                        processedCount += 1;
                        setBatchProgress({ done: processedCount, total });
                    } finally {
                        if (!isCancelled()) {
                            setBatchLoadingVoices((prev) => {
                                if (!prev.has(item.voiceKey)) {
                                    return prev;
                                }
                                const next = new Set(prev);
                                next.delete(item.voiceKey);
                                return next;
                            });
                        }
                    }
                },
                isCancelled
            );

            if (isCancelled()) {
                return;
            }

            setIsBatchRunning(false);
            setBatchLoadingVoices(new Set());
            setBatchProgress(null);

            if (failures.length > 0) {
                const details = formatBatchFailureDetails(failures);
                setBatchSummary(
                    t('services.tts_preview.batch_partial_failure', {
                        succeeded: succeededCount,
                        total,
                        failed: failures.length,
                        details,
                        defaultValue: '已完成 {{succeeded}}/{{total}}，失敗 {{failed}} 個：{{details}}',
                    })
                );
            }
        } catch (err) {
            if (isCancelled()) {
                return;
            }
            setIsBatchRunning(false);
            setBatchLoadingVoices(new Set());
            setBatchProgress(null);
            setErrorMessage(sanitizeErrorMessage(err, configSnapshot));
        }
    }, [catalog, previewText, t, effectiveConfig, pluginName, previewLang, hasCustomVoiceKey, invokePlugin]);

    const activeGroupBadge = useMemo(() => {
        if (catalog.activeGroup === 'gemini') {
            return `Gemini · ${catalog.voices.length}`;
        }
        if (catalog.activeGroup === 'openai_chat_audio') {
            return `OpenAI Audio · ${catalog.voices.length}`;
        }
        if (catalog.activeGroup === 'openai_realtime') {
            return `OpenAI Realtime · ${catalog.voices.length}`;
        }
        return catalog.voices.length > 0 ? `${catalog.voices.length}` : null;
    }, [catalog.activeGroup, catalog.voices.length]);

    const batchPercent =
        isBatchRunning && batchProgress && batchProgress.total > 0
            ? Math.min(100, Math.round((batchProgress.done / batchProgress.total) * 100))
            : 0;

    return (
        <div
            data-testid='tts-plugin-preview'
            className='rounded-medium border border-default-200 bg-content2/50 p-3 space-y-3 my-2'
        >
            <div className='flex items-center justify-between gap-2'>
                <div className='flex items-center gap-2 min-w-0'>
                    <MdVolumeUp className='text-lg text-primary shrink-0' />
                    <h4 className='text-sm font-semibold select-none'>
                        {t('services.tts_preview.title', { defaultValue: '語音預覽試聽' })}
                    </h4>
                    {activeGroupBadge && (
                        <Chip
                            size='sm'
                            variant='flat'
                            color='primary'
                        >
                            {activeGroupBadge}
                        </Chip>
                    )}
                </div>
                {catalog.voices.length > 0 && (
                    <Button
                        size='sm'
                        variant='light'
                        onPress={() => setShowGallery((prev) => !prev)}
                    >
                        {showGallery
                            ? t('services.tts_preview.hide_voices', { defaultValue: '收合聲音列表' })
                            : t('services.tts_preview.show_voices', {
                                  defaultValue: '展開全部聲音',
                              })}
                    </Button>
                )}
            </div>

            <div className='flex items-center gap-2'>
                <Input
                    size='sm'
                    variant='bordered'
                    aria-label={t('services.tts_preview.text_label', { defaultValue: '預覽文字' })}
                    placeholder={defaultPreviewText}
                    value={previewText}
                    onValueChange={setPreviewText}
                />
                {previewText !== defaultPreviewText && (
                    <Button
                        isIconOnly
                        size='sm'
                        variant='flat'
                        aria-label={t('services.tts_preview.reset_text', { defaultValue: '還原預設例句' })}
                        onPress={() => setPreviewText(defaultPreviewText)}
                    >
                        <MdRefresh className='text-base' />
                    </Button>
                )}
                <Button
                    size='sm'
                    color={playingKey === CURRENT_CONFIG_SLOT ? 'danger' : 'secondary'}
                    variant='flat'
                    className='shrink-0'
                    isLoading={loadingKey === CURRENT_CONFIG_SLOT}
                    startContent={
                        loadingKey === CURRENT_CONFIG_SLOT ? null : playingKey === CURRENT_CONFIG_SLOT ? (
                            <MdStop className='text-base' />
                        ) : (
                            <MdPlayArrow className='text-base' />
                        )
                    }
                    onPress={() => {
                        void handlePreview(null);
                    }}
                >
                    {playingKey === CURRENT_CONFIG_SLOT
                        ? t('services.tts_preview.stop', { defaultValue: '停止' })
                        : t('services.tts_preview.test_current', { defaultValue: '試聽目前設定' })}
                </Button>
            </div>

            {catalog.voices.length > 0 && (
                <div className='space-y-1.5'>
                    <div className='flex items-center justify-between gap-2 flex-wrap'>
                        <div className='flex items-center gap-2 min-w-0 flex-wrap'>
                            <Chip
                                size='sm'
                                variant='flat'
                                color={cachedCount === catalog.voices.length ? 'success' : 'default'}
                            >
                                {t('services.tts_preview.cached_count', {
                                    cached: cachedCount,
                                    total: catalog.voices.length,
                                    defaultValue: '已快取 {{cached}}/{{total}}',
                                })}
                            </Chip>
                            {isBatchRunning && batchProgress && (
                                <span
                                    role='status'
                                    className='text-xs text-primary font-medium'
                                >
                                    {t('services.tts_preview.batch_progress', {
                                        done: batchProgress.done,
                                        total: batchProgress.total,
                                        defaultValue: '預載中 {{done}}/{{total}}',
                                    })}
                                </span>
                            )}
                        </div>
                        {isBatchRunning ? (
                            <Button
                                size='sm'
                                color='danger'
                                variant='flat'
                                className='shrink-0'
                                startContent={<MdStop className='text-base' />}
                                onPress={cancelBatch}
                            >
                                {t('services.tts_preview.batch_stop', { defaultValue: '停止全測' })}
                            </Button>
                        ) : (
                            <Button
                                size='sm'
                                color='primary'
                                variant='flat'
                                className='shrink-0'
                                startContent={<MdPlaylistPlay className='text-base' />}
                                onPress={() => {
                                    void handleBatchPreview();
                                }}
                            >
                                {t('services.tts_preview.batch_preview', { defaultValue: '一鍵全測' })}
                            </Button>
                        )}
                    </div>
                    {isBatchRunning && batchProgress && (
                        <div className='h-1 w-full rounded-full bg-default-200 overflow-hidden'>
                            <div
                                className='h-full bg-primary transition-all duration-200'
                                style={{ width: `${batchPercent}%` }}
                            />
                        </div>
                    )}
                </div>
            )}

            {errorMessage && (
                <div
                    role='alert'
                    className='text-xs text-danger break-all rounded-small bg-danger/10 px-2.5 py-1.5'
                >
                    {errorMessage}
                </div>
            )}

            {batchSummary && (
                <div
                    role='alert'
                    className='text-xs text-danger break-all rounded-small bg-danger/10 px-2.5 py-1.5'
                >
                    {batchSummary}
                </div>
            )}

            {showGallery && catalog.voices.length > 0 && (
                <div className='space-y-2'>
                    {catalog.voices.length > 10 && (
                        <Input
                            size='sm'
                            variant='bordered'
                            aria-label={t('services.tts_preview.search_voice', { defaultValue: '搜尋聲音' })}
                            placeholder={t('services.tts_preview.search_placeholder', {
                                defaultValue: '篩選聲音名稱或風格…',
                            })}
                            value={voiceFilter}
                            onValueChange={setVoiceFilter}
                            isClearable
                        />
                    )}
                    <div className='grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1'>
                        {filteredVoices.map((voice) => {
                            const isSingleLoading = loadingKey === voice.key;
                            const isBatchLoading = batchLoadingVoices.has(voice.key);
                            const isLoading = isSingleLoading || isBatchLoading;
                            const isPlaying = playingKey === voice.key;
                            const cached = isVoiceCached(voice.key);
                            const voiceError = batchVoiceErrors[voice.key];
                            const voiceErrorLabel = voiceError
                                ? t('services.tts_preview.voice_failed', {
                                      reason: voiceError,
                                      defaultValue: '預載失敗：{{reason}}',
                                  })
                                : '';
                            return (
                                <div
                                    key={voice.key}
                                    className={`flex items-center justify-between gap-1 rounded-small border px-2 py-1.5 transition-colors ${
                                        voice.isSelected
                                            ? 'border-primary bg-primary/10'
                                            : 'border-default-200 bg-content1/70 hover:border-default-300'
                                    }`}
                                >
                                    <button
                                        type='button'
                                        className='flex-1 text-left min-w-0 cursor-pointer'
                                        onClick={() => {
                                            onSelectVoice?.(voice.key, catalog.voiceKey, catalog.customVoiceKey);
                                        }}
                                    >
                                        <div className='flex items-center gap-1'>
                                            <span className='text-xs font-medium truncate'>{voice.label}</span>
                                            {cached && (
                                                <span
                                                    className='inline-block h-1.5 w-1.5 rounded-full bg-success shrink-0'
                                                    title={t('services.tts_preview.cached', {
                                                        defaultValue: '已快取',
                                                    })}
                                                />
                                            )}
                                            {!cached && voiceError && (
                                                <span
                                                    className='inline-flex items-center text-danger shrink-0'
                                                    title={voiceErrorLabel}
                                                    aria-label={voiceErrorLabel}
                                                >
                                                    <MdErrorOutline className='text-xs' />
                                                </span>
                                            )}
                                        </div>
                                        {voice.description && (
                                            <div className='text-[11px] text-default-500 truncate'>
                                                {voice.description}
                                            </div>
                                        )}
                                    </button>
                                    <Button
                                        isIconOnly
                                        size='sm'
                                        radius='full'
                                        color={isPlaying ? 'danger' : voice.isSelected ? 'primary' : 'default'}
                                        variant={isPlaying ? 'solid' : 'flat'}
                                        isLoading={isLoading}
                                        title={
                                            isBatchLoading
                                                ? t('services.tts_preview.batch_loading_voice', {
                                                      defaultValue: '預載中',
                                                  })
                                                : undefined
                                        }
                                        aria-label={
                                            isPlaying
                                                ? `${t('services.tts_preview.stop', { defaultValue: '停止' })} ${voice.label}`
                                                : `${t('services.tts_preview.preview', { defaultValue: '試聽' })} ${voice.label}`
                                        }
                                        onPress={() => {
                                            void handlePreview(voice.key);
                                        }}
                                    >
                                        {isLoading ? null : isPlaying ? (
                                            <MdStop className='text-base' />
                                        ) : (
                                            <MdPlayArrow className='text-base' />
                                        )}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
