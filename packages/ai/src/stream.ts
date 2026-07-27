import "#ai/provider/built-ins";

import type { Model } from "#ai/model/index";
import type { Context } from "#ai/protocol/context";
import type { Api } from "#ai/protocol/ids";
import type { AssistantMessage } from "#ai/protocol/message";
import type { StreamOptions } from "#ai/protocol/options";
import { getProvider } from "#ai/provider/provider-registry";
import type { AssistantMessageEventStream } from "#ai/transport/event-stream";

function resolveProvider(api: Api) {
	const provider = getProvider(api);
	if (!provider) {
		throw new Error(`No provider registered for api: ${api}`);
	}
	return provider;
}

export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: StreamOptions,
): AssistantMessageEventStream {
	const provider = resolveProvider(model.api);
	return provider.stream(model, context, options);
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: StreamOptions,
): Promise<AssistantMessage> {
	const s = stream(model, context, options);
	return s.result();
}
