import { setRegisteredThemes } from "@tsuuanmi/pi-tui";
import { loadBuiltinThemes } from "../src/loader/themes/index.ts";

setRegisteredThemes(loadBuiltinThemes());
