import { readDir, BaseDirectory, readTextFile, exists } from '@tauri-apps/api/fs';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { appWindow, currentMonitor } from '@tauri-apps/api/window';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { Spacer, Button } from '@nextui-org/react';
import { AiFillCloseCircle } from 'react-icons/ai';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { BsPinFill } from 'react-icons/bs';

import PausedRunGroup from './components/PausedRunGroup';
import LanguageArea from './components/LanguageArea';
import SourceArea from './components/SourceArea';
import TargetArea from './components/TargetArea';
import { buildLayout, reorderLayout, slotDraggableId } from './utils/paused_runs';
import { osType } from '../../utils/env';
import { useConfig } from '../../hooks';
import { store } from '../../utils/store';
import { info } from 'tauri-plugin-log-api';

// How long a drag must hover over a collapsed run before it springs open.
const SPRING_LOADED_DELAY = 800;

let blurTimeout = null;
let resizeTimeout = null;
let moveTimeout = null;

const listenBlur = () => {
    return listen('tauri://blur', () => {
        if (appWindow.label === 'translate') {
            if (blurTimeout) {
                clearTimeout(blurTimeout);
            }
            info('Blur');
            // 100ms后关闭窗口，因为在 windows 下拖动窗口时会先切换成 blur 再立即切换成 focus
            // 如果直接关闭将导致窗口无法拖动
            blurTimeout = setTimeout(async () => {
                info('Confirm Blur');
                await appWindow.close();
            }, 100);
        }
    });
};

let unlisten = listenBlur();
// 取消 blur 监听
const unlistenBlur = () => {
    unlisten.then((f) => {
        f();
    });
};

// 监听 focus 事件取消 blurTimeout 时间之内的关闭窗口
void listen('tauri://focus', () => {
    info('Focus');
    if (blurTimeout) {
        info('Cancel Close');
        clearTimeout(blurTimeout);
    }
});
// 监听 move 事件取消 blurTimeout 时间之内的关闭窗口
void listen('tauri://move', () => {
    info('Move');
    if (blurTimeout) {
        info('Cancel Close');
        clearTimeout(blurTimeout);
    }
});

