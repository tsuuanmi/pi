export function accountProviderName(prefix: string, accountId: string): string {
	return accountId === "default" ? prefix : `${prefix}-${accountId}`;
}
