# Changelog

## Unreleased

### Changed

- Replaced the ChatGPT selector loop with exact prompt insertion, semantic effort selection, attachment readiness, submission evidence, response-scoped Markdown and reasoning streaming, stable completion, and fail-closed DOM health checks.
- Split ChatGPT browser automation into focused composer, effort, attachment, submission, response, Markdown, trace, completion, stream, and turn modules.
- Limited the built-in ChatGPT provider's advertised output to implemented text and visible reasoning capabilities.
- Updated Pi's web stream adapter to preserve provider content order and withhold Pi tools from routes that do not advertise tool output.

### Removed

- Removed the one-shot effort click and assistant `innerText` polling path.
