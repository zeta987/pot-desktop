import {
    Button,
    Checkbox,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@nextui-org/react';
import React, { useState } from 'react';
import { GiCycle } from 'react-icons/gi';
import { useTranslation } from 'react-i18next';

import { languageList } from '../../../utils/language';
import { getRecognitionServiceMetadata } from '../utils/recognition_service';

export default function ControlArea({
    serviceInstanceList,
    serviceInstanceConfigMap,
    pluginList,
    selectedServiceKeys,
    onSelectionChange,
    language,
    onLanguageChange,
    onRecognize,
    canRecognize,
}) {
    const { t } = useTranslation();
    const [searchText, setSearchText] = useState('');
    const selectedKeys = new Set(selectedServiceKeys ?? []);
    const query = searchText.trim().toLowerCase();
    const filteredServiceInstanceList = serviceInstanceList.filter((instanceKey) => {
        if (!query) return true;
        const { displayName } = getRecognitionServiceMetadata(instanceKey, serviceInstanceConfigMap, pluginList, t);
        return [displayName, instanceKey].some((value) => value.toLowerCase().includes(query));
    });

    return (
        <div className='flex shrink-0 flex-wrap items-center gap-2 px-3 py-2'>
            <Popover placement='bottom-start'>
                <PopoverTrigger>
                    <Button
                        aria-label={t('recognize.temporary_services')}
                        size='sm'
                        variant='bordered'
                    >
                        {t('recognize.temporary_services')} ({selectedKeys.size})
                    </Button>
                </PopoverTrigger>
                <PopoverContent className='w-[280px] p-2'>
                    <div className='flex w-full flex-col gap-2'>
                        <Input
                            aria-label={t('recognize.search_services', { defaultValue: 'Search services' })}
                            isClearable
                            onClear={() => setSearchText('')}
                            onValueChange={setSearchText}
                            placeholder={t('recognize.search_services', { defaultValue: 'Search services' })}
                            size='sm'
                            value={searchText}
                            variant='bordered'
                        />
                        <div
                            aria-label={t('recognize.temporary_services')}
                            className='flex max-h-[60vh] flex-col gap-1 overflow-y-auto'
                            role='group'
                        >
                            {filteredServiceInstanceList.length === 0 ? (
                                <p
                                    className='py-4 text-center text-xs text-default-400'
                                    role='status'
                                >
                                    {t('recognize.no_services_found', { defaultValue: 'No matching services' })}
                                </p>
                            ) : (
                                filteredServiceInstanceList.map((instanceKey) => {
                                    const { displayName, icon } = getRecognitionServiceMetadata(
                                        instanceKey,
                                        serviceInstanceConfigMap,
                                        pluginList,
                                        t
                                    );
                                    return (
                                        <Checkbox
                                            aria-label={displayName}
                                            classNames={{
                                                base: 'm-0 max-w-full rounded-lg p-1 hover:bg-default-100',
                                                label: 'flex items-center gap-1.5 truncate text-sm',
                                            }}
                                            isSelected={selectedKeys.has(instanceKey)}
                                            key={instanceKey}
                                            onValueChange={(checked) => {
                                                const nextSelectedKeys = new Set(selectedKeys);
                                                if (checked) {
                                                    nextSelectedKeys.add(instanceKey);
                                                } else {
                                                    nextSelectedKeys.delete(instanceKey);
                                                }
                                                onSelectionChange(Array.from(nextSelectedKeys));
                                            }}
                                            size='sm'
                                        >
                                            {icon ? (
                                                <img
                                                    alt=''
                                                    className='my-auto h-[16px] w-[16px] shrink-0'
                                                    src={icon}
                                                />
                                            ) : null}
                                            <span className='truncate'>{displayName}</span>
                                        </Checkbox>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
            <span className='order-last basis-full text-tiny text-default-500'>
                {t('recognize.temporary_services_hint')}
            </span>
            {language && (
                <Dropdown>
                    <DropdownTrigger>
                        <Button
                            aria-label={t('config.recognize.language')}
                            size='sm'
                            variant='bordered'
                        >
                            {t(`languages.${language}`)}
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                        aria-label={t('config.recognize.language')}
                        className='max-h-[70vh] overflow-y-auto'
                        onAction={onLanguageChange}
                    >
                        <DropdownItem key='auto'>{t('languages.auto')}</DropdownItem>
                        {languageList.map((name) => (
                            <DropdownItem key={name}>{t(`languages.${name}`)}</DropdownItem>
                        ))}
                    </DropdownMenu>
                </Dropdown>
            )}
            <Button
                aria-label={t('recognize.recognize_all')}
                className='ml-auto'
                color='secondary'
                isDisabled={!canRecognize}
                onPress={onRecognize}
                size='sm'
                startContent={<GiCycle className='text-[16px]' />}
                variant='flat'
            >
                {t('recognize.recognize_all')}
            </Button>
        </div>
    );
}
