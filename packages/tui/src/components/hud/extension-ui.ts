export async function refreshHudUi(ctx: {
	ui?: { setStatus?: (key: string, text: string | undefined) => void };
}): Promise<void> {
	// Extension status updates trigger a render in Pi's extension UI controller.
	// Clearing this private refresh key gives HUD producers a generic way to ask
	// the host to redraw without adding visible status text.
	ctx.ui?.setStatus?.("__hud_refresh__", undefined);
}
