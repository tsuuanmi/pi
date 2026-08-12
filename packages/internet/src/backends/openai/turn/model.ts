export const CHATGPT_WEB_PROVIDER = "chatgpt-web";
export const CHATGPT_WEB_SOL_MODEL = "chatgpt-web/high";
export const CHATGPT_WEB_LUNA_MODEL = "chatgpt-web/luna";

export function isLunaModel(model: string): boolean {
	return model === CHATGPT_WEB_LUNA_MODEL || model === "gpt-5.6-luna";
}
