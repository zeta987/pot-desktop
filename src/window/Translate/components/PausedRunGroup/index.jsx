import { BiCollapseVertical, BiExpandVertical } from 'react-icons/bi';
import { Button, Card, CardHeader, Tooltip } from '@nextui-org/react';
import { useTranslation } from 'react-i18next';
import React from 'react';

/**
 * The single row that stands in for a Paused Run.
 *
 * Collapsed, the whole header is the drag handle so the run can be moved as one block,
 * and only the arrow button toggles it open. Expanded, the header stays as a plain
 * marker above the run's members and is no longer draggable.
 */
export default function PausedRunGroup(props) {
    const { count, isExpanded, onToggle, ...drag } = props;
    const { t } = useTranslation();

    return (
        <Card
            shadow='none'
            className='rounded-[10px]'
        >
            <CardHeader
                className='flex justify-between py-1 px-0 bg-content2 h-[30px] rounded-[10px] opacity-60'
                {...drag}
            >
                <div className='flex'>
                    <span className='text-[12px] my-auto ml-[12px] select-none'>
                        {t('translate.paused_run', { total: count })}
                    </span>
                </div>
                <div className='flex'>
                    <Tooltip content={t(isExpanded ? 'translate.collapse_paused_run' : 'translate.expand_paused_run')}>
                        <Button
                            isIconOnly
                            variant='light'
                            size='sm'
                            className='h-[20px] w-[20px] my-auto mr-[12px]'
                            onPress={onToggle}
                        >
                            {isExpanded ? (
                                <BiCollapseVertical className='text-[16px]' />
                            ) : (
                                <BiExpandVertical className='text-[16px]' />
                            )}
                        </Button>
                    </Tooltip>
                </div>
            </CardHeader>
        </Card>
    );
}
