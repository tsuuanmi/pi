# Workflow Tool Details

Model-visible workflow tools return `WorkflowToolDetails` from `src/tool/details.ts`.

Tool details contain the operation result and an assembled final package. They are not durable receipts and do not own receipt identifiers, timing, provenance, or persistence. Durable workflow runtime receipts are represented by `WorkflowRuntimeReceipt`; Agent structured execution receipts are owned by `@tsuuanmi/pi-agent`.
