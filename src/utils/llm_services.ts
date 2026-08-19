import { getServiceName } from './service_instance';

const LLM_SERVICE_NAMES = new Set(['openai', 'chatglm', 'geminipro', 'ollama']);

export function isLlmService(serviceInstanceKey: string): boolean {
    return LLM_SERVICE_NAMES.has(getServiceName(serviceInstanceKey));
}
