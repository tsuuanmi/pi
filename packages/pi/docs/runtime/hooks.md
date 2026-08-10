# Hook architecture

Pi uses separate hook layers for agent execution, orchestration, and host extensions. Each layer owns the event payload it defines and exposes only the registration surface required by its consumers.

## Package boundaries

```text
@tsuuanmi/pi-ai
        |
@tsuuanmi/pi-agent
        |
@tsuuanmi/pi-orchestrator

@tsuuanmi/pi is the composition root. It integrates these packages and owns
extension loading, session state, and UI context.
```

Pi exposes only public host contracts to package extensions. Pi source does not import package implementations.

## Ownership

| Layer | Owns | Registration surface |
| --- | --- | --- |
| `@tsuuanmi/pi-agent` | Agent lifecycle and execution hooks | `Agent.registerHook()` and `Agent.subscribe()` |
| `@tsuuanmi/pi-orchestrator` | Task, team, retry, verification, progress, and trace hooks | Orchestrator configuration and events |
| `@tsuuanmi/pi` | Extension loading, session/UI context, and dynamic extension events | Public `ExtensionAPI` from `@tsuuanmi/pi/extensions`; private lifecycle and hook subsystems |

## Agent hooks

`@tsuuanmi/pi-agent` exposes host-neutral hooks through `AgentHook`:

```typescript
const removeHook = agent.registerHook({
  name: "policy",
  beforeToolCall: async (context) => {
    if (context.toolCall.name === "dangerous") {
      return { block: true, reason: "Operation blocked" };
    }
    return undefined;
  },
});

removeHook();
```

Hooks run in registration order. Hook names must be unique for an agent. The registration is scoped to the agent and is copied into isolated `agent.run()` instances. `Agent.subscribe()` remains the event-observation API; subscriptions stay attached to the agent instance on which they were registered.

Agent hooks may handle:

- isolated run lifecycle (`beforeRun`, `afterRun`);
- tool-call policy and result transformation (`beforeToolCall`, `afterToolCall`);
- next-turn updates (`prepareNextTurn`).

The agent package does not know about sessions, extensions, TUI state, or package loading.

## Pi extension hooks

Pi exposes `ExtensionAPI` through `@tsuuanmi/pi/extensions`. The lifecycle runner and hook dispatcher are private host implementation details; the event bus is available only through the extension contract.

Pi bridges extension tool events into the agent with an agent hook registration. The bridge is an adapter; `pi-agent` does not import extension types.

Extension events that require host context remain in Pi, including session lifecycle, UI updates, resource discovery, and extension loading. The private hook subsystem owns dynamic handler registration, ordering, transformation, and errors; the private lifecycle runner owns activation and disposal.

## Package registration

Package code registers domain capabilities through the public `ExtensionAPI` contract. The package manifest declares the compiled entry point and resources; Pi's resource loader resolves the manifest and invokes the extension factory without knowing the package's policy.

Package extensions can register domain-owned status data through `ExtensionAPI.registerHudProvider`; Pi remains responsible for aggregation and rendering.

## Orchestration hooks

`@tsuuanmi/pi-orchestrator` owns task and team lifecycle hooks. These hooks operate on orchestration concepts such as task identity, verification, retry policy, checkpoints, trace events, and dispatch state.

They must not depend on `ExtensionAPI`, `ExtensionRunner`, session managers, or TUI types. The Pi composition root may forward orchestration events to extensions or UI components through an adapter.

## Execution rules

- **Observers** notify consumers and do not return execution decisions.
- **Before hooks** run in registration order; a blocking result stops the phase.
- **After hooks** receive the result produced by the previous hook and may transform it.
- **Policy failures** fail closed and prevent the protected operation from proceeding.
- **Lifecycle registrations** return disposers and are scoped to an agent, run, orchestrator, session, or extension instance.
- **No global hook singleton** is used; the composition root passes explicit hosts and registrars.

## Non-goals

- `pi-agent` is not an extension registry.
- `pi-orchestrator` is not a general-purpose hook package.
- Package extensions do not own Pi session or UI infrastructure.
- Pi does not move package policy into the core agent runtime.
