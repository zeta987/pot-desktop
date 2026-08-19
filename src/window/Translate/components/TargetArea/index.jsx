import {
    Card,
    CardBody,
    CardHeader,
    CardFooter,
    Button,
    ButtonGroup,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Tooltip,
} from '@nextui-org/react';
import { BiCollapseVertical, BiExpandVertical } from 'react-icons/bi';
import { BaseDirectory, readTextFile } from '@tauri-apps/api/fs';
import { sendNotification } from '@tauri-apps/api/notification';
import React, { useEffect, useState, useRef } from 'react';
import { writeText } from '@tauri-apps/api/clipboard';
import PulseLoader from 'react-spinners/PulseLoader';
import { TbTransformFilled } from 'react-icons/tb';
import { HiOutlineVolumeUp } from 'react-icons/hi';
import { semanticColors } from '@nextui-org/theme';
import toast, { Toaster } from 'react-hot-toast';
import { MdContentCopy, MdPause, MdPlayArrow } from 'react-icons/md';
import { BsChatDots } from 'react-icons/bs';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/tauri';
import Database from 'tauri-plugin-sql-api';
import { GiCycle } from 'react-icons/gi';
import { useTheme } from 'next-themes';
import { useAtomValue } from 'jotai';
import { nanoid } from 'nanoid';
import { useSpring, animated } from '@react-spring/web';
import useMeasure from 'react-use-measure';

import * as builtinCollectionServices from '../../../../services/collection';
import { sourceLanguageAtom, targetLanguageAtom } from '../LanguageArea';
import { useConfig, useToastStyle, useVoice } from '../../../../hooks';
import { sourceTextAtom, detectLanguageAtom } from '../SourceArea';
import { invoke_plugin } from '../../../../utils/invoke_plugin';
import * as builtinServices from '../../../../services/translate';
import * as builtinTtsServices from '../../../../services/tts';
import MarkdownRenderer from '../../../../components/MarkdownRenderer';
import { isLlmService } from '../../../../utils/llm_services';
import { createTargetAreaReveal } from '../../utils/target_area_reveal';
import { runTranslation } from '../../utils/translation_run';

import { info, error as logError } from 'tauri-plugin-log-api';
import {
    INSTANCE_NAME_CONFIG_KEY,
    ServiceSourceType,
    getDisplayInstanceName,
    getServiceName,
    getServiceSouceType,
    whetherPluginService,
} from '../../../../utils/service_instance';

let translateID = [];

/**
 * Resolve a Service Instance's translate call for one Translation Run.
 *
 * A plugin has to be loaded first and hands back the `utils` its own call expects, while
 * a built-in service is already there. Both come back as the same call, so a run does not
 * have to know which kind it is driving.
 */
const loadTranslateCall = async (serviceName, isPluginService, instanceConfig) => {
    if (!isPluginService) {
        return (text, from, to, options) => builtinServices[serviceName].translate(text, from, to, options);
    }
    instanceConfig['enable'] = 'true';
    const [func, utils] = await invoke_plugin('translate', serviceName);
    return (text, from, to, options) => func(text, from, to, { ...options, utils });
};

