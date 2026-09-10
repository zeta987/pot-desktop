import { Button, ButtonGroup, Card, CardBody, CardFooter, CardHeader, Skeleton, Tooltip } from '@nextui-org/react';
import { writeText } from '@tauri-apps/api/clipboard';
import { fetch, Body } from '@tauri-apps/api/http';
import { sendNotification } from '@tauri-apps/api/notification';
import { invoke } from '@tauri-apps/api/tauri';
import { useAtomValue, useStore } from 'jotai';
import React, { useEffect, useRef, useState } from 'react';
import { BsChatDots } from 'react-icons/bs';
import { CgSpaceBetween } from 'react-icons/cg';
import { GiCycle } from 'react-icons/gi';
import { HiTranslate } from 'react-icons/hi';
import { MdContentCopy, MdSmartButton } from 'react-icons/md';
import { VscPreview } from 'react-icons/vsc';
import { useTranslation } from 'react-i18next';

import MarkdownRenderer from '../../../components/MarkdownRenderer';
import { useConfig } from '../../../hooks/useConfig';
import * as builtinServices from '../../../services/recognize';
import { invoke_plugin } from '../../../utils/invoke_plugin';
import { getServiceName, getServiceSouceType, ServiceSourceType } from '../../../utils/service_instance';
import { buildRecognitionChatContext } from '../../Chat/chatContext';
import { imageAtom } from '../ImageArea';
import { LANGUAGE_NOT_SUPPORTED, runRecognition } from '../utils/recognition_run';
import { getRecognitionServiceMetadata } from '../utils/recognition_service';

const hasOwn = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
const EMPTY_CONFIG = Object.freeze({});

