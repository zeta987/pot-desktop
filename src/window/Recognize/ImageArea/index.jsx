import { Card, CardBody, CardFooter, Button, Tooltip } from '@nextui-org/react';
import { appWindow } from '@tauri-apps/api/window';
import React, { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { MdContentCopy } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api';
import { atom, useAtom } from 'jotai';

import { useConfig } from '../../../hooks/useConfig';

export const imageAtom = atom({ id: null, base64: '' });
export const base64Atom = atom((get) => get(imageAtom).base64);

export default function ImageArea({ hasSelectedServices = true }) {
    const [hideWindow] = useConfig('recognize_hide_window', false);
    const [image, setImage] = useAtom(imageAtom);
    const [error, setError] = useState('');
    const imgRef = useRef();
    const { t } = useTranslation();

    useEffect(() => {
        let disposed = false;
        let currentLoad;
        const loadImage = async () => {
            const id = {};
            currentLoad = id;
            // Invalidate OCR immediately, including while get_base64 is pending.
            setImage({ id, base64: '' });
            setError('');
            try {
                const base64 = await invoke('get_base64');
                if (!disposed && currentLoad === id) {
                    setImage({ id, base64 });
                }
            } catch (failure) {
                if (!disposed && currentLoad === id) {
                    setError(String(failure));
                }
            }
        };
        const unlisten = listen('new_image', loadImage);
        void loadImage();
        return () => {
            disposed = true;
            unlisten.then((stop) => stop());
        };
    }, [setImage]);

    useEffect(() => {
        if (hideWindow === null || image.id === null) return;
        const updateVisibility = async () => {
            if (hideWindow && hasSelectedServices && !error) {
                await appWindow.hide();
            } else {
                await appWindow.show();
                await appWindow.setFocus(true);
            }
        };
        void updateVisibility().catch((failure) => console.error(failure));
    }, [image.id, hideWindow, hasSelectedServices, error]);

    return (
        <Card
            shadow='none'
            className='bg-content1 h-full ml-[12px] mr-[6px] max-[540px]:mr-[12px]'
            radius='10'
        >
            <CardBody className='bg-content1 h-full p-0'>
                {image.base64 !== '' && (
                    <img
                        ref={imgRef}
                        alt={t('recognize.copy_img')}
                        draggable={false}
                        className='object-contain h-full w-full'
                        src={'data:image/png;base64,' + image.base64}
                    />
                )}
                {error && <p className='m-3 text-danger'>{t('recognize.image_load_failed', { error })}</p>}
            </CardBody>
            <CardFooter className='bg-content1 flex justify-start px-[12px]'>
                <Tooltip content={t('recognize.copy_img')}>
                    <Button
                        isIconOnly
                        aria-label={t('recognize.copy_img')}
                        isDisabled={!image.base64}
                        size='sm'
                        variant='light'
                        onPress={async () => {
                            await invoke('copy_img', {
                                width: imgRef.current.naturalWidth,
                                height: imgRef.current.naturalHeight,
                            });
                        }}
                    >
                        <MdContentCopy className='text-[16px]' />
                    </Button>
                </Tooltip>
            </CardFooter>
        </Card>
    );
}
