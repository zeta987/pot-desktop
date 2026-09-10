import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Card, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useToastStyle } from '../../../../../hooks';
import SelectPluginModal from '../SelectPluginModal';
import { osType } from '../../../../../utils/env';
import { useConfig, deleteKey } from '../../../../../hooks';
import { getAutoRecognitionServices } from '../../../../Recognize/utils/recognition_selection';
import ServiceItem from './ServiceItem';
import SelectModal from './SelectModal';
import ConfigModal from './ConfigModal';

export default function Recognize(props) {
    const [recognizeServiceInstanceList, setRecognizeServiceInstanceList] = useConfig('recognize_service_list', [
        'system',
        'tesseract',
    ]);

    return (
        recognizeServiceInstanceList !== null && (
            <RecognizeSettings
                {...props}
                recognizeServiceInstanceList={recognizeServiceInstanceList}
                setRecognizeServiceInstanceList={setRecognizeServiceInstanceList}
            />
        )
    );
}

function RecognizeSettings(props) {
    const { pluginList, recognizeServiceInstanceList, setRecognizeServiceInstanceList } = props;
    const {
        isOpen: isSelectPluginOpen,
        onOpen: onSelectPluginOpen,
        onOpenChange: onSelectPluginOpenChange,
    } = useDisclosure();
    const { isOpen: isSelectOpen, onOpen: onSelectOpen, onOpenChange: onSelectOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const [currentConfigKey, setCurrentConfigKey] = useState('system');
    const [recognizeAutoServiceInstanceList, setRecognizeAutoServiceInstanceList] = useConfig(
        'recognize_auto_service_list',
        recognizeServiceInstanceList.slice(0, 1)
    );

    const { t } = useTranslation();
    const toastStyle = useToastStyle();

    if (recognizeAutoServiceInstanceList === null) return null;
    const activeAutoKeys = getAutoRecognitionServices(recognizeServiceInstanceList, recognizeAutoServiceInstanceList);

    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };
    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const items = reorder(recognizeServiceInstanceList, result.source.index, result.destination.index);
        setRecognizeServiceInstanceList(items);
        setRecognizeAutoServiceInstanceList(getAutoRecognitionServices(items, activeAutoKeys));
    };

    const deleteServiceInstance = (instanceKey) => {
        if (recognizeServiceInstanceList.length === 1) {
            toast.error(t('config.service.least'), { style: toastStyle });
            return;
        } else {
            const serviceInstanceList = recognizeServiceInstanceList.filter((x) => x !== instanceKey);
            setRecognizeServiceInstanceList(serviceInstanceList);
            setRecognizeAutoServiceInstanceList(getAutoRecognitionServices(serviceInstanceList, activeAutoKeys));
            deleteKey(instanceKey);
        }
    };
    const updateServiceInstanceList = (instanceKey) => {
        if (recognizeServiceInstanceList.includes(instanceKey)) {
            return;
        } else {
            const newList = [...recognizeServiceInstanceList, instanceKey];
            setRecognizeServiceInstanceList(newList);
        }
    };
    const updateAutoServiceInstanceList = (instanceKey, enabled) => {
        const autoServiceInstanceList = new Set(activeAutoKeys);
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
