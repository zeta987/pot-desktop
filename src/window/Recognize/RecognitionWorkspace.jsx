import React, { useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { useConfig } from '../../hooks/useConfig';
import ControlArea from './ControlArea';
import ImageArea, { imageAtom } from './ImageArea';
import TextArea from './TextArea';
import { getAutoRecognitionServices } from './utils/recognition_selection';

export default function RecognitionWorkspace(props) {
    const [automaticServices] = useConfig('recognize_auto_service_list', props.serviceInstanceList.slice(0, 1));
    const [recognizeLanguage] = useConfig('recognize_language', 'auto');

    // The session's local selection is initialized exactly once, after both settings load.
    if (automaticServices === null || recognizeLanguage === null) return null;
    return (
        <RecognitionSession
            {...props}
            automaticServices={automaticServices}
            recognizeLanguage={recognizeLanguage}
        />
    );
}

function RecognitionSession({
    serviceInstanceList,
    serviceInstanceConfigMap,
    pluginList,
    automaticServices,
    recognizeLanguage,
}) {
    const [selection, setSelection] = useState(() =>
        getAutoRecognitionServices(serviceInstanceList, automaticServices)
    );
    const [primaryServiceKey] = useState(() => getAutoRecognitionServices(serviceInstanceList, automaticServices)[0]);
    const [language, setLanguage] = useState(recognizeLanguage);
    const [recognizeFlag, setRecognizeFlag] = useState(0);
    const image = useAtomValue(imageAtom);
    const { t } = useTranslation();
    const selectedServiceKeys = getAutoRecognitionServices(serviceInstanceList, selection);

    return (
        <div className='flex min-h-0 flex-1 flex-col'>
            <div className='grid min-h-0 flex-1 grid-cols-2 max-[540px]:grid-cols-1 max-[540px]:grid-rows-[minmax(0,1fr)_minmax(0,2fr)] max-[540px]:gap-y-2'>
                <div className='min-h-0 min-w-0'>
                    <ImageArea hasSelectedServices={selectedServiceKeys.length > 0} />
                </div>
                <div className='flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto ml-[6px] mr-[12px] max-[540px]:ml-[12px]'>
                    {selectedServiceKeys.length === 0 ? (
                        <p className='m-auto p-3 text-sm text-default-600'>{t('recognize.no_services_selected')}</p>
                    ) : (
                        selectedServiceKeys.map((serviceInstanceKey) => (
                            <TextArea
                                key={serviceInstanceKey}
                                serviceInstanceKey={serviceInstanceKey}
                                serviceInstanceConfigMap={serviceInstanceConfigMap}
                                pluginList={pluginList}
                                language={language}
                                recognizeFlag={recognizeFlag}
                                isPrimary={serviceInstanceKey === primaryServiceKey}
                                fillHeight={selectedServiceKeys.length === 1}
                            />
                        ))
                    )}
                </div>
            </div>
            <ControlArea
                serviceInstanceList={serviceInstanceList}
                serviceInstanceConfigMap={serviceInstanceConfigMap}
                pluginList={pluginList}
                selectedServiceKeys={selectedServiceKeys}
                onSelectionChange={setSelection}
                language={language}
                onLanguageChange={setLanguage}
                onRecognize={() => setRecognizeFlag((flag) => flag + 1)}
                canRecognize={Boolean(image.base64) && selectedServiceKeys.length > 0}
            />
        </div>
    );
}