export default function TextArea({
    serviceInstanceKey,
    serviceInstanceConfigMap,
    pluginList,
    language,
    recognizeFlag,
    isPrimary,
    fillHeight,
}) {
    const [autoCopy] = useConfig('recognize_auto_copy', false);
    const [deleteNewline] = useConfig('recognize_delete_newline', false);
    const [hideWindow] = useConfig('recognize_hide_window', false);
    const [serverPort] = useConfig('server_port', 60828);
    const [loading, setLoading] = useState(false);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [retryFlag, setRetryFlag] = useState(0);
    const retryTokenRef = useRef(0);
    const store = useStore();
    const image = useAtomValue(imageAtom);
    const { t } = useTranslation();

    const serviceName = getServiceName(serviceInstanceKey);
    const serviceInstanceConfig = serviceInstanceConfigMap?.[serviceInstanceKey] ?? EMPTY_CONFIG;
    const isPlugin = getServiceSouceType(serviceInstanceKey) === ServiceSourceType.PLUGIN;
    const isAiPlugin = isPlugin && serviceInstanceConfig.apiKey && serviceInstanceConfig.requestPath;
    const [previewMode, setPreviewMode] = useState(!!isAiPlugin);
    const { displayName } = getRecognitionServiceMetadata(serviceInstanceKey, serviceInstanceConfigMap, pluginList, t);
    const resultLabel = t('recognize.result_label', { name: displayName });
    const actionsDisabled = loading || !!error || !text;
    const followUpDisabled = loading || (!image.base64 && !text);

    useEffect(() => {
        setPreviewMode(!!isAiPlugin);
    }, [isAiPlugin]);

    useEffect(() => {
        const retryToken = ++retryTokenRef.current;
        let disposed = false;
        const isSuperseded = () =>
            disposed || retryTokenRef.current !== retryToken || store.get(imageAtom).id !== image.id;

        if (
            image.id === null ||
            language == null ||
            autoCopy === null ||
            deleteNewline === null ||
            hideWindow === null ||
            serverPort === null
        ) {
            return () => {
                disposed = true;
            };
        }

        if (!image.base64) {
            setText('');
            setError('');
            setLoading(false);
            return () => {
                disposed = true;
            };
        }

        const service = isPlugin ? pluginList?.[serviceName] : builtinServices[serviceName];
        const languageMap = isPlugin ? service?.language : service?.Language;
        if (!service || !languageMap) {
            setText('');
            setError(t('recognize.service_unavailable'));
            setLoading(false);
            return () => {
                disposed = true;
            };
        }

        const load = isPlugin
            ? async () => {
                  const [recognize, utils] = await invoke_plugin('recognize', serviceName);
                  return (base64, mappedLanguage, { config }) => recognize(base64, mappedLanguage, { config, utils });
              }
            : () => service.recognize;

        void runRecognition(
            {
                isLanguageSupported: hasOwn(languageMap, language),
                load,
                base64: image.base64,
                language: languageMap[language],
                config: serviceInstanceConfig,
                deleteNewline,
                isSuperseded,
                onResolved: (recognizedText) => {
                    if (!isPrimary || !autoCopy || isSuperseded()) return;
                    void Promise.resolve(writeText(recognizedText))
                        .then(() => {
                            if (!isSuperseded() && hideWindow) {
                                return sendNotification({
                                    title: t('common.write_clipboard'),
                                    body: recognizedText,
                                });
                            }
                        })
                        .catch((failure) => {
                            if (!isSuperseded()) console.error(failure);
                        });
                },
            },
            {
                setIsLoading: setLoading,
                setText,
                setError: (message) =>
                    setError(message === LANGUAGE_NOT_SUPPORTED ? t('recognize.language_not_supported') : message),
            }
        ).catch((failure) => {
            if (!isSuperseded()) {
                setError(String(failure));
                setLoading(false);
            }
        });

        return () => {
            disposed = true;
        };
    }, [
        autoCopy,
        deleteNewline,
        hideWindow,
        image.base64,
        image.id,
        isPlugin,
        isPrimary,
        language,
        pluginList,
        recognizeFlag,
        retryFlag,
        serverPort,
        serviceInstanceConfig,
        serviceName,
        store,
        t,
    ]);

    return (
        <Card
            aria-busy={loading}
            aria-label={resultLabel}
            className={`bg-content1 ${fillHeight ? 'h-full' : 'min-h-[320px] flex-shrink-0'}`}
            radius='10'
            role='region'
            shadow='none'
        >
            <CardHeader className='flex shrink-0 justify-between gap-2 px-[12px] py-2'>
                <span className='truncate text-sm font-medium'>{displayName}</span>
                {autoCopy && isPrimary && (
                    <Tooltip content={t('recognize.auto_copy_hint')}>
                        <span
                            aria-label={t('recognize.auto_copy_hint')}
                            className='shrink-0 text-default-500'
                            role='img'
                        >
                            <MdContentCopy className='text-[14px]' />
                        </span>
                    </Tooltip>
                )}
            </CardHeader>
            <CardBody className='bg-content1 min-h-0 flex-1 p-0'>
                {loading ? (
                    <div className='m-[12px] space-y-3'>
                        <Skeleton className='w-3/5 rounded-lg'>
                            <div className='h-3 w-3/5 rounded-lg bg-default-200' />
                        </Skeleton>
                        <Skeleton className='w-4/5 rounded-lg'>
                            <div className='h-3 w-4/5 rounded-lg bg-default-200' />
                        </Skeleton>
                        <Skeleton className='w-2/5 rounded-lg'>
                            <div className='h-3 w-2/5 rounded-lg bg-default-300' />
                        </Skeleton>
                    </div>
                ) : error ? (
                    <textarea
                        aria-label={resultLabel}
                        className='bg-content1 h-full m-[12px] mb-0 resize-none overflow-y-auto focus:outline-none text-red-500'
                        readOnly
                        value={error}
                    />
                ) : previewMode ? (
                    text ? (
                        <div className='h-full m-[12px] mb-0 overflow-y-auto select-text'>
                            <MarkdownRenderer>{text}</MarkdownRenderer>
                        </div>
                    ) : (
                        <p className='m-[12px] text-sm text-default-500'>{t('recognize.no_text')}</p>
                    )
                ) : (
                    <textarea
                        aria-label={resultLabel}
                        className='bg-content1 h-full m-[12px] mb-0 resize-none overflow-y-auto focus:outline-none placeholder:text-default-500'
                        onChange={(event) => setText(event.target.value)}
                        placeholder={t('recognize.no_text')}
                        value={text}
                    />
                )}
            </CardBody>
            <CardFooter className='bg-content1 flex shrink-0 justify-start px-[12px]'>
                <ButtonGroup>
                    <Tooltip content={t('translate.retry')}>
                        <Button
                            aria-label={t('translate.retry')}
                            isDisabled={loading || !image.base64}
                            isIconOnly
                            onPress={() => setRetryFlag((flag) => flag + 1)}
                            size='sm'
                            variant='light'
                        >
                            <GiCycle className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={t('recognize.copy_text')}>
                        <Button
                            aria-label={t('recognize.copy_text')}
                            isDisabled={actionsDisabled}
                            isIconOnly
                            onPress={() => void writeText(text)}
                            size='sm'
                            variant='light'
                        >
                            <MdContentCopy className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={t('recognize.delete_newline')}>
                        <Button
                            aria-label={t('recognize.delete_newline')}
                            isDisabled={actionsDisabled}
                            isIconOnly
                            onPress={() => setText(text.replace(/\-\s+/g, '').replace(/\s+/g, ' '))}
                            size='sm'
                            variant='light'
                        >
                            <MdSmartButton className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={t('recognize.delete_space')}>
                        <Button
                            aria-label={t('recognize.delete_space')}
                            isDisabled={actionsDisabled}
                            isIconOnly
                            onPress={() => setText(text.replaceAll(' ', ''))}
                            size='sm'
                            variant='light'
                        >
                            <CgSpaceBetween className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={previewMode ? t('recognize.edit_text') : t('recognize.preview_markdown')}>
                        <Button
                            aria-label={previewMode ? t('recognize.edit_text') : t('recognize.preview_markdown')}
                            className={previewMode ? 'text-primary' : ''}
                            isDisabled={loading || !!error}
                            isIconOnly
                            onPress={() => setPreviewMode(!previewMode)}
                            size='sm'
                            variant='light'
                        >
                            <VscPreview className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    <Tooltip content={t('recognize.translate')}>
                        <Button
                            aria-label={t('recognize.translate')}
                            color='primary'
                            isDisabled={actionsDisabled || serverPort === null}
                            isIconOnly
                            onPress={() => {
                                void fetch(`http://127.0.0.1:${serverPort}/translate`, {
                                    method: 'POST',
                                    body: Body.text(text),
                                    responseType: 2,
                                });
                            }}
                            size='sm'
                            variant='light'
                        >
                            <HiTranslate className='text-[16px]' />
                        </Button>
                    </Tooltip>
                    {isAiPlugin && (
                        <Tooltip content={t('recognize.follow_up')}>
                            <Button
                                aria-label={t('recognize.follow_up')}
                                isDisabled={followUpDisabled}
                                isIconOnly
                                onPress={() => {
                                    invoke('open_chat_window', {
                                        context: JSON.stringify(
                                            buildRecognitionChatContext({
                                                text,
                                                imageBase64: image.base64,
                                                apiConfig: {
                                                    service: 'openai',
                                                    requestPath: serviceInstanceConfig.requestPath,
                                                    model: serviceInstanceConfig.model || 'gpt-4o',
                                                    apiKey: serviceInstanceConfig.apiKey,
                                                    stream: true,
                                                },
                                            })
                                        ),
                                    });
                                }}
                                size='sm'
                                variant='light'
                            >
                                <BsChatDots className='text-[16px]' />
                            </Button>
                        </Tooltip>
                    )}
                </ButtonGroup>
            </CardFooter>
        </Card>
    );
}
