import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@nextui-org/react';
import React from 'react';
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
    const selectedKeys = new Set(selectedServiceKeys ?? []);

    return (
        <div className='flex shrink-0 flex-wrap items-center gap-2 px-3 py-2'>
            <Dropdown closeOnSelect={false}>
                <DropdownTrigger>
                    <Button
                        aria-label={t('recognize.temporary_services')}
                        size='sm'
                        variant='bordered'
                    >
                        {t('recognize.temporary_services')} ({selectedKeys.size})
                    </Button>
                </DropdownTrigger>
                <DropdownMenu
                    aria-label={t('recognize.temporary_services')}
                    className='max-h-[70vh] overflow-y-auto'
                    disallowEmptySelection={false}
                    onSelectionChange={(keys) =>
                        onSelectionChange(keys === 'all' ? [...serviceInstanceList] : Array.from(keys))
                    }
                    selectedKeys={selectedKeys}
                    selectionMode='multiple'
                >
                    {serviceInstanceList.map((instanceKey) => {
                        const { displayName, icon } = getRecognitionServiceMetadata(
                            instanceKey,
                            serviceInstanceConfigMap,
                            pluginList,
                            t
                        );
                        return (
                            <DropdownItem
                                key={instanceKey}
                                startContent={
                                    icon ? (
                                        <img
                                            alt=''
                                            className='h-[16px] w-[16px] my-auto'
                                            src={icon}
                                        />
                                    ) : null
                                }
                            >
                                {displayName}
                            </DropdownItem>
                        );
                    })}
                </DropdownMenu>
            </Dropdown>
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