export default function Translate() {
    const [closeOnBlur] = useConfig('translate_close_on_blur', true);
    const [alwaysOnTop] = useConfig('translate_always_on_top', false);
    const [windowPosition] = useConfig('translate_window_position', 'mouse');
    const [rememberWindowSize] = useConfig('translate_remember_window_size', false);
    const [translateServiceInstanceList, setTranslateServiceInstanceList] = useConfig('translate_service_list', [
        'deepl',
        'bing',
        'lingva',
        'yandex',
        'google',
        'ecdict',
    ]);
    const [recognizeServiceInstanceList] = useConfig('recognize_service_list', ['system', 'tesseract']);
    const [ttsServiceInstanceList] = useConfig('tts_service_list', ['lingva_tts']);
    const [collectionServiceInstanceList] = useConfig('collection_service_list', []);
    const [hideLanguage] = useConfig('hide_language', false);
    const [pausedServices, setPausedServices] = useConfig('translate_popup_paused', []);
    const [collapsePausedRuns] = useConfig('translate_collapse_paused_runs', false);

    // Defensive filter: remove stale keys not in current service list
    const validPausedServices = (pausedServices ?? []).filter((key) =>
        (translateServiceInstanceList ?? []).includes(key)
    );

    const togglePauseService = (serviceInstanceKey) => {
        if (validPausedServices.includes(serviceInstanceKey)) {
            setPausedServices(validPausedServices.filter((k) => k !== serviceInstanceKey));
        } else {
            setPausedServices([...validPausedServices, serviceInstanceKey]);
        }
    };

    const [pined, setPined] = useState(false);
    const [pluginList, setPluginList] = useState(null);
    const [serviceInstanceConfigMap, setServiceInstanceConfigMap] = useState(null);
    // Runs the user opened during this window's lifetime. Deliberately not persisted:
    // a run is derived from adjacency, so its id stops meaning the same thing once the
    // ordering or the paused set changes. See docs/adr/0001.
    const [expandedRunIds, setExpandedRunIds] = useState([]);
    const springTimer = useRef(null);
    const springRunId = useRef(null);

    const layout = useMemo(() => {
        if (translateServiceInstanceList === null || serviceInstanceConfigMap === null) {
            return [];
        }
        const disabledKeys = translateServiceInstanceList.filter(
            (key) => ((serviceInstanceConfigMap[key] ?? {})['enable'] ?? true) === false
        );
        return buildLayout({
            serviceList: translateServiceInstanceList,
            pausedKeys: validPausedServices,
            disabledKeys,
            collapseEnabled: collapsePausedRuns ?? false,
            expandedRunIds,
        });
    }, [translateServiceInstanceList, serviceInstanceConfigMap, pausedServices, collapsePausedRuns, expandedRunIds]);

    // Position of each instance in the stored list, used to keep TargetArea's own
    // per-panel bookkeeping stable regardless of how rows are grouped.
    const serviceIndexMap = useMemo(() => {
        const map = {};
        (translateServiceInstanceList ?? []).forEach((key, index) => {
            map[key] = index;
        });
        return map;
    }, [translateServiceInstanceList]);

    const toggleRun = (runId) => {
        setExpandedRunIds((ids) => (ids.includes(runId) ? ids.filter((id) => id !== runId) : [...ids, runId]));
    };

    const cancelSpring = () => {
        if (springTimer.current) {
            clearTimeout(springTimer.current);
            springTimer.current = null;
        }
        springRunId.current = null;
    };

    // Spring-loaded folders: parking a drag over a collapsed run opens it so the item
    // can be dropped at an exact position inside.
    const onDragUpdate = (update) => {
        if (!update.destination) {
            cancelSpring();
            return;
        }
        const draggables = layout.filter((slot) => slot.draggableIndex !== null);
        const dragged = draggables.find((slot) => slotDraggableId(slot) === update.draggableId);
        const rest = draggables.filter((slot) => slot !== dragged);
        const at = rest[update.destination.index];
        const before = update.destination.index > 0 ? rest[update.destination.index - 1] : null;
        const target = at?.kind === 'collapsedRun' ? at : before?.kind === 'collapsedRun' ? before : null;
        const runId = target ? target.runId : null;

        if (runId === springRunId.current) return;
        cancelSpring();
        if (runId === null) return;

        springRunId.current = runId;
        springTimer.current = setTimeout(() => {
            setExpandedRunIds((ids) => (ids.includes(runId) ? ids : [...ids, runId]));
            cancelSpring();
        }, SPRING_LOADED_DELAY);
    };

    const onDragEnd = (result) => {
        cancelSpring();
        if (!result.destination) return;
        setTranslateServiceInstanceList(reorderLayout(layout, result.source.index, result.destination.index));
    };

    useEffect(() => cancelSpring, []);
    // 是否自动关闭窗口
    useEffect(() => {
        if (closeOnBlur !== null && !closeOnBlur) {
            unlistenBlur();
        }
    }, [closeOnBlur]);
    // 是否默认置顶
    useEffect(() => {
        if (alwaysOnTop !== null && alwaysOnTop) {
            appWindow.setAlwaysOnTop(true);
            unlistenBlur();
            setPined(true);
        }
    }, [alwaysOnTop]);
    // 保存窗口位置
    useEffect(() => {
        if (windowPosition !== null && windowPosition === 'pre_state') {
            const unlistenMove = listen('tauri://move', async () => {
                if (moveTimeout) {
                    clearTimeout(moveTimeout);
                }
                moveTimeout = setTimeout(async () => {
                    if (appWindow.label === 'translate') {
                        let position = await appWindow.outerPosition();
                        const monitor = await currentMonitor();
                        const factor = monitor.scaleFactor;
                        position = position.toLogical(factor);
                        await store.set('translate_window_position_x', parseInt(position.x));
                        await store.set('translate_window_position_y', parseInt(position.y));
                        await store.save();
                    }
                }, 100);
            });
            return () => {
                unlistenMove.then((f) => {
                    f();
                });
            };
        }
    }, [windowPosition]);
    // 保存窗口大小
    useEffect(() => {
        if (rememberWindowSize !== null && rememberWindowSize) {
            const unlistenResize = listen('tauri://resize', async () => {
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                }
                resizeTimeout = setTimeout(async () => {
                    if (appWindow.label === 'translate') {
                        let size = await appWindow.outerSize();
                        const monitor = await currentMonitor();
                        const factor = monitor.scaleFactor;
                        size = size.toLogical(factor);
                        await store.set('translate_window_height', parseInt(size.height));
                        await store.set('translate_window_width', parseInt(size.width));
                        await store.save();
                    }
                }, 100);
            });
            return () => {
                unlistenResize.then((f) => {
                    f();
                });
            };
        }
    }, [rememberWindowSize]);

    const loadPluginList = async () => {
        const serviceTypeList = ['translate', 'tts', 'recognize', 'collection'];
        let temp = {};
        for (const serviceType of serviceTypeList) {
            temp[serviceType] = {};
            if (await exists(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig })) {
                const plugins = await readDir(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig });
                for (const plugin of plugins) {
                    const infoStr = await readTextFile(`plugins/${serviceType}/${plugin.name}/info.json`, {
                        dir: BaseDirectory.AppConfig,
                    });
                    let pluginInfo = JSON.parse(infoStr);
                    if ('icon' in pluginInfo) {
                        const appConfigDirPath = await appConfigDir();
                        const iconPath = await join(
                            appConfigDirPath,
                            `/plugins/${serviceType}/${plugin.name}/${pluginInfo.icon}`
                        );
                        pluginInfo.icon = convertFileSrc(iconPath);
                    }
                    temp[serviceType][plugin.name] = pluginInfo;
                }
            }
        }
        setPluginList({ ...temp });
    };

    useEffect(() => {
        loadPluginList();
        if (!unlisten) {
            unlisten = listen('reload_plugin_list', loadPluginList);
        }
    }, []);

    const loadServiceInstanceConfigMap = async () => {
        const config = {};
        for (const serviceInstanceKey of translateServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        for (const serviceInstanceKey of recognizeServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        for (const serviceInstanceKey of ttsServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        for (const serviceInstanceKey of collectionServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        setServiceInstanceConfigMap({ ...config });
    };
    useEffect(() => {
        if (
            translateServiceInstanceList !== null &&
            recognizeServiceInstanceList !== null &&
            ttsServiceInstanceList !== null &&
            collectionServiceInstanceList !== null
        ) {
            loadServiceInstanceConfigMap();
        }
    }, [
        translateServiceInstanceList,
        recognizeServiceInstanceList,
        ttsServiceInstanceList,
        collectionServiceInstanceList,
    ]);

    return (
        pluginList && (
            <div
                className={`bg-background h-screen w-screen ${
                    osType === 'Linux' && 'rounded-[10px] border-1 border-default-100'
                }`}
            >
                <div
                    className='fixed top-[5px] left-[5px] right-[5px] h-[30px]'
                    data-tauri-drag-region='true'
                />
                <div className={`h-[35px] w-full flex ${osType === 'Darwin' ? 'justify-end' : 'justify-between'}`}>
                    <Button
                        isIconOnly
                        size='sm'
                        variant='flat'
                        disableAnimation
                        className='my-auto bg-transparent'
                        onPress={() => {
                            if (pined) {
                                if (closeOnBlur) {
                                    unlisten = listenBlur();
                                }
                                appWindow.setAlwaysOnTop(false);
                            } else {
                                unlistenBlur();
                                appWindow.setAlwaysOnTop(true);
                            }
                            setPined(!pined);
                        }}
                    >
                        <BsPinFill className={`text-[20px] ${pined ? 'text-primary' : 'text-default-400'}`} />
                    </Button>
                    <Button
                        isIconOnly
                        size='sm'
                        variant='flat'
                        disableAnimation
                        className={`my-auto ${osType === 'Darwin' && 'hidden'} bg-transparent`}
                        onPress={() => {
                            void appWindow.close();
                        }}
                    >
                        <AiFillCloseCircle className='text-[20px] text-default-400' />
                    </Button>
                </div>
                <div className={`${osType === 'Linux' ? 'h-[calc(100vh-37px)]' : 'h-[calc(100vh-35px)]'} px-[8px]`}>
                    <div className='h-full overflow-y-auto'>
                        <div>
                            {serviceInstanceConfigMap !== null && (
                                <SourceArea
                                    pluginList={pluginList}
                                    serviceInstanceConfigMap={serviceInstanceConfigMap}
                                />
                            )}
                        </div>
                        <div className={`${hideLanguage && 'hidden'}`}>
                            <LanguageArea />
                            <Spacer y={2} />
                        </div>
                        <DragDropContext
                            onDragEnd={onDragEnd}
                            onDragUpdate={onDragUpdate}
                        >
                            <Droppable
                                droppableId='droppable'
                                direction='vertical'
                            >
                                {(provided) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                    >
                                        {layout.map((slot) => {
                                            if (slot.kind === 'hidden') return null;

                                            const renderTargetArea = (dragHandleProps) => (
                                                <TargetArea
                                                    {...dragHandleProps}
                                                    index={serviceIndexMap[slot.keys[0]]}
                                                    name={slot.keys[0]}
                                                    translateServiceInstanceList={translateServiceInstanceList}
                                                    pluginList={pluginList}
                                                    serviceInstanceConfigMap={serviceInstanceConfigMap}
                                                    isPaused={validPausedServices.includes(slot.keys[0])}
                                                    onTogglePause={togglePauseService}
                                                />
                                            );

                                            if (slot.kind === 'runHeader') {
                                                return (
                                                    <div key={`header:${slot.runId}`}>
                                                        <PausedRunGroup
                                                            count={slot.memberKeys.length}
                                                            isExpanded
                                                            onToggle={() => toggleRun(slot.runId)}
                                                        />
                                                        <Spacer y={2} />
                                                    </div>
                                                );
                                            }

                                            const draggableId = slotDraggableId(slot);

                                            return (
                                                <Draggable
                                                    key={draggableId}
                                                    draggableId={draggableId}
                                                    index={slot.draggableIndex}
                                                >
                                                    {(provided) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                        >
                                                            {slot.kind === 'collapsedRun' ? (
                                                                <PausedRunGroup
                                                                    {...provided.dragHandleProps}
                                                                    count={slot.memberKeys.length}
                                                                    isExpanded={false}
                                                                    onToggle={() => toggleRun(slot.runId)}
                                                                />
                                                            ) : slot.kind === 'runMember' ? (
                                                                <div className='pl-[16px]'>
                                                                    {renderTargetArea(provided.dragHandleProps)}
                                                                </div>
                                                            ) : (
                                                                renderTargetArea(provided.dragHandleProps)
                                                            )}
                                                            <Spacer y={2} />
                                                        </div>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>
                </div>
            </div>
        )
    );
}
