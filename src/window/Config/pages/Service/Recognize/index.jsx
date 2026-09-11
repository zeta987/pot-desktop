import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Card, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useRef, useState } from 'react';

import { useToastStyle } from '../../../../../hooks';
import SelectPluginModal from '../SelectPluginModal';
import { osType } from '../../../../../utils/env';
import { useConfig, deleteKey } from '../../../../../hooks';
import { cloneServiceInstance as cloneServiceInstanceConfig } from '../../../../../utils/clone_service_instance';
import { getAutoRecognitionServices } from '../../../../Recognize/utils/recognition_selection';
import { useServiceInstanceList } from '../useServiceInstanceList';
import { createServiceListReorder } from '../service_list_reorder';
import ServiceItem from './ServiceItem';
import SelectModal from './SelectModal';
import ConfigModal from './ConfigModal';

const SERVICE_LIST_KEY = 'recognize_service_list';

export default function Recognize(props) {
    const [recognizeServiceInstanceList, updateRecognizeServiceInstanceList, runRecognizeServiceListOperation] =
        useServiceInstanceList(SERVICE_LIST_KEY, ['system', 'tesseract']);

    return (
        recognizeServiceInstanceList !== null && (
            <RecognizeSettings
                {...props}
                recognizeServiceInstanceList={recognizeServiceInstanceList}
                updateRecognizeServiceInstanceList={updateRecognizeServiceInstanceList}
                runRecognizeServiceListOperation={runRecognizeServiceListOperation}
            />
        )
    );
}

