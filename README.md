# Vellicore

An AI-powered solo tabletop RPG that runs on your machine. Choose your own AI backend, generate scenes with local image generation, and hear the world with local voice narration.

---

## AI / LLM

| Provider | Type |
|----------|------|
| [Claude](https://anthropic.com) (Haiku, Sonnet, Opus) | Cloud |
| [OpenAI](https://openai.com) (GPT-4o, o1, etc.) | Cloud |
| [Gemini](https://aistudio.google.com) (Flash, Pro) | Cloud |
| [Ollama](https://ollama.com) | Local |
| [LM Studio](https://lmstudio.ai) | Local |
| Any OpenAI-compatible endpoint | Local / Cloud |

## Image Generation

| Provider | Notes |
|----------|-------|
| [SDNext](https://github.com/vladmandic/sdnext) | Local, runs on your GPU |

## Voice Narration (TTS)

| Provider | Notes |
|----------|-------|
| [Kokoro](https://github.com/remsky/Kokoro-FastAPI) | Local, multiple voices |
| [Chatterbox](https://github.com/resemble-ai/chatterbox) | Local, expressive with Turbo mode |

---

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
