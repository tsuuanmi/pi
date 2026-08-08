import { startWorker } from "../../worker/entry.ts";
import { chatGptWebProvider } from "./index.ts";

startWorker(chatGptWebProvider);
