# Training & fine-tunes (Wave 4)

Fireworks-style training: datasets → SFT/DPO/ORPO/RFT/GRPO jobs → `ft:` models billed at **base model** price → evals.

## Dashboard

`/dashboard/training` — datasets, jobs, models, evals.

## API (dashboard, session auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/training/datasets` | List / upload JSONL rows (or `storageUri`) |
| DELETE | `/api/training/datasets/:id` | Delete |
| GET/POST | `/api/training/jobs` | List / start job (`method`, `baseModelId`, `datasetId`) |
| GET/POST | `/api/training/jobs/:id` | Status / `retry` / `cancel` |
| GET | `/api/training/models` | Active `ft:` models |
| GET/POST | `/api/training/evals` | Evaluators + eval jobs |

## Gateway

```bash
curl "$GATEWAY/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"ft:<id>","messages":[{"role":"user","content":"hi"}]}'
```

Pricing resolves `ft:` → `fine_tuned_models.base_model_id` when `bill_as_base` is true.

## Trainer backends

- **`TOGETHER_API_KEY` set** — uploads JSONL and creates a Together fine-tune; polls to completion.
- **Otherwise** — local simulated trainer still registers an `ft:` model for product/billing testing.

```bash
export TOGETHER_API_KEY=...
./scripts/finish-ops.sh
```
