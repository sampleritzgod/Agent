# Data Collection

This document describes how public YouTube content is collected, processed, and stored for use as transcript context in the AI Persona Chat application. The pipeline is **offline and CLI-driven** — it does not run during chat requests.

All data is stored locally under `src/data/`. No database is required for the current implementation.

---

## Overview

```text
YouTube Channel URL
        │
        ▼
┌───────────────────┐
│ 1. Collect videos │  youtube-collector → ingestion/raw/*.json
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 2. Download       │  transcript-downloader → transcripts/<persona>/
│    transcripts    │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 3. Clean          │  transcript-cleaner → cleaned-transcripts/<persona>/
│    transcripts    │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 4. Generate       │  chunk-generator → chunks/<persona>/<videoId>/
│    chunks         │
└───────────────────┘
```

**Personas in this project:**

| Persona | Example channel | Storage prefix |
|---------|-----------------|----------------|
| Hitesh Choudhary | `@chaiaurcode` | `src/data/*/hitesh/` |
| Piyush Garg | `@piyushgargdev` | `src/data/*/piyush/` |

---

## 1. YouTube Data Collection

**Feature:** `src/features/youtube-collector/`  
**Script:** `npm run collect:youtube -- <channelUrl>`

### What it does

- Resolves a YouTube channel URL (handle or ID) via the **YouTube Data API v3**
- Fetches public video metadata: title, description, publish date, duration, thumbnail, video URL
- Writes a `ChannelVideoCollection` JSON file to `src/data/ingestion/raw/youtube-<channelId>.json`

### What it does not do

- Does not download transcripts
- Does not call OpenAI
- Does not modify existing persona datasets

### Example

```bash
npm run collect:youtube -- https://www.youtube.com/@piyushgargdev
```

**Output:** `src/data/ingestion/raw/youtube-UCf9T51_FmMlfhiGpoes0yFA.json`

### Configuration

| Variable | Purpose |
|----------|---------|
| `YOUTUBE_API_KEY` | Required. YouTube Data API v3 key |
| `YOUTUBE_API_BASE_URL` | Optional API base override |

### Options

| Flag | Description |
|------|-------------|
| `--limit N` | Cap total videos collected |
| `--out <path>` | Custom output file path |

---

## 2. Transcript Download

**Feature:** `src/features/transcript-downloader/`  
**Script:** `npm run download:transcripts -- <collection.json> --persona <id>`

### What it does

- Reads video IDs from a collection JSON (or a plain array of IDs)
- Orders videos **newest first** by `publishedAt`
- Processes up to `--maxVideos` (default **20**) per run
- Fetches captions via the [`youtube-transcript-plus`](https://www.npmjs.com/package/youtube-transcript-plus) library (InnerTube player API)
- Saves one JSON file per video: `src/data/transcripts/<persona>/<videoId>.json`
- Preserves per-segment text and timestamps
- Skips already-downloaded files; continues on per-video failures

### Output shape (per video)

Each file contains the video ID, persona, language, segments with `start`, `duration`, and `text`, plus a joined `text` field.

### Example

```bash
npm run download:transcripts -- \
  src/data/ingestion/raw/youtube-UCf9T51_FmMlfhiGpoes0yFA.json \
  --persona piyush \
  --maxVideos 20
```

### Options

| Flag | Description |
|------|-------------|
| `--persona <id>` | Required. Target persona folder |
| `--maxVideos N` | Newest N videos to process (default 20) |
| `--lang <code>` | Preferred caption language |
| `--concurrency N` | Parallel download limit |
| `--debug` | Log caption tracks, endpoints, HTTP responses |

### Failure handling

Videos without available captions are recorded as skipped/failed in the run summary. The batch does not abort.

---

## 3. Transcript Cleaning

**Feature:** `src/features/transcript-cleaner/`  
**Script:** `npm run clean:transcripts -- --persona <id>`

### What it does

Transforms raw transcripts into high-quality text suitable for chunking and retrieval, while **preserving per-segment timestamps**.

**Removed:**

- Non-speech cues (`[Music]`, `[Applause]`, `[Laughter]`)
- Empty and consecutive-duplicate segments
- URLs, social handles, promotional boilerplate (like/subscribe CTAs)

**Preserved:**

- Teaching content, greetings, humor, audience interaction
- Hindi text (not translated)
- English technical terms

### Output

`src/data/cleaned-transcripts/<persona>/<videoId>.json`

Same structural shape as raw transcripts, with normalized whitespace, entities, and punctuation.

### Example

```bash
npm run clean:transcripts -- --persona piyush
```

### Options

| Flag | Description |
|------|-------------|
| `--source <dir>` | Override input directory |
| `--overwrite` | Re-clean existing files |

---

## 4. Chunk Generation

**Feature:** `src/features/chunk-generator/`  
**Script:** `npm run generate:chunks -- --persona <id>`

### What it does

Splits cleaned transcripts into LLM-friendly chunks optimized for retrieval and prompt context.

**Rules:**

| Rule | Value |
|------|-------|
| Target size | 500–800 estimated tokens |
| Sentence boundary | Never split mid-sentence |
| Timestamps | `startTime` / `endTime` span preserved |
| Token estimate | ~4 characters per token (heuristic) |

### Output

One JSON file per chunk:

`src/data/chunks/<persona>/<videoId>/<chunkId>.json`

```json
{
  "chunkId": "FZjJVuHWOIw-0000",
  "videoId": "FZjJVuHWOIw",
  "persona": "hitesh",
  "language": "hi",
  "startTime": 0.4,
  "endTime": 175.84,
  "text": "...",
  "segmentCount": 83,
  "estimatedTokens": 793
}
```

### Example

```bash
npm run generate:chunks -- --persona piyush
```

### Options

| Flag | Description |
|------|-------------|
| `--min N` | Minimum tokens per chunk (default 500) |
| `--max N` | Maximum tokens per chunk (default 800) |
| `--overwrite` | Regenerate existing chunks |
| `--debug` | Per-file chunking diagnostics |

By default, videos that already have chunk directories are skipped unless `--overwrite` is passed.

---

## Optional Pipeline Steps

These modules exist but are **not required** for the current chat retrieval path:

| Step | Script | Output |
|------|--------|--------|
| Hindi transliteration | `npm run transliterate:transcripts -- --persona hitesh` | `src/data/transliterated-transcripts/` |
| Embedding generation | `npm run generate:embeddings -- --persona hitesh` | `src/data/embeddings/` |
| Persona analysis | `npm run analyze:persona -- ...` | `persona.json` profile |

---

## Verifying a Dataset

After running the pipeline, confirm file counts:

```bash
# Transcripts
ls src/data/transcripts/<persona>/*.json | wc -l

# Cleaned
ls src/data/cleaned-transcripts/<persona>/*.json | wc -l

# Chunks
find src/data/chunks/<persona> -name '*.json' | wc -l
```

Both `hitesh` and `piyush` should have non-zero chunk counts for transcript context to load during chat.

---

## Design Notes

- **Resumable:** download, clean, and chunk steps skip existing files by default
- **Isolated per persona:** each persona has its own directory tree; runs do not cross-contaminate datasets
- **No runtime dependency:** chat reads pre-generated chunks from disk; the pipeline does not run on each request
- **Replaceable retrieval:** chunks on disk are the current context source; embeddings are generated for future semantic search without changing the pipeline layout
