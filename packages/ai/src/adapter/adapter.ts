import type { Model } from "#ai/model/index";
import type { Context } from "#ai/protocol/context";
import type { Api } from "#ai/protocol/ids";
import type { AssistantMessage } from "#ai/protocol/message";
import type { StreamOptions } from "#ai/protocol/options";
import { complete, stream } from "#ai/stream";
import type { AssistantMessageEventStream } from "#ai/transport/event-stream";

export interface AdapterConfig<TApi extends Api = Api> {
	model: Model<TApi>;
}

export class Adapter<TApi extends Api = Api> {
	readonly model: Model<TApi>;

	constructor(config: AdapterConfig<TApi>) {
		this.model = config.model;
	}

	stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
		return stream(this.model, context, options);
	}

	complete(context: Context, options?: StreamOptions): Promise<AssistantMessage> {
		return complete(this.model, context, options);
	}
}
