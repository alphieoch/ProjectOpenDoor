-- Seed model catalog with popular open-source models
INSERT INTO model_catalog (model_id, display_name, description, hf_repo, inference_engine, default_cpu, default_memory_gb)
VALUES
  ('llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct', 'Meta''s Llama 3.1 8B parameter instruction-tuned model. Great for general chat and reasoning tasks.', 'meta-llama/Meta-Llama-3.1-8B-Instruct', 'vllm', '1.0', '2.0'),
  ('mistral-7b-instruct', 'Mistral 7B Instruct', 'Mistral AI''s 7B instruction-tuned model. Excellent performance for its size.', 'mistralai/Mistral-7B-Instruct-v0.3', 'vllm', '1.0', '2.0'),
  ('qwen2.5-7b-instruct', 'Qwen 2.5 7B Instruct', 'Alibaba Qwen 2.5 7B instruction-tuned model. Strong multilingual capabilities.', 'Qwen/Qwen2.5-7B-Instruct', 'vllm', '1.0', '2.0'),
  ('gemma-2-9b-it', 'Gemma 2 9B IT', 'Google''s Gemma 2 9B instruction-tuned model. Efficient and capable.', 'google/gemma-2-9b-it', 'vllm', '1.0', '2.5')
ON CONFLICT (model_id) DO NOTHING;
