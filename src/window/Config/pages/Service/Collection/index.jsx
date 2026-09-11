import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Card, Spacer, Button, useDisclosure } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useToastStyle } from '../../../../../hooks';
import SelectPluginModal from '../SelectPluginModal';
import { osType } from '../../../../../utils/env';
import { deleteKey } from '../../../../../hooks';
import { cloneServiceInstance as cloneServiceInstanceConfig } from '../../../../../utils/clone_service_instance';
import { useServiceInstanceList } from '../useServiceInstanceList';
import { createServiceListReorder } from '../service_list_reorder';
import ServiceItem from './ServiceItem';
import SelectModal from './SelectModal';
import ConfigModal from './ConfigModal';

const SERVICE_LIST_KEY = 'collection_service_list';

export default function Collection(props) {
    const { pluginList } = props;
    const {
        isOpen: isSelectPluginOpen,
        onOpen: onSelectPluginOpen,
        onOpenChange: onSelectPluginOpenChange,
    } = useDisclosure();
    const { isOpen: isSelectOpen, onOpen: onSelectOpen, onOpenChange: onSelectOpenChange } = useDisclosure();
    const { isOpen: isConfigOpen, onOpen: onConfigOpen, onOpenChange: onConfigOpenChange } = useDisclosure();
    const [currentConfigKey, setCurrentConfigKey] = useState('anki');
    // now it's service instance list
    const [collectionServiceInstanceList, updateCollectionServiceInstanceList, runCollectionServiceListOperation] =
        useServiceInstanceList(SERVICE_LIST_KEY, []);

    const { t } = useTranslation();
    const toastStyle = useToastStyle();
    const showListSaveError = () => {
        toast.error(t('common.service_list_save_failed', { defaultValue: 'Could not save service list.' }), {
            style: toastStyle,
        });
    };

    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const reorderCurrentList = createServiceListReorder(collectionServiceInstanceList, result);
        await updateCollectionServiceInstanceList(reorderCurrentList).catch(showListSaveError);
    };

    const deleteServiceInstance = async (instanceKey) => {
        await runCollectionServiceListOperation(async ({ getCurrentList, persistCurrentList }) => {
            const currentList = getCurrentList() ?? [];
            await persistCurrentList(currentList.filter((x) => x !== instanceKey));
            deleteKey(instanceKey);
        }).catch(showListSaveError);
    };
    const updateServiceInstanceList = (instanceKey) =>
        updateCollectionServiceInstanceList((currentList) =>
            currentList.includes(instanceKey) ? currentList : [...currentList, instanceKey]
        ).catch(showListSaveError);
    const cloneServiceInstance = (instanceKey) =>
        runCollectionServiceListOperation(({ getCurrentList, publishCurrentList }) =>
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

    return (
        <>
            <Toaster />
            <Card
                className={`${
                    osType === 'Linux' ? 'h-[calc(100vh-140px)]' : 'h-[calc(100vh-120px)]'
                } overflow-y-auto p-5 flex justify-between`}
            >
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
                                {collectionServiceInstanceList !== null &&
                                    collectionServiceInstanceList.map((x, i) => {
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
                pluginType='collection'
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
