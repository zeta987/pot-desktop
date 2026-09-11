import * as builtinServices from '../../../services/recognize';
import { osType } from '../../../utils/env';
import {
    getDisplayInstanceName,
    getServiceName,
    getServiceSouceType,
    INSTANCE_NAME_CONFIG_KEY,
    ServiceSourceType,
} from '../../../utils/service_instance';

export function getRecognitionServiceMetadata(instanceKey, serviceInstanceConfigMap, pluginList, t) {
    const serviceName = getServiceName(instanceKey);
    const instanceConfig = serviceInstanceConfigMap?.[instanceKey] ?? {};
    const isPlugin = getServiceSouceType(instanceKey) === ServiceSourceType.PLUGIN;
    const service = isPlugin ? pluginList?.[serviceName] : builtinServices[serviceName];
    const defaultName = isPlugin
        ? service?.display || instanceKey
        : service
          ? t(`services.recognize.${serviceName}.title`, { defaultValue: instanceKey })
          : instanceKey;
    const icon = service?.icon ?? service?.info?.icon;

    return {
        displayName: getDisplayInstanceName(instanceConfig[INSTANCE_NAME_CONFIG_KEY], () => defaultName),
        icon: icon === 'system' ? `logo/${osType}.svg` : icon,
    };
}