export default function TargetArea(props) {
    const {
        index,
        name,
        translateServiceInstanceList,
        pluginList,
        serviceInstanceConfigMap,
        isPaused,
        onTogglePause,
        ...drag
    } = props;

    const [currentTranslateServiceInstanceKey, setCurrentTranslateServiceInstanceKey] = useState(name);
    function getInstanceName(instanceKey, serviceNameSupplier) {
        const instanceConfig = serviceInstanceConfigMap[instanceKey] ?? {};
        return getDisplayInstanceName(instanceConfig[INSTANCE_NAME_CONFIG_KEY], serviceNameSupplier);
    }

    const [appFontSize] = useConfig('app_font_size', 16);
    const [collectionServiceList] = useConfig('collection_service_list', []);
    const [ttsServiceList] = useConfig('tts_service_list', ['lingva_tts']);
    const [translateSecondLanguage] = useConfig('translate_second_language', 'en');
    const [historyDisable] = useConfig('history_disable', false);
    const [isLoading, setIsLoading] = useState(false);
    const [hide, setHide] = useState(true);

    const [result, setResult] = useState('');
    const [error, setError] = useState('');

    const sourceText = useAtomValue(sourceTextAtom);
    const sourceLanguage = useAtomValue(sourceLanguageAtom);
    const targetLanguage = useAtomValue(targetLanguageAtom);
    const [autoCopy] = useConfig('translate_auto_copy', 'disable');
    const [hideWindow] = useConfig('translate_hide_window', false);
    const [clipboardMonitor] = useConfig('clipboard_monitor', false);

    const detectLanguage = useAtomValue(detectLanguageAtom);
    const [ttsPluginInfo, setTtsPluginInfo] = useState();
    const { t } = useTranslation();
    const textAreaRef = useRef();
    const toastStyle = useToastStyle();
    const speak = useVoice();
    const theme = useTheme();

    useEffect(() => {
        if (error) {
            logError(`[${currentTranslateServiceInstanceKey}]happened error: ` + error);
        }
    }, [error]);

    // listen to translation
    useEffect(() => {
        setResult('');
        setError('');
        if (
            !isPaused &&
            sourceText.trim() !== '' &&
            sourceLanguage &&
            targetLanguage &&
            autoCopy !== null &&
            hideWindow !== null &&
            clipboardMonitor !== null
        ) {
            if (autoCopy === 'source' && !clipboardMonitor) {
                writeText(sourceText).then(() => {
                    if (hideWindow) {
                        sendNotification({ title: t('common.write_clipboard'), body: sourceText });
                    }
                });
            }
            translate();
        }
    }, [
        sourceText,
        sourceLanguage,
        targetLanguage,
        autoCopy,
        hideWindow,
        currentTranslateServiceInstanceKey,
        clipboardMonitor,
        isPaused,
    ]);

    // todo: history panel use service instance key
    const addToHistory = async (text, source, target, serviceInstanceKey, result) => {
        const db = await Database.load('sqlite:history.db');

        await db
            .execute(
                'INSERT into history (text, source, target, service, result, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
                [text, source, target, serviceInstanceKey, result, Date.now()]
            )
            .then(
                (v) => {
                    db.close();
                },
                (e) => {
                    db.execute(
                        'CREATE TABLE history(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL,source TEXT NOT NULL,target TEXT NOT NULL,service TEXT NOT NULL, result TEXT NOT NULL,timestamp INTEGER NOT NULL)'
                    ).then(() => {
                        db.close();
                        addToHistory(text, source, target, serviceInstanceKey, result);
                    });
                }
            );
    };

    const translate = async () => {
        let id = nanoid();
        translateID[index] = id;

        const reveal = createTargetAreaReveal(setHide);

        const translateServiceName = getServiceName(currentTranslateServiceInstanceKey);
        const isPluginService = whetherPluginService(currentTranslateServiceInstanceKey);
        const languages = isPluginService
            ? pluginList['translate'][translateServiceName].language
            : builtinServices[translateServiceName].Language;

        let newTargetLanguage = targetLanguage;
        if (sourceLanguage === 'auto' && targetLanguage === detectLanguage) {
            newTargetLanguage = translateSecondLanguage;
        }
        const instanceConfig = serviceInstanceConfigMap[currentTranslateServiceInstanceKey];

        await runTranslation(
            {
                isLanguagePairSupported: sourceLanguage in languages && targetLanguage in languages,
                load: () => loadTranslateCall(translateServiceName, isPluginService, instanceConfig),
                text: sourceText.trim(),
                from: languages[sourceLanguage],
                to: languages[newTargetLanguage],
                config: instanceConfig,
                detect: detectLanguage,
                isSuperseded: () => translateID[index] !== id,
                applyResult: (v) => setResult(typeof v === 'string' ? v.trim() : v),
                log: {
                    resolved: (v) => info(`[${currentTranslateServiceInstanceKey}]resolve:` + v),
                    rejected: (e) => info(`[${currentTranslateServiceInstanceKey}]reject:` + e),
                },
                onResolved: (v) => {
                    if (!historyDisable) {
                        addToHistory(
                            sourceText.trim(),
                            detectLanguage,
                            newTargetLanguage,
                            translateServiceName,
                            typeof v === 'string' ? v.trim() : v
                        );
                    }
                    if (index === 0 && !clipboardMonitor) {
                        switch (autoCopy) {
                            case 'target':
                                writeText(v).then(() => {
                                    if (hideWindow) {
                                        sendNotification({ title: t('common.write_clipboard'), body: v });
                                    }
                                });
                                break;
                            case 'source_target':
                                writeText(sourceText.trim() + '\n\n' + v).then(() => {
                                    if (hideWindow) {
                                        sendNotification({
                                            title: t('common.write_clipboard'),
                                            body: sourceText.trim() + '\n\n' + v,
                                        });
                                    }
                                });
                                break;
                            default:
                                break;
                        }
                    }
                },
            },
            { setIsLoading, setError, setResult, reveal }
        );
    };

    // hide empty textarea
    useEffect(() => {
        if (textAreaRef.current !== null) {
            textAreaRef.current.style.height = '0px';
            if (result !== '') {
                textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
            }
        }
    }, [result]);

    // refresh tts config
    useEffect(() => {
        if (ttsServiceList && getServiceSouceType(ttsServiceList[0]) === ServiceSourceType.PLUGIN) {
            readTextFile(`plugins/tts/${getServiceName(ttsServiceList[0])}/info.json`, {
                dir: BaseDirectory.AppConfig,
            }).then((infoStr) => {
                setTtsPluginInfo(JSON.parse(infoStr));
            });
        }
    }, [ttsServiceList]);

    // handle tts speak
    const handleSpeak = async () => {
        const instanceKey = ttsServiceList[0];
        if (getServiceSouceType(instanceKey) === ServiceSourceType.PLUGIN) {
            const pluginConfig = serviceInstanceConfigMap[instanceKey];
            if (!(targetLanguage in ttsPluginInfo.language)) {
                throw new Error('Language not supported');
            }
            let [func, utils] = await invoke_plugin('tts', getServiceName(instanceKey));
            let data = await func(result, ttsPluginInfo.language[targetLanguage], {
                config: pluginConfig,
                utils,
            });
            speak(data);
        } else {
            if (!(targetLanguage in builtinTtsServices[getServiceName(instanceKey)].Language)) {
                throw new Error('Language not supported');
            }
            const instanceConfig = serviceInstanceConfigMap[instanceKey];
            let data = await builtinTtsServices[getServiceName(instanceKey)].tts(
                result,
                builtinTtsServices[getServiceName(instanceKey)].Language[targetLanguage],
                {
                    config: instanceConfig,
                }
            );
            speak(data);
        }
    };

    const [boundRef, bounds] = useMeasure({ scroll: true });
    const springs = useSpring({
        from: { height: 0 },
        to: { height: hide || isPaused ? 0 : bounds.height },
    });

    return (
        <Card
            shadow='none'
            className='rounded-[10px]'
        >
            <Toaster />
            <CardHeader
                className={`flex justify-between py-1 px-0 bg-content2 h-[30px] ${hide || isPaused ? 'rounded-[10px]' : 'rounded-t-[10px]'} ${isPaused ? 'opacity-60' : ''}`}
                {...drag}
            >
                {/* current service instance and available service instance to change */}
                <div className='flex'>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                size='sm'
                                variant='solid'
                                className='bg-transparent'
                                startContent={
                                    whetherPluginService(currentTranslateServiceInstanceKey) ? (
                                        <img
                                            src={
                                                pluginList['translate'][
                                                    getServiceName(currentTranslateServiceInstanceKey)
                                                ].icon
                                            }
                                            className='h-[20px] my-auto'
                                        />
                                    ) : (
                                        <img
                                            src={
                                                builtinServices[getServiceName(currentTranslateServiceInstanceKey)].info
                                                    .icon
                                            }
                                            className='h-[20px] my-auto'
                                        />
                                    )
                                }
                            >
                                {whetherPluginService(currentTranslateServiceInstanceKey) ? (
                                    <div className='my-auto'>{`${getInstanceName(currentTranslateServiceInstanceKey, () => pluginList['translate'][getServiceName(currentTranslateServiceInstanceKey)].display)} `}</div>
                                ) : (
                                    <div className='my-auto'>
                                        {getInstanceName(currentTranslateServiceInstanceKey, () =>
                                            t(
                                                `services.translate.${getServiceName(currentTranslateServiceInstanceKey)}.title`
                                            )
                                        )}
                                    </div>
                                )}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label='app language'
                            className='max-h-[40vh] overflow-y-auto'
                            onAction={(key) => {
                                setCurrentTranslateServiceInstanceKey(key);
                                if (isPaused && key !== currentTranslateServiceInstanceKey) {
                                    onTogglePause(name);
                                }
                            }}
                        >
                            {translateServiceInstanceList.map((instanceKey) => {
                                return (
                                    <DropdownItem
                                        key={instanceKey}
                                        startContent={
                                            whetherPluginService(instanceKey) ? (
                                                <img
                                                    src={pluginList['translate'][getServiceName(instanceKey)].icon}
                                                    className='h-[20px] my-auto'
                                                />
                                            ) : (
                                                <img
                                                    src={builtinServices[getServiceName(instanceKey)].info.icon}
                                                    className='h-[20px] my-auto'
                                                />
                                            )
                                        }
                                    >
                                        {whetherPluginService(instanceKey) ? (
                                            <div className='my-auto'>{`${getInstanceName(instanceKey, () => pluginList['translate'][getServiceName(instanceKey)].display)} `}</div>
                                        ) : (
                                            <div className='my-auto'>
                                                {getInstanceName(instanceKey, () =>
                                                    t(`services.translate.${getServiceName(instanceKey)}.title`)
                                                )}
                                            </div>
                                        )}
                                    </DropdownItem>
                                );
                            })}
                        </DropdownMenu>
                    </Dropdown>
                    <PulseLoader
                        loading={isLoading && !isPaused}
                        color={theme === 'dark' ? semanticColors.dark.default[500] : semanticColors.light.default[500]}
                        size={8}
                        cssOverride={{
                            display: 'inline-block',
                            margin: 'auto',
                            marginLeft: '20px',
                        }}
                    />
                </div>
                {/* pause/resume and content collapse */}
                <div className='flex'>
                    <Tooltip content={isPaused ? t('translate.resume') : t('translate.pause')}>
                        <Button
                            size='sm'
                            isIconOnly
                            variant='light'
                            className='h-[20px] w-[20px]'
                            onPress={() => onTogglePause(name)}
                        >
                            {isPaused ? <MdPlayArrow className='text-[16px]' /> : <MdPause className='text-[16px]' />}
                        </Button>
                    </Tooltip>
                    {!isPaused && (
                        <Button
                            size='sm'
                            isIconOnly
                            variant='light'
                            className='h-[20px] w-[20px]'
                            onPress={() => setHide(!hide)}
                        >
                            {hide ? (
                                <BiExpandVertical className='text-[16px]' />
                            ) : (
                                <BiCollapseVertical className='text-[16px]' />
                            )}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <animated.div style={{ ...springs }}>
                <div ref={boundRef}>
                    {/* result content */}
                    <CardBody className={`p-[12px] pb-0 ${hide && 'h-0 p-0'}`}>
                        {typeof result === 'string' ? (
                            isLlmService(currentTranslateServiceInstanceKey) && result !== '' ? (
                                <div className='overflow-y-auto select-text'>
                                    <MarkdownRenderer fontSize={appFontSize}>{result}</MarkdownRenderer>
                                </div>
                            ) : (
                                <textarea
                                    ref={textAreaRef}
                                    className={`text-[${appFontSize}px] h-0 resize-none bg-transparent select-text outline-none`}
                                    readOnly
                                    value={result}
                                />
                            )
                        ) : (
                            <div>
                                {result['pronunciations'] &&
                                    result['pronunciations'].map((pronunciation) => {
                                        return (
                                            <div key={nanoid()}>
                                                {pronunciation['region'] && (
                                                    <span
                                                        className={`text-[${appFontSize}px] mr-[12px] text-default-500`}
                                                    >
                                                        {pronunciation['region']}
                                                    </span>
                                                )}
                                                {pronunciation['symbol'] && (
                                                    <span
                                                        className={`text-[${appFontSize}px] mr-[12px] text-default-500`}
                                                    >
                                                        {pronunciation['symbol']}
                                                    </span>
                                                )}
                                                {pronunciation['voice'] && pronunciation['voice'] !== '' && (
                                                    <HiOutlineVolumeUp
                                                        className={`text-[${appFontSize}px] inline-block my-auto cursor-pointer`}
                                                        onClick={() => {
                                                            speak(pronunciation['voice']);
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                {result['explanations'] &&
                                    result['explanations'].map((explanations) => {
                                        return (
                                            <div key={nanoid()}>
                                                {explanations['explains'] &&
                                                    explanations['explains'].map((explain, index) => {
                                                        return (
                                                            <span key={nanoid()}>
                                                                {index === 0 ? (
                                                                    <>
                                                                        <span
                                                                            className={`text-[${appFontSize - 2}px] text-default-500 mr-[12px]`}
                                                                        >
                                                                            {explanations['trait']}
                                                                        </span>
                                                                        <span
                                                                            className={`font-bold text-[${appFontSize}px] select-text`}
                                                                        >
                                                                            {explain}
                                                                        </span>
                                                                        <br />
                                                                    </>
                                                                ) : (
                                                                    <span
                                                                        className={`text-[${appFontSize - 2}px] text-default-500 select-text mr-1`}
                                                                        key={nanoid()}
                                                                    >
                                                                        {explain}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        );
                                                    })}
                                            </div>
                                        );
                                    })}
                                <br />
                                {result['associations'] &&
                                    result['associations'].map((association) => {
                                        return (
                                            <div key={nanoid()}>
                                                <span className={`text-[${appFontSize}px] text-default-500`}>
                                                    {association}
                                                </span>
                                            </div>
                                        );
                                    })}
                                {result['sentence'] &&
                                    result['sentence'].map((sentence, index) => {
                                        return (
                                            <div key={nanoid()}>
                                                <span className={`text-[${appFontSize - 2}px] mr-[12px]`}>
                                                    {index + 1}.
                                                </span>
                                                <>
                                                    {sentence['source'] && (
                                                        <span
                                                            className={`text-[${appFontSize}px] select-text`}
                                                            dangerouslySetInnerHTML={{
                                                                __html: sentence['source'],
                                                            }}
                                                        />
                                                    )}
                                                </>
                                                <>
                                                    {sentence['target'] && (
                                                        <div
                                                            className={`text-[${appFontSize}px] select-text text-default-500`}
                                                            dangerouslySetInnerHTML={{
                                                                __html: sentence['target'],
                                                            }}
                                                        />
                                                    )}
                                                </>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                        {error !== '' ? (
                            error.split('\n').map((v) => {
                                return (
                                    <p
                                        key={v}
                                        className={`text-[${appFontSize}px] text-red-500`}
                                    >
                                        {v}
                                    </p>
                                );
                            })
                        ) : (
                            <></>
                        )}
                    </CardBody>
                    <CardFooter
                        className={`bg-content1 rounded-none rounded-b-[10px] flex px-[12px] p-[5px] ${hide && 'hidden'}`}
                    >
                        <ButtonGroup>
                            {/* speak button */}
                            <Tooltip content={t('translate.speak')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    isDisabled={typeof result !== 'string' || result === ''}
                                    onPress={() => {
                                        handleSpeak().catch((e) => {
                                            toast.error(e.toString(), { style: toastStyle });
                                        });
                                    }}
                                >
                                    <HiOutlineVolumeUp className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            {/* copy button */}
                            <Tooltip content={t('translate.copy')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    isDisabled={typeof result !== 'string' || result === ''}
                                    onPress={() => {
                                        writeText(result);
                                    }}
                                >
                                    <MdContentCopy className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            {/* translate back button */}
                            <Tooltip content={t('translate.translate_back')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    isDisabled={typeof result !== 'string' || result === ''}
                                    onPress={async () => {
                                        setError('');
                                        const reveal = createTargetAreaReveal(setHide);
                                        const translateServiceName = getServiceName(currentTranslateServiceInstanceKey);
                                        const isPluginService = whetherPluginService(
                                            currentTranslateServiceInstanceKey
                                        );
                                        const languages = isPluginService
                                            ? pluginList['translate'][translateServiceName].language
                                            : builtinServices[translateServiceName].Language;

                                        let newTargetLanguage = sourceLanguage;
                                        if (sourceLanguage === 'auto') {
                                            newTargetLanguage = detectLanguage;
                                        }
                                        let newSourceLanguage = targetLanguage;
                                        if (sourceLanguage === 'auto') {
                                            newSourceLanguage = 'auto';
                                        }
                                        const instanceConfig =
                                            serviceInstanceConfigMap[currentTranslateServiceInstanceKey];

                                        await runTranslation(
                                            {
                                                isLanguagePairSupported:
                                                    newSourceLanguage in languages && newTargetLanguage in languages,
                                                load: () =>
                                                    loadTranslateCall(
                                                        translateServiceName,
                                                        isPluginService,
                                                        instanceConfig
                                                    ),
                                                text: result.trim(),
                                                from: languages[newSourceLanguage],
                                                to: languages[newTargetLanguage],
                                                config: instanceConfig,
                                                // The two paths have always disagreed on what to hand a service as
                                                // the detected language here. Kept as-is so this stays a refactor.
                                                detect: isPluginService ? detectLanguage : newSourceLanguage,
                                                applyResult: (v) => setResult(v === result ? v + ' ' : v.trim()),
                                            },
                                            { setIsLoading, setError, setResult, reveal }
                                        );
                                    }}
                                >
                                    <TbTransformFilled className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            {/* follow-up chat button */}
                            {getServiceName(currentTranslateServiceInstanceKey) === 'openai' &&
                                typeof result === 'string' &&
                                result !== '' && (
                                    <Tooltip content={t('recognize.follow_up')}>
                                        <Button
                                            isIconOnly
                                            variant='light'
                                            size='sm'
                                            onPress={() => {
                                                const config =
                                                    serviceInstanceConfigMap[currentTranslateServiceInstanceKey] ?? {};
                                                invoke('open_chat_window', {
                                                    context: JSON.stringify({
                                                        source: 'translate',
                                                        sourceText: sourceText,
                                                        resultText: result,
                                                        apiConfig: {
                                                            service: config.service || 'openai',
                                                            requestPath: config.requestPath,
                                                            model: config.model,
                                                            apiKey: config.apiKey,
                                                            stream: config.stream ?? true,
                                                            requestArguments: config.requestArguments,
                                                        },
                                                        initialMessages: [
                                                            { role: 'user', content: sourceText },
                                                            { role: 'assistant', content: result },
                                                        ],
                                                    }),
                                                });
                                            }}
                                        >
                                            <BsChatDots className='text-[16px]' />
                                        </Button>
                                    </Tooltip>
                                )}
                            {/* error retry button */}
                            <Tooltip content={t('translate.retry')}>
                                <Button
                                    isIconOnly
                                    variant='light'
                                    size='sm'
                                    className={`${error === '' && 'hidden'}`}
                                    onPress={() => {
                                        setError('');
                                        setResult('');
                                        translate();
                                    }}
                                >
                                    <GiCycle className='text-[16px]' />
                                </Button>
                            </Tooltip>
                            {/* available collection service instance */}
                            {collectionServiceList &&
                                collectionServiceList.map((collectionServiceInstanceName) => {
                                    return (
                                        <Button
                                            key={collectionServiceInstanceName}
                                            isIconOnly
                                            variant='light'
                                            size='sm'
                                            onPress={async () => {
                                                if (
                                                    getServiceSouceType(collectionServiceInstanceName) ===
                                                    ServiceSourceType.PLUGIN
                                                ) {
                                                    const pluginConfig =
                                                        serviceInstanceConfigMap[collectionServiceInstanceName];
                                                    let [func, utils] = await invoke_plugin(
                                                        'collection',
                                                        getServiceName(collectionServiceInstanceName)
                                                    );
                                                    func(sourceText.trim(), result.toString(), {
                                                        config: pluginConfig,
                                                        utils,
                                                    }).then(
                                                        (_) => {
                                                            toast.success(t('translate.add_collection_success'), {
                                                                style: toastStyle,
                                                            });
                                                        },
                                                        (e) => {
                                                            toast.error(e.toString(), { style: toastStyle });
                                                        }
                                                    );
                                                } else {
                                                    const instanceConfig =
                                                        serviceInstanceConfigMap[collectionServiceInstanceName];
                                                    builtinCollectionServices[
                                                        getServiceName(collectionServiceInstanceName)
                                                    ]
                                                        .collection(sourceText, result, {
                                                            config: instanceConfig,
                                                        })
                                                        .then(
                                                            (_) => {
                                                                toast.success(t('translate.add_collection_success'), {
                                                                    style: toastStyle,
                                                                });
                                                            },
                                                            (e) => {
                                                                toast.error(e.toString(), { style: toastStyle });
                                                            }
                                                        );
                                                }
                                            }}
                                        >
                                            <img
                                                src={
                                                    getServiceSouceType(collectionServiceInstanceName) ===
                                                    ServiceSourceType.PLUGIN
                                                        ? pluginList['collection'][
                                                              getServiceName(collectionServiceInstanceName)
                                                          ].icon
                                                        : builtinCollectionServices[
                                                              getServiceName(collectionServiceInstanceName)
                                                          ].info.icon
                                                }
                                                className='h-[16px] w-[16px]'
                                            />
                                        </Button>
                                    );
                                })}
                        </ButtonGroup>
                    </CardFooter>
                </div>
            </animated.div>
        </Card>
    );
}
