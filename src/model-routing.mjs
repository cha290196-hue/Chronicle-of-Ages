export const FLASH_MODEL='deepseek-flash';
/** Migrate the retired project preset without changing keys, endpoint or image model. */
export function migrateTextModel(model){
 const value=String(model||'').trim();
 if(/^deepseek-v4-pro$/i.test(value))return FLASH_MODEL;
 if(/^deepseek\/deepseek-v4-pro$/i.test(value))return 'deepseek/deepseek-v4-flash';
 return value;
}
export function inferenceModelConfig(config){
 let official=false;try{official=new URL(config?.endpoint).hostname==='api.deepseek.com';}catch{}
 return official?{...config,provider:'deepseek',model:FLASH_MODEL}:{...config,model:migrateTextModel(config?.model)};
}
