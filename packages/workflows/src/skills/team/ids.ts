export function assertSafeId(label: string, value: string): void {
	if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(value) || value.includes("..")) {
		throw new Error(`invalid ${label}: ${value}`);
	}
}

export function slugifyTeamId(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40)
		.replace(/-$/, "");
	if (!slug) throw new Error("team task must contain characters usable in a team id");
	return slug;
}
