# Node.js Execution Environment

The `NodeExecutionEnv` provides the default execution environment for the agent harness in Node.js.

## `NodeExecutionEnv`

```typescript
class NodeExecutionEnv implements ExecutionEnv {
  // File system operations
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listDirectory(path: string): Promise<FileInfo[]>
  stat(path: string): Promise<FileInfo>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  remove(path: string): Promise<void>

  // Shell execution
  exec(command: string, options?: ExecutionEnvExecOptions): Promise<ExecutionResult>
}
```

Provides real filesystem and shell operations using Node.js `fs` and `child_process` modules. This is the default environment used by `AgentHarness` when running outside a sandbox.