# LLM Providers

Vellicore supports multiple AI backends. Configure your provider in the **Setup** page (first launch) or **Settings → AI Provider** at any time.

---

## Cloud Providers

### Claude (Anthropic)

Models: Haiku, Sonnet, Opus (and newer versions as they're released)

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Select **Claude** as the provider
3. Paste your API key
4. Choose a model — the app fetches available models automatically

**Recommended:** Claude Sonnet offers the best balance of quality and cost for DM responses. Claude Haiku is fast and cheap; Opus is highest quality but expensive.

**Thinking models:** Claude models with extended thinking (if available) are supported and produce noticeably better narrative reasoning, at higher cost and latency.

---

### OpenAI

Models: GPT-4o, GPT-4o-mini, o1, o3, and others

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Select **OpenAI** as the provider
3. Paste your API key
4. Choose a model

---

### Gemini (Google)

Models: Gemini Flash, Gemini Pro, and others

1. Get an API key from [aistudio.google.com](https://aistudio.google.com)
2. Select **Gemini** as the provider
3. Paste your API key
4. Choose a model

---

## Local Providers

Local providers run entirely on your machine — no API key needed, no usage costs, full privacy.

### Ollama

1. Install [Ollama](https://ollama.com)
2. Pull a model: `ollama pull llama3.1` (or any model you prefer)
3. Ollama starts automatically; it serves on `http://localhost:11434` by default
4. In Vellicore, select **Ollama** as the provider
5. The model list is fetched from Ollama automatically

**Model recommendations for DM quality:** Llama 3.1 8B or 70B, Mistral, Qwen2.5 14B+. Smaller models (3B/7B) work but produce lower-quality narrative.

---

### LM Studio

1. Install [LM Studio](https://lmstudio.ai)
2. Download a model via the LM Studio interface
3. Start the local server in LM Studio (defaults to `http://localhost:1234`)
4. In Vellicore, select **LM Studio** as the provider
5. Enter the base URL if you changed the default port

---

### Custom OpenAI-Compatible Endpoint

Any server that implements the OpenAI chat completions API works:

1. Select **OpenAI-compatible** as the provider
2. Enter the base URL (e.g. `http://localhost:8080`)
3. Enter an API key if required (or leave blank)
4. Enter the model name manually

This covers vLLM, text-generation-webui, TabbyAPI, llamafile, and similar servers.

---

## Switching Providers Mid-Campaign

You can switch providers and models at any time in **Settings → AI Provider**. The change takes effect on the next message sent. Campaign history and world state are unaffected.

---

## Context Window Considerations

The DM prompt includes the system prompt (world state, rules, NPC info), recent conversation history, and RAG-retrieved memories. Total context grows with campaign length.

- **Short context models (4K–8K):** History is aggressively trimmed; older events may be "forgotten"
- **Medium context (32K–128K):** Comfortable for most campaigns
- **Large context (200K+):** Claude's long context works well for very long campaigns with RAG disabled

If the DM starts forgetting established facts, either enable RAG memory or switch to a higher-context model.