function RecognizeSettings(props) {
    const {
        pluginList,
        recognizeServiceInstanceList,
        updateRecognizeServiceInstanceList,
        runRecognizeServiceListOperation,
    } = props;
    const {
        isOpen: isSelectPluginOpen,
        onOpen: onSelectPluginOpen,
        onOpenChange: onSelectPluginOpenChange,
    } = useDisclosure();
    const { isOpen: isSelectOpen, onOpen: onSelectOpen, onOpenChange: onSelectOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const [currentConfigKey, setCurrentConfigKey] = useState('system');
    const [recognizeAutoServiceInstanceList, setRecognizeAutoServiceInstanceListState] = useConfig(
        'recognize_auto_service_list',
        recognizeServiceInstanceList.slice(0, 1)
    );
    const recognizeAutoServiceInstanceListRef = useRef(recognizeAutoServiceInstanceList);
    recognizeAutoServiceInstanceListRef.current = recognizeAutoServiceInstanceList;
    const getRecognizeAutoServiceInstanceList = () => recognizeAutoServiceInstanceListRef.current;
    const setRecognizeAutoServiceInstanceList = (nextList) => {
        recognizeAutoServiceInstanceListRef.current = nextList;
        setRecognizeAutoServiceInstanceListState(nextList);
    };

    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const showListSaveError = () => {
        toast.error(t('common.service_list_save_failed', { defaultValue: 'Could not save service list.' }), {
            style: toastStyle,
        });
    };

    if (recognizeAutoServiceInstanceList === null) return null;
    const activeAutoKeys = getAutoRecognitionServices(recognizeServiceInstanceList, recognizeAutoServiceInstanceList);

    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const reorderCurrentList = createServiceListReorder(recognizeServiceInstanceList, result);
        const items = await updateRecognizeServiceInstanceList(reorderCurrentList).catch(showListSaveError);
        if (items) {
            setRecognizeAutoServiceInstanceList(
                getAutoRecognitionServices(items, getRecognizeAutoServiceInstanceList())
            );
        }
    };

    const deleteServiceInstance = async (instanceKey) => {
        await runRecognizeServiceListOperation(async ({ getCurrentList, persistCurrentList }) => {
            const currentList = getCurrentList() ?? [];
            if (currentList.length === 1) {
                toast.error(t('config.service.least'), { style: toastStyle });
                return;
            }
            const serviceInstanceList = currentList.filter((x) => x !== instanceKey);
            await persistCurrentList(serviceInstanceList);
            setRecognizeAutoServiceInstanceList(
                getAutoRecognitionServices(serviceInstanceList, getRecognizeAutoServiceInstanceList())
            );
            deleteKey(instanceKey);
        }).catch(showListSaveError);
    };
    const updateServiceInstanceList = (instanceKey) =>
        updateRecognizeServiceInstanceList((currentList) =>
            currentList.includes(instanceKey) ? currentList : [...currentList, instanceKey]
        ).catch(showListSaveError);
    const cloneServiceInstance = (instanceKey) =>
        runRecognizeServiceListOperation(({ getCurrentList, publishCurrentList }) =>
            cloneServiceInstanceConfig(instanceKey, {
                listKey: SERVICE_LIST_KEY,
                getCurrentList,
                publishCurrentList,
            })
        ).catch(() => {
            toast.error(t('common.clone_service_failed', { defaultValue: 'Could not duplicate service.' }), {
                style: toastStyle,
            });
        });
    const updateAutoServiceInstanceList = (instanceKey, enabled) => {
        const autoServiceInstanceList = new Set(
            getAutoRecognitionServices(recognizeServiceInstanceList, getRecognizeAutoServiceInstanceList())
        );
        if (enabled) {
            autoServiceInstanceList.add(instanceKey);
        } else {
            autoServiceInstanceList.delete(instanceKey);
        }
        setRecognizeAutoServiceInstanceList(
            getAutoRecognitionServices(recognizeServiceInstanceList, [...autoServiceInstanceList])
        );
    };

    return (
        <>
            <Toaster />
            <Card
                className={`${
                    osType === 'Linux' ? 'h-[calc(100vh-140px)]' : 'h-[calc(100vh-120px)]'
                } overflow-y-auto p-5 flex justify-between`}
            >
                <p className='text-sm text-default-500 mb-4'>{t('recognize.auto_run_hint')}</p>
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable
                        droppableId='droppable'
                        direction='vertical'
                    >
                        {(provided) => (
                            <div
                                className='overflow-y-auto h-full'
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                            >
                                {recognizeServiceInstanceList !== null &&
                                    recognizeServiceInstanceList.map((x, i) => {
                                        return (
                                            <Draggable
                                                key={x}
                                                draggableId={x}
                                                index={i}
                                            >
                                                {(provided) => {
                                                    return (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                        >
                                                            <ServiceItem
                                                                {...provided.dragHandleProps}
                                                                serviceInstanceKey={x}
                                                                key={x}
                                                                pluginList={pluginList}
                                                                deleteServiceInstance={deleteServiceInstance}
                                                                cloneServiceInstance={cloneServiceInstance}
                                                                setCurrentConfigKey={setCurrentConfigKey}
                                                                onConfigOpen={onConfigOpen}
                                                                autoRunEnabled={activeAutoKeys.includes(x)}
                                                                onAutoRunChange={(enabled) =>
                                                                    updateAutoServiceInstanceList(x, enabled)
                                                                }
                                                            />
                                                            <Spacer y={2} />
                                                        </div>
                                                    );
                                                }}
                                            </Draggable>
                                        );
                                    })}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
                <Spacer y={2} />
                <div className='flex'>
                    <Button
                        fullWidth
                        onPress={onSelectOpen}
                    >
                        {t('config.service.add_builtin_service')}
                    </Button>
                    <Spacer x={2} />
                    <Button
                        fullWidth
                        onPress={onSelectPluginOpen}
                    >
                        {t('config.service.add_external_service')}
                    </Button>
                </div>
            </Card>
            <SelectPluginModal
                isOpen={isSelectPluginOpen}
                onOpenChange={onSelectPluginOpenChange}
                setCurrentConfigKey={setCurrentConfigKey}
                onConfigOpen={onConfigOpen}
                pluginType='recognize'
                pluginList={pluginList}
                deleteService={deleteServiceInstance}
            />
            <SelectModal
                isOpen={isSelectOpen}
                onOpenChange={onSelectOpenChange}
                setCurrentConfigKey={setCurrentConfigKey}
                onConfigOpen={onConfigOpen}
            />
            <ConfigModal
                serviceInstanceKey={currentConfigKey}
                isOpen={isConfigOpen}
                pluginList={pluginList}
                onOpenChange={onConfigOpenChange}
                updateServiceInstanceList={updateServiceInstanceList}
            />
        </>
    );
}
