# AI Provider Setup

The HRMS no longer depends on OpenAI for KRA AI or task-completion AI.

Set `AI_PROVIDER` to one of:

- `openai`
- `gemini`
- `anthropic`
- `openai-compatible`

## OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_key
AI_MODEL=gpt-4.1-mini
```

## Google Gemini

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
AI_MODEL=gemini-2.0-flash
```

## Anthropic

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key
AI_MODEL=claude-3-5-haiku-latest
```

## OpenAI-compatible providers

This mode works with providers exposing a compatible `/chat/completions` endpoint, including services such as OpenRouter, Groq, Together or a compatible self-hosted gateway, subject to that provider's model/API support.

```env
AI_PROVIDER=openai-compatible
AI_API_KEY=your_key
AI_BASE_URL=https://your-provider.example/v1
AI_MODEL=your-model
```

Only one provider is required. Switching providers does not require frontend code changes or database changes. Restart the backend after changing `.env`.

If the configured provider is unavailable, the HRMS keeps the deterministic fallback for non-strike calculations. A monthly score is not eligible to trigger a performance strike unless the configured AI evaluation succeeds and the KRA configuration/commitments are valid.
