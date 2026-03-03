/* ─────────────────────────────────────────────────────────────
   Fit to Metal — Frontend
   ───────────────────────────────────────────────────────────── */

// ── Analytics helper (Umami) ──────────────────────────────────
function trackEvent(name, props) {
  if (typeof window.umami !== 'undefined') window.umami.track(name, props);
}

// ── GPU data (NVIDIA, AMD, Apple Silicon) ───────────────────────
const NVIDIA_GPUS = {
  '50-series': [
    { name: 'RTX 5090',    vram: 32, bw: 1792 },
    { name: 'RTX 5080',    vram: 16, bw: 960  },
    { name: 'RTX 5070 Ti', vram: 16, bw: 896  },
    { name: 'RTX 5070',    vram: 12, bw: 672  },
    { name: 'RTX 5060 Ti', vram: 16, bw: 448  },
  ],
  '40-series': [
    { name: 'RTX 4090',          vram: 24, bw: 1008 },
    { name: 'RTX 4080 Super',    vram: 16, bw: 736  },
    { name: 'RTX 4080',          vram: 16, bw: 717  },
    { name: 'RTX 4070 Ti Super', vram: 16, bw: 672  },
    { name: 'RTX 4070 Ti',       vram: 12, bw: 504  },
    { name: 'RTX 4070 Super',    vram: 12, bw: 504  },
    { name: 'RTX 4070',          vram: 12, bw: 504  },
    { name: 'RTX 4060 Ti 16G',   vram: 16, bw: 288  },
    { name: 'RTX 4060 Ti',       vram: 8,  bw: 288  },
    { name: 'RTX 4060',          vram: 8,  bw: 272  },
  ],
  '30-series': [
    { name: 'RTX 3090 Ti', vram: 24, bw: 1008 },
    { name: 'RTX 3090',    vram: 24, bw: 936  },
    { name: 'RTX 3080 Ti', vram: 12, bw: 912  },
    { name: 'RTX 3080 12G',vram: 12, bw: 912  },
    { name: 'RTX 3080',    vram: 10, bw: 760  },
    { name: 'RTX 3070 Ti', vram: 8,  bw: 608  },
    { name: 'RTX 3070',    vram: 8,  bw: 448  },
    { name: 'RTX 3060 Ti', vram: 8,  bw: 448  },
    { name: 'RTX 3060',    vram: 12, bw: 360  },
  ],
  'amd': [
    { name: 'RX 9070 XT',  vram: 16, bw: 640  },
    { name: 'RX 9070',     vram: 16, bw: 576  },
    { name: 'RX 7900 XTX', vram: 24, bw: 960  },
    { name: 'RX 7900 XT',  vram: 20, bw: 800  },
    { name: 'RX 7900 GRE', vram: 16, bw: 576  },
    { name: 'RX 7800 XT',  vram: 16, bw: 624  },
    { name: 'RX 7700 XT',  vram: 12, bw: 432  },
    { name: 'RX 7600',     vram: 8,  bw: 288  },
    { name: 'RX 6950 XT',  vram: 16, bw: 576  },
    { name: 'RX 6900 XT',  vram: 16, bw: 512  },
    { name: 'RX 6800 XT',  vram: 16, bw: 512  },
  ],
  'apple': [
    { name: 'M4 Ultra 192G',  vram: 192, bw: 819  },
    { name: 'M4 Ultra 96G',   vram: 96,  bw: 819  },
    { name: 'M4 Max 128G',    vram: 128, bw: 546  },
    { name: 'M4 Max 64G',     vram: 64,  bw: 546  },
    { name: 'M4 Pro 48G',     vram: 48,  bw: 273  },
    { name: 'M4 Pro 24G',     vram: 24,  bw: 273  },
    { name: 'M3 Ultra 192G',  vram: 192, bw: 800  },
    { name: 'M3 Max 128G',    vram: 128, bw: 400  },
    { name: 'M3 Max 64G',     vram: 64,  bw: 400  },
    { name: 'M3 Pro 36G',     vram: 36,  bw: 150  },
    { name: 'M2 Ultra 192G',  vram: 192, bw: 800  },
    { name: 'M2 Max 96G',     vram: 96,  bw: 400  },
  ],
  'workstation': [
    { name: 'RTX 6000 Ada',  vram: 48, bw: 960 },
    { name: 'RTX 5000 Ada',  vram: 32, bw: 576 },
    { name: 'RTX 4500 Ada',  vram: 24, bw: 432 },
    { name: 'RTX 4000 Ada',  vram: 20, bw: 360 },
    { name: 'A40',           vram: 48, bw: 696 },
    { name: 'MI300X',        vram: 192, bw: 5300 },
    { name: 'MI250X',        vram: 128, bw: 3277 },
    { name: 'MI210',         vram: 64,  bw: 1638 },
  ],
  'datacenter': [
    { name: 'GB200',      vram: 192, bw: 8000 },
    { name: 'B200',       vram: 192, bw: 8000 },
    { name: 'B100',       vram: 192, bw: 7200 },
    { name: 'GH200',      vram: 96,  bw: 4000 },
    { name: 'H200 SXM',   vram: 141, bw: 4800 },
    { name: 'H100 SXM',   vram: 80,  bw: 3350 },
    { name: 'H100 PCIe',  vram: 80,  bw: 2000 },
    { name: 'A100 80G',   vram: 80,  bw: 2000 },
    { name: 'A100 40G',   vram: 40,  bw: 1600 },
    { name: 'L40S',       vram: 48,  bw: 864  },
  ],
};

// ── Benchmark definitions per use case ─────────────────────────
const USE_CASE_BENCHMARKS = {
  llm: [
    { key: 'overall',       label: '★ Overall',  desc: 'Weighted avg across all available LLM benchmarks' },
    { key: 'hle',           label: 'HLE',        desc: "Humanity's Last Exam — frontier expert-level questions, hardest public benchmark (%)" },
    { key: 'gpqa',          label: 'GPQA',       desc: 'GPQA-Diamond — PhD-level scientific reasoning questions (%)' },
    { key: 'swebench',      label: '🤖 Agentic', desc: 'SWE-bench Verified — % of real GitHub issues resolved autonomously by the model acting as an agent (%)' },
    { key: 'gaia',          label: 'GAIA',       desc: 'GAIA — general agentic AI benchmark: web browsing, tool use, multi-step reasoning (%)' },
    { key: 'math',          label: 'Math',       desc: 'MATH competition problems (%)' },
    { key: 'humaneval',     label: 'Coding',     desc: 'HumanEval — Python code generation pass@1 (%)' },
    { key: 'gsm8k',         label: 'GSM8K',      desc: 'Grade school math word problems (%)' },
    { key: 'mmlu',          label: 'General',    desc: 'MMLU 5-shot — broad general knowledge (%)' },
    { key: 'arc',           label: 'Reasoning',  desc: 'ARC-Challenge — science reasoning (%)' },
    { key: 'ifeval',        label: 'Instruct',   desc: 'IFEval — instruction-following accuracy (%)' },
  ],
  image: [
    { key: 'image_quality', label: 'Quality',    desc: 'Human preference quality score 0–100' },
    { key: 'clip_score',    label: 'CLIP',       desc: 'Text-image alignment (higher = better)' },
  ],
  audio: [
    { key: 'wer',           label: 'WER ↓',      desc: 'Word Error Rate — lower is better (%)' },
  ],
  vision: [
    { key: 'imagenet_top1', label: 'ImageNet',   desc: 'Top-1 accuracy on ImageNet val set (%)' },
  ],
  embed: [
    { key: 'mteb',          label: 'MTEB',       desc: 'Massive Text Embedding Benchmark avg (%)' },
  ],
  video: [],
};

// Benchmarks where lower score = better rank
const LOWER_IS_BETTER = new Set(['wer']);

// ── License registry ───────────────────────────────────────────
// Maps HuggingFace license tag values → display info
const LICENSE_INFO = {
  'apache-2.0':            { label: 'Apache 2.0',           cls: 'license-open',        commercial: 'Commercial use OK' },
  'mit':                   { label: 'MIT',                   cls: 'license-open',        commercial: 'Commercial use OK' },
  'bsd-3-clause':          { label: 'BSD-3',                 cls: 'license-open',        commercial: 'Commercial use OK' },
  'llama3':                { label: 'Llama 3 Community',     cls: 'license-community',   commercial: 'Commercial OK · must accept usage policy' },
  'llama3.1':              { label: 'Llama 3.1 Community',   cls: 'license-community',   commercial: 'Commercial OK · must accept usage policy' },
  'llama3.2':              { label: 'Llama 3.2 Community',   cls: 'license-community',   commercial: 'Commercial OK · must accept usage policy' },
  'llama3.3':              { label: 'Llama 3.3 Community',   cls: 'license-community',   commercial: 'Commercial OK · must accept usage policy' },
  'gemma':                 { label: 'Gemma TOS',             cls: 'license-conditional', commercial: 'Commercial OK with Google TOS restrictions' },
  'qwen':                  { label: 'Qwen License',          cls: 'license-conditional', commercial: 'Commercial OK for ≤72B; restricted for larger' },
  'cc-by-4.0':             { label: 'CC BY 4.0',             cls: 'license-open',        commercial: 'Commercial OK (attribution required)' },
  'cc-by-nc-4.0':          { label: 'CC BY-NC 4.0',          cls: 'license-restricted',  commercial: 'Non-commercial only' },
  'cc-by-nc-nd-4.0':       { label: 'CC BY-NC-ND 4.0',       cls: 'license-restricted',  commercial: 'Non-commercial, no derivatives' },
  'cc-by-nc-sa-4.0':       { label: 'CC BY-NC-SA 4.0',       cls: 'license-restricted',  commercial: 'Non-commercial + share-alike' },
  'gpl-3.0':               { label: 'GPL-3.0',               cls: 'license-conditional', commercial: 'Copyleft — derivatives must also be GPL' },
  'agpl-3.0':              { label: 'AGPL-3.0',              cls: 'license-conditional', commercial: 'Copyleft — network use triggers copyleft' },
  'deepseek':              { label: 'DeepSeek License',      cls: 'license-community',   commercial: 'Commercial OK (review terms)' },
  'flux-1-dev':            { label: 'FLUX.1-dev',            cls: 'license-restricted',  commercial: 'Non-commercial for this variant' },
  'openrail':              { label: 'OpenRAIL',              cls: 'license-community',   commercial: 'Commercial OK with use-case restrictions' },
  'openrail-m':            { label: 'OpenRAIL-M',            cls: 'license-community',   commercial: 'Commercial OK with use-case restrictions' },
  'creativeml-openrail-m': { label: 'CreativeML OpenRAIL-M', cls: 'license-community',   commercial: 'Commercial OK with use-case restrictions' },
  'bigscience-openrail-m': { label: 'BigScience RAIL',       cls: 'license-community',   commercial: 'Research-first; commercial with approval' },
  'other':                 { label: 'Other',                 cls: 'license-conditional', commercial: 'Check model card' },
};

function getLicenseInfo(model) {
  const lic = (model.license ?? '').toLowerCase();
  if (!lic) return { label: 'Not specified', cls: 'license-conditional', commercial: 'Check model card for terms' };
  if (LICENSE_INFO[lic]) return LICENSE_INFO[lic];
  // Partial/prefix match (longer keys first for specificity)
  const key = Object.keys(LICENSE_INFO)
    .sort((a, b) => b.length - a.length)
    .find(k => lic.startsWith(k) || lic.includes(k));
  if (key) return LICENSE_INFO[key];
  const label = lic.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 30);
  return { label, cls: 'license-conditional', commercial: 'Check model card for terms' };
}

// ── Safety information registry ────────────────────────────────
// Sources: official model cards, published safety/alignment papers, transparency reports.
// safetyLevel: 1 = minimal · 2 = basic · 3 = moderate · 4 = thorough · 5 = comprehensive
const SAFETY_INFO = {
  'meta-llama/Llama-3': {
    alignment: "SFT \u2192 RLHF \u2192 DPO (Meta's multi-stage Llama 3 alignment pipeline)",
    redTeam: 'Internal + third-party red-teaming; Llama Guard classifier; CyberSec Eval; Purple Llama safety suite',
    safetyLevel: 4,
    knownRisks: "Can produce harmful content if the system prompt is removed. Training data is sourced from the public web. Requires acceptance of the Llama 3 Community License and Meta's usage policy.",
  },
  'Qwen/Qwen2.5': {
    alignment: "SFT + RLHF (Alibaba's Tongyi Qianwen alignment pipeline)",
    redTeam: 'Internal safety evaluations aligned with Alibaba Cloud content policies; limited external disclosure',
    safetyLevel: 3,
    knownRisks: "Safety alignment reflects Alibaba's guidelines, which may differ from Western regulatory standards. Commercial restrictions apply to variants larger than 72B under the Qwen License.",
  },
  'Qwen/QwQ': {
    alignment: 'RL-based reasoning (GRPO; minimal safety RLHF \u2014 reasoning performance prioritized)',
    redTeam: 'Limited documented safety testing; evaluation focused on reasoning benchmarks',
    safetyLevel: 2,
    knownRisks: 'Reasoning models can "think through" harmful content as part of chain-of-thought. Safety guardrails are thinner than standard instruct-tuned chat models.',
  },
  'deepseek-ai/DeepSeek-R1': {
    alignment: 'RL-based reasoning (Group Relative Policy Optimization \u2014 GRPO; minimal safety RLHF)',
    redTeam: 'Limited documented third-party red-teaming; primarily evaluated on reasoning benchmarks',
    safetyLevel: 2,
    knownRisks: 'Chain-of-thought reasoning may surface dangerous content mid-inference. Fewer independent safety evaluations published than comparable Western models. Safety filter quality varies across distilled variants.',
  },
  'deepseek-ai/DeepSeek-V': {
    alignment: "SFT + RLHF (DeepSeek's internal alignment pipeline)",
    redTeam: 'Internal red-teaming; limited external disclosure of evaluation methodology',
    safetyLevel: 2,
    knownRisks: "Limited public safety audit trail. Content policies reflect DeepSeek's guidelines. Evaluate carefully against your jurisdiction's AI compliance requirements before deployment.",
  },
  'mistralai/Mistral': {
    alignment: 'SFT only (deliberately permissive \u2014 Mistral intentionally avoids heavy content filtering)',
    redTeam: 'Minimal safety training; no documented external red-teaming; permissive by design philosophy',
    safetyLevel: 2,
    knownRisks: "Highly susceptible to jailbreaks; not suitable for applications requiring strong content moderation. Mistral's design philosophy explicitly favors developer freedom over built-in restrictions.",
  },
  'mistralai/Mixtral': {
    alignment: 'SFT only (same permissive philosophy as Mistral 7B; mixture-of-experts architecture)',
    redTeam: 'Minimal documented safety testing; same design philosophy as base Mistral models',
    safetyLevel: 2,
    knownRisks: 'Higher capability than Mistral 7B amplifies misuse risk given the permissive alignment. Strongly consider adding an external safety layer (e.g., Llama Guard, Perspective API) for production deployments.',
  },
  'google/gemma-2': {
    alignment: "SFT + RLHF (Google's Responsible AI pipeline)",
    redTeam: "Google's internal safety team + external red-teaming; ShieldGemma companion classifier model publicly available for content filtering",
    safetyLevel: 4,
    knownRisks: "Bound by Google's Gemma Terms of Use. Prohibited uses include CSAM, weapons instructions, and election disinformation. ShieldGemma is recommended for production safety filtering.",
  },
  'microsoft/Phi': {
    alignment: "SFT + DPO (Microsoft's Responsible AI guidelines; safety evaluated in Phi technical reports)",
    redTeam: "Microsoft's Responsible AI (RAI) team red-teaming documented in Phi-3 and Phi-4 technical reports",
    safetyLevel: 4,
    knownRisks: "Small model size means uneven safety coverage compared to larger models. Safety fine-tuning can be overridden by downstream fine-tuning. Review Microsoft's Acceptable Use Policy before deployment.",
  },
  'CohereForAI/': {
    alignment: "SFT + RLHF (Cohere's alignment pipeline; optimized for enterprise and RAG use cases)",
    redTeam: "Cohere's internal safety evaluations with RAG-specific attack vector testing",
    safetyLevel: 4,
    knownRisks: 'Optimized for retrieval-augmented generation (RAG) and structured enterprise tasks. May exhibit unexpected behavior in highly open-ended creative or unconstrained generation tasks.',
  },
  'black-forest-labs/FLUX': {
    alignment: 'N/A — image generation model (no language alignment applicable)',
    redTeam: 'NSFW filter integrated; evaluated on harmful imagery generation; FLUX.1-dev is non-commercial which reduces but does not eliminate misuse risk',
    safetyLevel: 3,
    knownRisks: 'Capable of generating NSFW imagery. FLUX.1-dev (this variant) is for non-commercial research; FLUX.1-schnell uses Apache 2.0. No mandatory watermarking. Apply content-filtering middleware for any public-facing deployment.',
  },
  'openai/whisper': {
    alignment: 'N/A — automatic speech recognition (ASR); no text generation capability',
    redTeam: 'No adversarial safety testing required for read-only transcription models',
    safetyLevel: 5,
    knownRisks: 'Cannot generate harmful content (transcription only). Known to hallucinate plausible-sounding text during silence or non-speech audio segments. Surveillance use may carry legal/privacy implications in many jurisdictions.',
  },
  'BAAI/bge': {
    alignment: 'N/A — text embedding model (no text generation capability)',
    redTeam: 'Standard embedding bias evaluation; no harmful-output risk applicable',
    safetyLevel: 5,
    knownRisks: 'Cannot generate harmful content. Training data may encode social biases into embedding space. Independent bias audits are recommended for high-stakes retrieval or ranking systems.',
  },
  'stabilityai/stable-diffusion': {
    alignment: 'N/A — latent diffusion image generation model',
    redTeam: 'NSFW concept filtering integrated in SD v2+; Safety Image Classifier available; community fine-tunes frequently remove filters',
    safetyLevel: 3,
    knownRisks: 'Community checkpoints often bypass safety filters entirely. Base model can generate NSFW/harmful imagery. Deepfake and non-consensual intimate image (NCII) generation is a documented misuse vector.',
  },
  // Zhipu AI — GLM (older series under THUDM, newer under zai-org)
  'THUDM/': {
    alignment: 'SFT + RLHF (Zhipu AI alignment pipeline)',
    redTeam: "Zhipu AI's internal safety evaluations; aligned with Chinese AI regulations and content standards",
    safetyLevel: 3,
    knownRisks: "Safety alignment reflects Chinese regulatory standards which differ from Western norms. GLM models include content filtering for politically sensitive topics. Evaluate against your jurisdiction's requirements before deployment.",
  },
  'zai-org/': {
    alignment: 'SFT + RLHF (Zhipu AI / ZAI alignment pipeline)',
    redTeam: "ZAI internal safety evaluations; GLM-5 and GLM-4.7 series follow Zhipu AI safety standards",
    safetyLevel: 3,
    knownRisks: "Same considerations as GLM series: alignment reflects Chinese regulatory standards. GLM-5 is a large MoE model; evaluate carefully for your deployment jurisdiction.",
  },
  // 01.ai — Yi
  '01-ai/': {
    alignment: 'SFT + RLHF (01.ai alignment pipeline)',
    redTeam: "01.ai's internal safety evaluations; limited external disclosure",
    safetyLevel: 3,
    knownRisks: "Safety alignment reflects 01.ai's guidelines. Yi models are capable but have fewer published safety audits than Western equivalents. Additional safety filtering recommended for production use.",
  },
  // Shanghai AI Lab — InternLM
  'internlm/': {
    alignment: 'SFT + RLHF (Shanghai AI Lab alignment)',
    redTeam: "Internal safety evaluations by Shanghai AI Lab; limited external red-teaming disclosure",
    safetyLevel: 3,
    knownRisks: "InternLM models include content moderation aligned with Chinese regulatory standards. Evaluate for your specific jurisdiction and use case before deployment.",
  },
  // Databricks — DBRX
  'databricks/': {
    alignment: 'SFT + RLHF (Databricks alignment; enterprise-focused)',
    redTeam: "Databricks internal safety testing; focused on enterprise data and coding use cases",
    safetyLevel: 3,
    knownRisks: "DBRX is designed for enterprise coding and data tasks. Safety guardrails are less extensive than consumer-facing models. Review Databricks license terms for commercial deployment.",
  },
  // TII — Falcon
  'tiiuae/': {
    alignment: 'SFT (limited; TII alignment pipeline)',
    redTeam: "TII's internal safety evaluation; limited external red-teaming disclosure",
    safetyLevel: 2,
    knownRisks: "Falcon models have limited safety alignment. The Apache 2.0 license allows broad use but does not guarantee safety properties. Additional safety filtering is strongly recommended for public-facing deployments.",
  },
  // NousResearch
  'NousResearch/': {
    alignment: 'Merging/fine-tuning on top of base models (Hermes DPO fine-tune)',
    redTeam: "Community-driven evaluation; no formal red-teaming disclosure",
    safetyLevel: 2,
    knownRisks: "Hermes models are designed to be less restricted than their base models. Explicit content generation may be possible. Not suitable for applications requiring strong content moderation.",
  },
  // NVIDIA — Nemotron
  'nvidia/': {
    alignment: 'SFT + RLHF (NVIDIA alignment; reward-model-trained on HelpSteer dataset)',
    redTeam: "NVIDIA's internal safety evaluations; tested against NeMo Guardrails framework",
    safetyLevel: 4,
    knownRisks: "Nemotron models are enterprise-focused and well-aligned. Available under a custom NVIDIA Open Model License — commercial use permitted with restrictions. Review terms for high-volume deployments.",
  },
  // AI2 — OLMo
  'allenai/': {
    alignment: 'SFT + DPO (AI2 Tulu alignment pipeline; fully open research model)',
    redTeam: "AI2 internal safety evaluations; fully open research model with transparency reports",
    safetyLevel: 3,
    knownRisks: "OLMo is a fully open research model (weights, data, training code). Safety alignment is research-quality rather than production-hardened. Apache 2.0 license — commercial use OK.",
  },
};

const SAFETY_LABELS = ['', 'Minimal', 'Basic', 'Moderate', 'Thorough', 'Comprehensive'];
const SAFETY_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#c8d8cc', '#76b900'];

function inferSafety(model) {
  // Match by longest-prefix first for specificity
  const prefixes = Object.keys(SAFETY_INFO).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (model.id.startsWith(prefix)) return { ...SAFETY_INFO[prefix] };
  }
  // Generic fallback: infer from model id patterns
  const idLower = model.id.toLowerCase();
  const isInstruct = /instruct|chat|sft|rlhf|-it$|-chat$/.test(idLower);
  return {
    alignment: isInstruct
      ? 'Instruction fine-tuned (alignment details not publicly disclosed)'
      : 'Base model — no safety alignment applied',
    redTeam: 'No documented red-teaming or safety evaluation found for this model',
    safetyLevel: isInstruct ? 2 : 1,
    knownRisks: isInstruct
      ? 'Safety training details not publicly disclosed. Evaluate carefully before deployment in sensitive applications.'
      : 'Base models can reproduce harmful training data verbatim. Not suitable for production without an additional safety layer.',
  };
}

// ── Deployment options ─────────────────────────────────────────
const DEPLOYMENT_OPTIONS = [
  {
    id: 'ollama', name: 'Ollama',
    desc: 'Pull & run with one command. Best UX for local inference.',
    url: 'https://ollama.com',
    tags: ['Beginner', 'Local', 'CLI'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'lmstudio', name: 'LM Studio',
    desc: 'Cross-platform GUI with built-in model browser and chat.',
    url: 'https://lmstudio.ai',
    tags: ['GUI', 'Local', 'GGUF'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'vllm', name: 'vLLM',
    desc: 'PagedAttention for high-throughput serving. OpenAI-compatible API.',
    url: 'https://docs.vllm.ai',
    tags: ['Production', 'High-throughput', 'API'],
    usecases: ['llm'], minVram: 8,
  },
  {
    id: 'llamacpp', name: 'llama.cpp',
    desc: 'Lightweight C++ runtime. CPU + GPU hybrid. GGUF quantization.',
    url: 'https://github.com/ggerganov/llama.cpp',
    tags: ['CPU+GPU', 'GGUF', 'Low-level'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'tgi', name: 'TGI',
    desc: "HuggingFace's Text Generation Inference. Docker-ready, production-grade.",
    url: 'https://huggingface.co/docs/text-generation-inference',
    tags: ['Production', 'Docker', 'HF-native'],
    usecases: ['llm'], minVram: 0,
  },
  {
    id: 'transformers', name: 'Transformers',
    desc: 'HuggingFace Python library. Universal — supports all model types.',
    url: 'https://huggingface.co/docs/transformers',
    tags: ['Universal', 'Python', 'Research'],
    usecases: ['llm', 'image', 'audio', 'vision', 'embed', 'video'], minVram: 0,
  },
  {
    id: 'diffusers', name: 'Diffusers',
    desc: 'HuggingFace library purpose-built for diffusion models.',
    url: 'https://huggingface.co/docs/diffusers',
    tags: ['Diffusion', 'Python'],
    usecases: ['image', 'video'], minVram: 0,
  },
  {
    id: 'comfyui', name: 'ComfyUI',
    desc: 'Node-based workflow editor for image gen. Vast plugin ecosystem.',
    url: 'https://github.com/comfyanonymous/ComfyUI',
    tags: ['GUI', 'Workflows', 'Nodes'],
    usecases: ['image'], minVram: 0,
  },
  {
    id: 'a1111', name: 'Automatic1111',
    desc: 'Feature-rich web UI for Stable Diffusion with hundreds of extensions.',
    url: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui',
    tags: ['Web UI', 'Extensions'],
    usecases: ['image'], minVram: 0,
  },
  {
    id: 'faster-whisper', name: 'faster-whisper',
    desc: 'Optimized Whisper with CTranslate2. ~4× faster than vanilla Whisper.',
    url: 'https://github.com/SYSTRAN/faster-whisper',
    tags: ['Audio', 'Fast', 'CTranslate2'],
    usecases: ['audio'], minVram: 0,
  },
];

// ── Task descriptions (for modal) ──────────────────────────────
const TASK_DESCRIPTIONS = {
  'text-generation':             'General-purpose text generation and chat. Ideal for: chatbots, content creation, summarization, Q&A, code generation, and reasoning tasks.',
  'text2text-generation':        'Sequence-to-sequence generation. Ideal for: translation, summarization, paraphrase, and text-to-text transformation.',
  'text-to-image':               'Generates images from text prompts. Ideal for: creative art, product mockups, concept visualization, and controlled image synthesis.',
  'image-to-image':              'Transforms images via prompts or style transfer. Ideal for: editing, inpainting, upscaling, and style transfer.',
  'automatic-speech-recognition':'Transcribes spoken audio to text. Ideal for: meeting notes, subtitles, voice interfaces, and audio indexing.',
  'text-to-speech':              'Converts text to natural speech. Ideal for: audiobooks, accessibility tools, voice assistants, and content narration.',
  'audio-to-audio':              'Transforms or enhances audio signals. Ideal for: noise cancellation, music source separation, and audio effects.',
  'feature-extraction':          'Produces dense vector embeddings from text. Ideal for: semantic search, clustering, classification, and RAG pipelines.',
  'sentence-similarity':         'Measures semantic closeness between sentences. Ideal for: deduplication, search ranking, recommendation, and NLI.',
  'image-classification':        'Assigns label categories to images. Ideal for: content moderation, medical imaging, quality control, and photo tagging.',
  'object-detection':            'Detects and localizes objects with bounding boxes. Ideal for: security cameras, inventory management, and robotics.',
  'image-segmentation':          'Segments images into semantic or instance regions. Ideal for: medical imaging, autonomous driving, and photo editing.',
  'depth-estimation':            'Predicts per-pixel depth from a single 2D image. Ideal for: AR, 3D reconstruction, and robot navigation.',
  'image-to-text':               'Generates text descriptions from images (captioning/VQA). Ideal for: accessibility, image search, and content understanding.',
  'text-to-video':               'Generates video clips from text prompts. Ideal for: creative production, storyboarding, and marketing content.',
  'video-classification':        'Classifies or understands video sequences. Ideal for: content moderation, sports analytics, and surveillance.',
};

// ── State ──────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const state = {
  vram: 8,
  usecase: 'llm',
  quantization: 'fp16',
  sort: 'newest',
  loading: false,
  models: [],
  selectedGpu: null,
  gpuCount: 1,
  gpuTier: '50-series',
  activeBenchmark: 'overall',
  page: 1,
};

// ── Hash router (About / Privacy / Contact pages) ──────────────
const STATIC_PAGES = ['#/about', '#/privacy', '#/contact'];

function showPage(hash) {
  const isStatic = STATIC_PAGES.includes(hash);
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.hidden = isStatic;
  document.getElementById('page-about').hidden   = hash !== '#/about';
  document.getElementById('page-privacy').hidden = hash !== '#/privacy';
  document.getElementById('page-contact').hidden = hash !== '#/contact';
  if (isStatic) window.scrollTo(0, 0);
}

// ── Share bar buttons ─────────────────────────────────────────
document.getElementById('copyLinkBtn')?.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href);
  const btn = document.getElementById('copyLinkBtn');
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy link', 2000);
  trackEvent('Share Click', { method: 'copy', page: 'tool' });
});

document.getElementById('tweetBtn')?.addEventListener('click', () => {
  const count = state.models.length;
  const gpu = state.selectedGpu
    ? `${state.gpuCount > 1 ? `${state.gpuCount}× ` : ''}${state.selectedGpu.name}`
    : `${state.vram} GB VRAM`;
  const quant = state.quantization.toUpperCase();
  const text = `I can run ${count} AI models on my ${gpu} at ${quant} — find yours:`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://fit-to-metal.up.railway.app/tool')}`;
  window.open(url, '_blank', 'noopener');
  trackEvent('Share Click', { method: 'twitter', page: 'tool', resultsCount: count });
});

// Wire up all "back" links inside static pages to go home
document.querySelectorAll('.back-link').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); window.location.hash = ''; showPage(''); });
});

// Wire privacy page's internal contact link
const privacyContactLink = document.getElementById('privacy-contact-link');
if (privacyContactLink) {
  privacyContactLink.addEventListener('click', e => { e.preventDefault(); window.location.hash = '#/contact'; showPage('#/contact'); });
}

window.addEventListener('hashchange', () => showPage(window.location.hash));
showPage(window.location.hash); // handle direct navigation / page refresh

// ── Contact form submission ─────────────────────────────────────
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn    = contactForm.querySelector('.contact-submit');
    const status = document.getElementById('contactStatus');
    const payload = {
      name:    document.getElementById('contactName').value.trim(),
      email:   document.getElementById('contactEmail').value.trim(),
      subject: document.getElementById('contactSubject').value,
      message: document.getElementById('contactMessage').value.trim(),
    };
    if (!payload.name || !payload.email || !payload.message) {
      status.textContent = 'Please fill in your name, email, and message.';
      status.className = 'contact-status error';
      status.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Sending…';
    status.hidden = true;
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        status.textContent = 'Message sent! We\'ll get back to you soon.';
        status.className = 'contact-status success';
        contactForm.reset();
      } else {
        status.textContent = data.error || 'Something went wrong. Please try again.';
        status.className = 'contact-status error';
      }
    } catch {
      status.textContent = 'Network error. Please try again.';
      status.className = 'contact-status error';
    }
    status.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Send Message';
  });
}

// ── DOM refs ───────────────────────────────────────────────────
const vramSlider      = document.getElementById('vramSlider');
const vramDisplay     = document.getElementById('vramDisplay');
const vramPresets     = document.getElementById('vramPresets');
const usecaseTabs     = document.getElementById('usecaseTabs');
const quantSel        = document.getElementById('quantization');
const sortSel         = document.getElementById('sortBy');
const searchBtn       = document.getElementById('searchBtn');
const modelGrid       = document.getElementById('modelGrid');
const resultsCount    = document.getElementById('resultsCount');
const sortBar         = document.getElementById('sortBar');
const gpuTierTabs     = document.getElementById('gpuTierTabs');
const gpuGrid         = document.getElementById('gpuGrid');
const selectedGpuRow  = document.getElementById('selectedGpuRow');
const selectedGpuText = document.getElementById('selectedGpuText');
const clearGpuBtn     = document.getElementById('clearGpuBtn');
const multiGpuSection = document.getElementById('multiGpuSection');
const gpuCountRow     = document.getElementById('gpuCountRow');
const multiGpuInfo    = document.getElementById('multiGpuInfo');
const benchmarkBar    = document.getElementById('benchmarkBar');
const benchmarkTabs   = document.getElementById('benchmarkTabs');
const modalOverlay    = document.getElementById('modalOverlay');
const modalBody       = document.getElementById('modalBody');
const modalClose      = document.getElementById('modalClose');
const globalSearch    = document.getElementById('globalSearch');
const globalSearchBtn = document.getElementById('globalSearchBtn');
const globalSearchSuggestions = document.getElementById('searchSuggestions');

// ── GPU Picker ─────────────────────────────────────────────────
function renderGpuGrid() {
  const gpus = NVIDIA_GPUS[state.gpuTier] ?? [];
  gpuGrid.innerHTML = gpus.map(g => `
    <button class="gpu-btn${state.selectedGpu?.name === g.name ? ' active' : ''}"
            data-name="${escapeHtml(g.name)}" data-vram="${g.vram}" data-bw="${g.bw}">
      <span class="gpu-btn-name">${escapeHtml(g.name)}</span>
      <span class="gpu-btn-vram">${g.vram} GB</span>
    </button>
  `).join('');
}

gpuTierTabs.addEventListener('click', e => {
  const btn = e.target.closest('.gpu-tier-btn');
  if (!btn) return;
  state.gpuTier = btn.dataset.tier;
  gpuTierTabs.querySelectorAll('.gpu-tier-btn').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
  renderGpuGrid();
});

gpuGrid.addEventListener('click', e => {
  const btn = e.target.closest('.gpu-btn');
  if (!btn) return;
  const name = btn.dataset.name;
  const vram = parseInt(btn.dataset.vram);
  const bw   = parseInt(btn.dataset.bw);
  if (state.selectedGpu?.name === name) {
    clearGpu();
  } else {
    state.selectedGpu = { name, vram, bw };
    state.gpuCount = 1;
    updateVramFromGpu();
    updateGpuUI();
  }
});

clearGpuBtn.addEventListener('click', () => clearGpu());

function clearGpu() {
  state.selectedGpu = null;
  state.gpuCount = 1;
  vramSlider.max = 5000;
  updateGpuUI();
  renderGpuGrid();
}

function updateVramFromGpu() {
  if (!state.selectedGpu) return;
  const total = state.selectedGpu.vram * state.gpuCount;
  state.vram = total;
  vramSlider.max = Math.min(5000, Math.max(320, total + 40));
  vramSlider.value = total;
  vramDisplay.textContent = total;
  syncPresets();
}

function updateGpuUI() {
  if (state.selectedGpu) {
    const total = state.selectedGpu.vram * state.gpuCount;
    selectedGpuText.textContent = state.gpuCount > 1
      ? `${state.gpuCount}× ${state.selectedGpu.name} = ${total} GB`
      : `${state.selectedGpu.name} — ${total} GB`;
    selectedGpuRow.style.display = 'flex';
    multiGpuSection.style.display = 'block';

    gpuCountRow.querySelectorAll('.count-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.c) === state.gpuCount)
    );

    if (state.gpuCount > 1) {
      const totalBW = Math.round(state.selectedGpu.bw * state.gpuCount * 0.80);
      multiGpuInfo.style.display = 'block';
      multiGpuInfo.innerHTML =
        `<strong>${state.gpuCount}×</strong> ${escapeHtml(state.selectedGpu.name)} · ` +
        `<strong>${total} GB</strong> VRAM · ~<strong>${totalBW} GB/s</strong> combined bandwidth`;
    } else {
      multiGpuInfo.style.display = 'none';
    }
  } else {
    selectedGpuRow.style.display = 'none';
    multiGpuSection.style.display = 'none';
    vramSlider.max = 5000;
  }
  renderGpuGrid();
}

gpuCountRow.addEventListener('click', e => {
  const btn = e.target.closest('.count-btn');
  if (!btn) return;
  state.gpuCount = parseInt(btn.dataset.c);
  updateVramFromGpu();
  updateGpuUI();
});

// ── VRAM slider + presets ──────────────────────────────────────
vramSlider.addEventListener('input', () => {
  state.vram = parseInt(vramSlider.value);
  vramDisplay.textContent = state.vram;
  syncPresets();
});

vramPresets.addEventListener('click', e => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  state.vram = parseInt(btn.dataset.v);
  vramSlider.value = state.vram;
  vramDisplay.textContent = state.vram;
  syncPresets();
});

function syncPresets() {
  vramPresets.querySelectorAll('.preset-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.v) === state.vram)
  );
}

// ── Use-case tabs ──────────────────────────────────────────────
usecaseTabs.addEventListener('click', e => {
  const btn = e.target.closest('.tab-item');
  if (!btn) return;
  state.usecase = btn.dataset.uc;
  state.activeBenchmark = 'overall';  // reset to overall when use case changes
  state.page = 1;
  usecaseTabs.querySelectorAll('.tab-item').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
  if (state.models.length) renderBenchmarkTabs();
});

// ── Sort bar ───────────────────────────────────────────────────
sortBar.addEventListener('click', e => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;
  state.sort = btn.dataset.s;
  sortSel.value = state.sort;
  sortBar.querySelectorAll('.sort-btn').forEach(b =>
    b.classList.toggle('active', b === btn)
  );
  fetchModels();
});

quantSel.addEventListener('change', () => { state.quantization = quantSel.value; });
sortSel.addEventListener('change',  () => { state.sort = sortSel.value; syncSortBar(); });

function syncSortBar() {
  sortBar.querySelectorAll('.sort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.s === state.sort)
  );
}

// ── Benchmark ──────────────────────────────────────────────────
function computeOverallScore(benchmarks, usecase) {
  if (!benchmarks) return null;
  if (usecase === 'llm') {
    const w = { mmlu: 0.25, humaneval: 0.20, math: 0.20, gsm8k: 0.15, arc: 0.10, ifeval: 0.10 };
    let sum = 0, wsum = 0;
    for (const [k, weight] of Object.entries(w)) {
      if (benchmarks[k] != null) { sum += benchmarks[k] * weight; wsum += weight; }
    }
    return wsum >= 0.25 ? parseFloat((sum / wsum).toFixed(1)) : null;
  }
  const primary = { embed: 'mteb', vision: 'imagenet_top1', image: 'image_quality', audio: null };
  const pk = primary[usecase];
  return pk && benchmarks[pk] != null ? benchmarks[pk] : null;
}

function getBenchmarkScore(model, key, usecase) {
  if (!model.benchmarks) return null;
  if (key === 'overall') return typeof model.overallScore === 'number'
    ? model.overallScore
    : computeOverallScore(model.benchmarks, usecase);
  return model.benchmarks[key] ?? null;
}

function benchmarkTier(score, key) {
  if (LOWER_IS_BETTER.has(key)) {
    return score <= 5 ? 'high' : score <= 12 ? 'med' : 'low';
  }
  return score >= 75 ? 'high' : score >= 55 ? 'med' : 'low';
}

function renderBenchmarkTabs() {
  const available = USE_CASE_BENCHMARKS[state.usecase] ?? [];
  if (!available.length || !state.models.length) {
    benchmarkBar.style.display = 'none';
    return;
  }
  benchmarkBar.style.display = 'flex';
  benchmarkTabs.innerHTML = available.map(b =>
    `<button class="bm-tab${state.activeBenchmark === b.key ? ' active' : ''}"
             data-bm="${b.key}" title="${b.desc}">${b.label}</button>`
  ).join('');
}

benchmarkBar.addEventListener('click', e => {
  const btn = e.target.closest('.bm-tab');
  if (!btn) return;
  state.activeBenchmark = btn.dataset.bm || 'overall';
  state.page = 1;
  renderBenchmarkTabs();
  if (state.models.length) renderModels(state.models, state.vram);
});

// ── Latency estimation ─────────────────────────────────────────
function estimateLatency(model, gpu, gpuCount, usecase) {
  if (!model.estimatedVRAM || !gpu) return null;
  const eff = gpu.bw * gpuCount * (gpuCount > 1 ? 0.80 : 0.85);

  if (usecase === 'llm') {
    const tokPerSec = Math.round(eff / model.estimatedVRAM);
    const tier = tokPerSec >= 50 ? 'fast' : tokPerSec >= 15 ? 'medium' : 'slow';
    return { label: `~${tokPerSec} tok/s`, tier };
  } else if (usecase === 'image') {
    const sec = (20 * model.estimatedVRAM) / eff;
    const label = sec < 1 ? `~${(sec * 1000).toFixed(0)}ms/img` : `~${sec.toFixed(1)}s/img`;
    return { label, tier: sec < 3 ? 'fast' : sec < 10 ? 'medium' : 'slow' };
  } else if (usecase === 'video') {
    const sec = (50 * model.estimatedVRAM) / eff;
    const label = sec < 10 ? `~${sec.toFixed(1)}s` : `~${sec.toFixed(0)}s/clip`;
    return { label, tier: sec < 20 ? 'fast' : sec < 60 ? 'medium' : 'slow' };
  } else {
    const ms = (1000 * model.estimatedVRAM) / eff;
    const label = ms < 10 ? `<10ms` : ms < 1000 ? `~${ms.toFixed(0)}ms` : `~${(ms/1000).toFixed(1)}s`;
    return { label: `${label}/run`, tier: ms < 50 ? 'fast' : ms < 200 ? 'medium' : 'slow' };
  }
}

// ── Model Detail Modal ─────────────────────────────────────────
function openModal(modelId) {
  const model = state.models.find(m => m.id === modelId);
  if (!model) return;
  trackEvent('Model Click', { modelId });
  modalBody.innerHTML = renderModalContent(model);
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// Click on a competitor card opens that model's modal
document.addEventListener('click', e => {
  const comp = e.target.closest('.competitor-card[data-id]');
  if (comp) openModal(comp.dataset.id);
});

function findCompetitors(model) {
  const candidates = state.models.filter(m => m.id !== model.id);
  const myScore = computeOverallScore(model.benchmarks, state.usecase);

  if (myScore !== null) {
    return candidates
      .map(m => ({ m, score: computeOverallScore(m.benchmarks, state.usecase) }))
      .filter(x => x.score !== null)
      .sort((a, b) => Math.abs(a.score - myScore) - Math.abs(b.score - myScore))
      .slice(0, 3)
      .map(x => x.m);
  }

  // Fallback: similar VRAM
  if (model.estimatedVRAM) {
    return candidates
      .filter(m => m.estimatedVRAM)
      .sort((a, b) =>
        Math.abs(a.estimatedVRAM - model.estimatedVRAM) -
        Math.abs(b.estimatedVRAM - model.estimatedVRAM)
      )
      .slice(0, 3);
  }
  return candidates.slice(0, 3);
}

function getDeploymentOptions(model) {
  return DEPLOYMENT_OPTIONS.filter(opt => {
    if (!opt.usecases.includes(state.usecase)) return false;
    if (opt.minVram && model.estimatedVRAM && model.estimatedVRAM < opt.minVram) return false;
    return true;
  });
}

function renderModalContent(model) {
  const latency = estimateLatency(model, state.selectedGpu, state.gpuCount, state.usecase);
  const competitors = findCompetitors(model);
  const deployOptions = getDeploymentOptions(model);
  const overallScore = typeof model.overallScore === 'number'
    ? model.overallScore
    : computeOverallScore(model.benchmarks, state.usecase);
  const taskDesc = TASK_DESCRIPTIONS[model.pipeline] ?? `${model.task} model.`;

  // Format numbers
  const dlStr   = fmtCount(model.downloads);
  const likeStr = fmtCount(model.likes);

  // Benchmark grid
    const benchDefs = (USE_CASE_BENCHMARKS[state.usecase] ?? []).filter(b => b.key !== 'overall');
  const benchCells = benchDefs.length
    ? benchDefs.map(b => {
        const val = model.benchmarks?.[b.key] ?? null;
        if (val == null) return `
          <div class="bench-cell">
            <div class="bench-cell-label">${b.label}</div>
            <div class="bench-cell-score" style="color:var(--text-muted);font-size:14px">N/A</div>
            <div class="bench-cell-bar"><div class="bench-cell-bar-fill" style="width:0"></div></div>
          </div>`;
        const tier = benchmarkTier(val, b.key);
        const pct  = LOWER_IS_BETTER.has(b.key) ? Math.max(0, 100 - val * 5) : val;
        const label = LOWER_IS_BETTER.has(b.key) ? `${val}%` : `${val.toFixed(1)}%`;
        const srcObj = model.benchmarks_source?.[b.key] ?? null;
        let srcHtml = '';
        if (srcObj && srcObj.source) {
          const s = srcObj.source === 'aa' ? 'AA' : 'HF';
          const u = srcObj.url ? escapeHtml(srcObj.url) : null;
          srcHtml = u ? ` <a href="${u}" target="_blank" rel="noopener" style="font-size:11px;color:var(--text-muted);margin-left:8px">(${s})</a>` : ` <span style="font-size:11px;color:var(--text-muted);margin-left:8px">(${s})</span>`;
        }
        return `
          <div class="bench-cell ${tier}">
            <div class="bench-cell-label">${b.label}${srcHtml}</div>
            <div class="bench-cell-score">${label}</div>
            <div class="bench-cell-bar">
              <div class="bench-cell-bar-fill" style="width:${Math.min(pct,100).toFixed(1)}%"></div>
            </div>
          </div>`;
      }).join('')
    : '';

  // Competitor cards
  const competitorHtml = competitors.length
    ? competitors.map(c => {
        const cScore = typeof c.overallScore === 'number'
          ? c.overallScore
          : computeOverallScore(c.benchmarks, state.usecase);
        const cVram  = c.estimatedVRAM ? `~${c.estimatedVRAM} GB` : 'VRAM ?';
        return `
          <div class="competitor-card" data-id="${escapeHtml(c.id)}">
            <div>
              <div class="competitor-name">${escapeHtml(c.name)}</div>
              <div class="competitor-meta">by ${escapeHtml(c.author)} · ${cVram}</div>
            </div>
            ${cScore !== null
              ? `<div class="competitor-score">${cScore.toFixed(1)}%</div>`
              : `<div class="competitor-score" style="color:var(--text-muted)">—</div>`}
          </div>`;
      }).join('')
    : `<div style="color:var(--text-muted);font-size:13px">Load more models to see alternatives.</div>`;

  // Deployment cards
  const deployHtml = deployOptions.map(opt => `
    <a class="deploy-card" href="${opt.url}" target="_blank" rel="noopener">
      <div class="deploy-name">${opt.name}</div>
      <div class="deploy-desc">${opt.desc}</div>
      <div class="deploy-tags">${opt.tags.map(t => `<span class="deploy-tag">${t}</span>`).join('')}</div>
    </a>`).join('');

  // Security & safety section
  const safety  = inferSafety(model);
  const licInfo = getLicenseInfo(model);
  const safetyColor = SAFETY_COLORS[safety.safetyLevel];
  const safetySegs  = Array.from({ length: 5 }, (_, i) =>
    `<div class="safety-seg${i < safety.safetyLevel ? ' filled' : ''}" ${i < safety.safetyLevel ? `style="background:${safetyColor}"` : ''}></div>`
  ).join('');

  const gatedNote = model.gated
    ? `<span class="chip" style="background:#f59e0b18;border-color:#f59e0b;color:#f59e0b">🔒 Gated — access request required</span>`
    : '';

  return `
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(model.name)}</div>
      <div class="modal-author">by <strong>${escapeHtml(model.author)}</strong></div>
      <div class="modal-badges">
        <span class="chip task">${escapeHtml(model.task)}</span>
        ${model.paramLabel ? `<span class="chip">${model.paramLabel} params</span>` : ''}
        ${gatedNote}
        ${overallScore !== null ? `<span class="chip" style="background:var(--accent-low);border-color:var(--accent);color:var(--accent-h)">★ ${overallScore.toFixed(1)}% overall</span>` : ''}
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Hardware Requirements</div>
      <div class="modal-stats-grid">
        <div class="modal-stat-card">
          <div class="modal-stat-label">Est. VRAM</div>
          <div class="modal-stat-value accent">${model.estimatedVRAM != null ? `${model.estimatedVRAM} GB` : '—'}</div>
        </div>
        <div class="modal-stat-card">
          <div class="modal-stat-label">Your Budget</div>
          <div class="modal-stat-value">${state.vram} GB</div>
        </div>
        ${model.estimatedVRAM != null ? `
        <div class="modal-stat-card">
          <div class="modal-stat-label">Utilization</div>
          <div class="modal-stat-value">${((model.estimatedVRAM / state.vram) * 100).toFixed(0)}%</div>
        </div>` : ''}
        ${model.paramLabel ? `
        <div class="modal-stat-card">
          <div class="modal-stat-label">Parameters</div>
          <div class="modal-stat-value">${model.paramLabel}</div>
        </div>` : ''}
      </div>
    </div>

    ${latency ? `
    <div class="modal-section">
      <div class="modal-section-title">Expected Latency on ${escapeHtml(state.selectedGpu.name)}${state.gpuCount > 1 ? ` ×${state.gpuCount}` : ''}</div>
      <div class="modal-stats-grid">
        <div class="modal-stat-card">
          <div class="modal-stat-label">Throughput</div>
          <div class="modal-stat-value accent">${latency.label}</div>
        </div>
        <div class="modal-stat-card">
          <div class="modal-stat-label">GPU Bandwidth</div>
          <div class="modal-stat-value">${Math.round(state.selectedGpu.bw * state.gpuCount * (state.gpuCount > 1 ? 0.80 : 0.85))} GB/s</div>
        </div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
        Estimates based on memory-bandwidth-bound inference. Actual performance depends on context length, batch size, and driver version.
      </div>
    </div>` : ''}

    ${benchDefs.length ? `
    <div class="modal-section">
      <div class="modal-section-title">Benchmark Scores</div>
      <div class="bench-grid">${benchCells}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted)">
        Scores are approximate and sourced from model cards and published leaderboards. Evaluation setups vary. N/A = no data published for this model.
      </div>
    </div>` : ''}

    <div class="modal-section">
      <div class="modal-section-title">What It's Good For</div>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.6">${taskDesc}</div>
    </div>

    ${deployHtml ? `
    <div class="modal-section">
      <div class="modal-section-title">Deployment Options</div>
      <div class="deploy-grid">${deployHtml}</div>
    </div>` : ''}

    <div class="modal-section">
      <div class="modal-section-title">Security &amp; Safety Profile</div>
      <div class="safety-meter">
        <div class="safety-track">${safetySegs}</div>
        <div class="safety-meter-label" style="color:${safetyColor}">
          ${SAFETY_LABELS[safety.safetyLevel]}
          <span style="color:var(--text-muted);font-weight:400">(${safety.safetyLevel}/5)</span>
        </div>
      </div>
      <div class="security-items">
        <div class="security-item">
          <div class="security-item-label">License</div>
          <div class="security-item-value">
            <span class="license-badge ${licInfo.cls}">${licInfo.label}</span>
            <span class="security-commercial">${licInfo.commercial}</span>
          </div>
        </div>
        <div class="security-item">
          <div class="security-item-label">Alignment Method</div>
          <div class="security-item-value">${safety.alignment}</div>
        </div>
        <div class="security-item">
          <div class="security-item-label">Safety Testing &amp; Red-Teaming</div>
          <div class="security-item-value">${safety.redTeam}</div>
        </div>
        <div class="security-item">
          <div class="security-item-label">Known Risks &amp; Limitations</div>
          <div class="security-item-value" style="color:var(--text-muted)">${safety.knownRisks}</div>
        </div>
      </div>
      <div class="security-disclaimer">
        ⚠ Safety ratings are approximate and based on public disclosures. Always review the full model card and conduct your own red-teaming before production deployment in sensitive applications.
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">Similar Models</div>
      <div class="competitor-list">${competitorHtml}</div>
    </div>

    <div class="modal-footer">
      <a class="modal-btn modal-btn-primary" href="${model.url}" target="_blank" rel="noopener">
        ↗ View & Download on HuggingFace
      </a>
      <a class="modal-btn modal-btn-secondary" href="${model.url}/tree/main" target="_blank" rel="noopener">
        Browse Model Files
      </a>
    </div>`;
}

// ── Fetch models ───────────────────────────────────────────────
async function fetchModels() {
  if (state.loading) return;
  state.loading = true;
  state.page = 1;
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching...';
  // Keep activeBenchmark — re-apply ranking after fetch completes

  showSkeletons();
  resultsCount.innerHTML = 'Fetching models from HuggingFace…';
  sortBar.style.display = 'none';
  benchmarkBar.style.display = 'none';

  try {
    const params = new URLSearchParams({
      vram: state.vram, usecase: state.usecase,
      quantization: state.quantization, sort: state.sort, limit: 100,
    });

    const res = await fetch(`/api/models?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.models = data.models ?? [];
    renderModels(state.models, state.vram);
    renderBenchmarkTabs();
    trackEvent('GPU Search', {
      vram: state.vram,
      usecase: state.usecase,
      quantization: state.quantization,
      resultsCount: state.models.length,
    });

    const count  = state.models.length;
    const qLabel = quantSel.options[quantSel.selectedIndex].text.split('—')[0].trim();
    const gpuLabel = state.selectedGpu
      ? ` on <strong>${state.gpuCount > 1 ? `${state.gpuCount}× ` : ''}${escapeHtml(state.selectedGpu.name)}</strong>`
      : '';
    resultsCount.innerHTML =
      `Found <strong>${count}</strong> model${count !== 1 ? 's' : ''} ` +
      `that fit in <strong>${state.vram} GB</strong> at <strong>${qLabel}</strong>${gpuLabel}`;
    sortBar.style.display = count ? 'flex' : 'none';
    syncSortBar();

    const shareBar = document.getElementById('shareBar');
    const summaryEl = document.getElementById('resultsSummary');
    if (shareBar) shareBar.style.display = count > 0 ? 'flex' : 'none';
    if (summaryEl) {
      if (count > 0) {
        const gpu = state.selectedGpu
          ? `${state.gpuCount > 1 ? `${state.gpuCount}× ` : ''}${state.selectedGpu.name}`
          : `${state.vram} GB VRAM`;
        summaryEl.textContent = `${count} model${count !== 1 ? 's' : ''} fit${count === 1 ? 's' : ''} your ${gpu}`;
        summaryEl.style.display = 'block';
      } else {
        summaryEl.style.display = 'none';
      }
    }
  } catch (err) {
    console.error(err);
    modelGrid.innerHTML = `
      <div class="state-box">
        <div class="state-icon">⚠️</div>
        <div class="state-title">Something went wrong</div>
        <div class="state-desc">${err.message}<br/>Make sure the server is running.</div>
      </div>`;
    resultsCount.textContent = 'Error fetching data';
  } finally {
    state.loading = false;
    searchBtn.disabled = false;
    searchBtn.textContent = 'Find Models →';
  }
}

// ── Render helpers ─────────────────────────────────────────────
function renderModels(models, maxVram) {
  if (!models.length) {
    modelGrid.innerHTML = `
      <div class="state-box">
        <div class="state-icon">😕</div>
        <div class="state-title">No open-source models fit your constraints</div>
        <div class="state-desc">None of the open-source models match <strong>${state.vram} GB</strong> with <strong>${state.quantization}</strong> for <strong>${state.usecase.toUpperCase()}</strong>.
        Try increasing VRAM, choosing a lower-precision quantization (e.g. FP16 → INT8), or selecting a different use case.</div>
      </div>`;
    return;
  }

  // Sort by active benchmark if set
  let sorted = [...models];
  if (state.activeBenchmark) {
    sorted.sort((a, b) => {
      const aS = getBenchmarkScore(a, state.activeBenchmark, state.usecase);
      const bS = getBenchmarkScore(b, state.activeBenchmark, state.usecase);
      if (aS === null && bS === null) return 0;
      if (aS === null) return 1;
      if (bS === null) return -1;
      return LOWER_IS_BETTER.has(state.activeBenchmark) ? aS - bS : bS - aS;
    });
  }

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  if (state.page > totalPages) state.page = Math.max(1, totalPages);
  const startIdx = (state.page - 1) * PAGE_SIZE;
  const page = sorted.slice(startIdx, startIdx + PAGE_SIZE);
  modelGrid.innerHTML = page.map((m, i) => modelCardHTML(m, maxVram, startIdx + i + 1)).join('');
  renderPagination(sorted.length, state.page, totalPages);
  // "Fits!" glow animation on new results
  if (state.page === 1) {
    modelGrid.classList.remove('results-flash');
    void modelGrid.offsetWidth;
    modelGrid.classList.add('results-flash');
    setTimeout(() => modelGrid.classList.remove('results-flash'), 700);
  }
}

function renderPagination(total, currentPage, totalPages) {
  const bar = document.getElementById('pagination');
  if (!bar) return;
  if (total === 0 || totalPages <= 1) { bar.innerHTML = ''; return; }

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end   = Math.min(currentPage * PAGE_SIZE, total);

  // Build page numbers with ellipsis
  const nums = [];
  if (totalPages <= 7) {
    for (let p = 1; p <= totalPages; p++) nums.push(p);
  } else {
    nums.push(1);
    if (currentPage > 3) nums.push('…');
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) nums.push(p);
    if (currentPage < totalPages - 2) nums.push('…');
    nums.push(totalPages);
  }

  const pageHTML = nums.map(p =>
    p === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn${p === currentPage ? ' active' : ''}" onclick="goToPage(${p})">${p}</button>`
  ).join('');

  bar.innerHTML = `<div class="pagination-wrap">
    <span class="pagination-info">${start}–${end} of ${total}</span>
    <div class="page-btns">
      <button class="page-btn page-nav" onclick="goToPage(${currentPage - 1})"${currentPage <= 1 ? ' disabled' : ''}>← Prev</button>
      ${pageHTML}
      <button class="page-btn page-nav" onclick="goToPage(${currentPage + 1})"${currentPage >= totalPages ? ' disabled' : ''}>Next →</button>
    </div>
  </div>`;
}

window.goToPage = function(page) {
  const totalPages = Math.ceil(state.models.length / PAGE_SIZE);
  if (page < 1 || page > totalPages) return;
  state.page = page;
  renderModels(state.models, state.vram);
  modelGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function modelCardHTML(m, maxVram, rank) {
  // VRAM badge
  let badgeClass = 'badge-gray', badgeLabel = 'VRAM ?', barPct = 0, barColor = '#6366f1';
  if (m.estimatedVRAM !== null) {
    const pct = Math.min((m.estimatedVRAM / maxVram) * 100, 100);
    barPct = pct;
    badgeLabel = `~${m.estimatedVRAM} GB`;
    if (pct <= 50)      { badgeClass = 'badge-green';  barColor = '#b8ccbc'; }
    else if (pct <= 80) { badgeClass = 'badge-yellow'; barColor = '#eab308'; }
    else                { badgeClass = 'badge-red';    barColor = '#ef4444'; }
  }

  // Stats
  const dlStr   = fmtCount(m.downloads);
  const likeStr = fmtCount(m.likes);

  const paramStr  = m.paramLabel ? `<span class="chip">${m.paramLabel} params</span>` : '';
  const gatedIcon = m.gated ? `<span title="Gated model">🔒</span>` : '';

  // Latency
  const latency = estimateLatency(m, state.selectedGpu, state.gpuCount, state.usecase);
  const latencyHtml = latency
    ? `<div class="latency-chip ${latency.tier}">⚡ ${latency.label}</div>` : '';

  // Rank badge
  let rankHtml = '';
  if (state.activeBenchmark) {
    const score = getBenchmarkScore(m, state.activeBenchmark, state.usecase);
    if (score !== null) {
      const cls = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-n';
      rankHtml = `<span class="rank-badge ${cls}">#${rank}</span>`;
    }
  }

  // Benchmark scores strip
  let benchHtml = '';
  const cardBenchDefs = (USE_CASE_BENCHMARKS[state.usecase] ?? []).filter(b => b.key !== 'overall');
  if (cardBenchDefs.length) {
    // For 'overall' active state, fall back to the first benchmark that has data
    const overallFallbackKey = state.activeBenchmark === 'overall'
      ? (cardBenchDefs.find(b => m.benchmarks?.[b.key] != null)?.key ?? null)
      : null;
    const pills = cardBenchDefs.map(b => {
      const val = m.benchmarks?.[b.key] ?? null;
      const isActive = state.activeBenchmark === b.key ||
        (state.activeBenchmark === 'overall' && b.key === overallFallbackKey);
      if (val == null) {
        // Only show N/A pill for the actively selected benchmark so cards stay compact
        return isActive ? `<span class="bench-pill" style="color:var(--text-muted)">${b.label}: N/A</span>` : '';
      }
      const tier = benchmarkTier(val, b.key);
      const label = LOWER_IS_BETTER.has(b.key)
        ? `${b.label}: ${val}%`
        : `${b.label}: ${val.toFixed(1)}%`;
      const cls = isActive ? 'highlighted' : tier;
      return `<span class="bench-pill ${cls}">${label}</span>`;
    }).filter(Boolean).slice(0, 4);

    // Fallback: if HF benchmarks missing, try to show AA intelligence metrics in same pill style
    if (!pills.length && m.artificialAnalysis?.metrics) {
      const aaIntel = m.artificialAnalysis.metrics.intelligence || (typeof m.artificialAnalysis.metrics === 'object' ? m.artificialAnalysis.metrics : null);
      if (aaIntel && typeof aaIntel === 'object') {
        const aaEntries = Object.entries(aaIntel).slice(0, 4);
        const aaPills = aaEntries.map(([k,v]) => {
          const short = k.length > 18 ? k.slice(0,16) + '…' : k;
          const val = typeof v === 'number' ? v : (parseFloat(v) || 0);
          const keyLower = k.toLowerCase();
          const tier = benchmarkTier(val, keyLower);
          const label = LOWER_IS_BETTER.has(keyLower) ? `${short}: ${val}%` : `${short}: ${val.toFixed ? val.toFixed(1) + '%' : val + '%'} `;
          return `<span class="bench-pill ${tier}">${escapeHtml(label)}</span>`;
        });
        if (aaPills.length) benchHtml = `<div class="bench-row">${aaPills.join('')}</div>`;
      }
    }

    if (pills.length) benchHtml = `<div class="bench-row">${pills.join('')}</div>`;
  }

  // Tags
  const interestingTags = m.tags
    .filter(t => !['transformers','pytorch','safetensors','gguf','en'].includes(t))
    .slice(0, 3);
  const tagChips = interestingTags.map(t => `<span class="chip">${t}</span>`).join('');

  return `
  <div class="model-card" data-id="${escapeHtml(m.id)}" onclick="openModal('${escapeHtml(m.id)}')">
    <div class="card-top">
      <div>
        <div class="card-title">${escapeHtml(m.name)} ${gatedIcon}</div>
        <div class="card-author">by ${escapeHtml(m.author)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:flex-start;flex-shrink:0">
        ${rankHtml}
        <div class="card-badge ${badgeClass}">${badgeLabel}</div>
      </div>
    </div>

    ${m.estimatedVRAM !== null ? `
    <div class="vram-bar-wrap">
      <div class="vram-bar-label">
        <span>VRAM</span><span>${m.estimatedVRAM} / ${maxVram} GB</span>
      </div>
      <div class="vram-bar">
        <div class="vram-bar-fill" style="width:${barPct.toFixed(1)}%;background:${barColor}"></div>
      </div>
    </div>` : ''}

    ${benchHtml}

    <div class="card-meta">
      <span class="chip task">${escapeHtml(m.task)}</span>
      ${paramStr}${tagChips}
    </div>

    ${latencyHtml}

    <div class="card-stats">
      <div class="stat">⬇️ ${dlStr}</div>
      <div class="stat">❤️ ${likeStr}</div>
    </div>
  </div>`;
}

function showSkeletons() {
  modelGrid.innerHTML = Array.from({ length: 8 }).map(() => `
    <div class="skeleton-card">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <div>
          <div class="skeleton" style="height:14px;width:140px;margin-bottom:6px"></div>
          <div class="skeleton" style="height:11px;width:80px"></div>
        </div>
        <div class="skeleton" style="height:22px;width:60px;border-radius:20px"></div>
      </div>
      <div><div class="skeleton" style="height:6px;width:100%;margin-bottom:8px"></div></div>
      <div style="display:flex;gap:5px">
        <div class="skeleton" style="height:18px;width:90px;border-radius:20px"></div>
        <div class="skeleton" style="height:18px;width:60px;border-radius:20px"></div>
      </div>
      <div style="display:flex;gap:14px;padding-top:10px;border-top:1px solid var(--border)">
        <div class="skeleton" style="height:11px;width:80px"></div>
        <div class="skeleton" style="height:11px;width:60px"></div>
      </div>
    </div>`).join('');
}

function escapeHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtCount(n) {
  if (n == null) return 'N/A';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

// ── Initialize ─────────────────────────────────────────────────
renderGpuGrid();

// ── Global search (ArtificialAnalysis) ───────────────────────
async function doGlobalSearch() {
  const q = (globalSearch?.value || '').trim();
  if (!q) { globalSearch?.focus(); return; }

  // UX: show brief loading state
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching...';
  showSkeletons();
  resultsCount.textContent = `Searching ArtificialAnalysis for "${q}"…`;

  try {
    const res = await fetch(`/api/search?name=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = data.results || [];
    if (!list.length) {
      modelGrid.innerHTML = `<div class="state-box"><div class="state-icon">🔎</div><div class="state-title">No matches</div><div class="state-desc">No ArtificialAnalysis models matched "${escapeHtml(q)}".</div></div>`;
      resultsCount.textContent = `No matches for "${escapeHtml(q)}"`;
      return;
    }

    // Fetch the current HF+AA processed model list (so that AA entries are attached or injected as stubs)
    const params = new URLSearchParams({ vram: state.vram, usecase: state.usecase, quantization: state.quantization || 'fp16', limit: '150' });
    const modelsRes = await fetch(`/api/models?${params.toString()}`);
    const modelsJson = modelsRes.ok ? await modelsRes.json() : null;
    const allModels = modelsJson?.models || [];

    // Match AA search results to the processed model objects (match by URL or AA slug)
    const matched = [];
    const unmatchedAA = [];
    for (const a of list) {
      const aaUrl = (a.url || '').toString();
      const aaSlug = (() => { try { return new URL(aaUrl).pathname.split('/').filter(Boolean).pop().toLowerCase(); } catch(e){ return (a.id||a.model||a.title||'').toString().toLowerCase(); }})();
      const found = allModels.find(m => (m.artificialAnalysis && (m.artificialAnalysis.url === aaUrl || (m.artificialAnalysis.slug && m.artificialAnalysis.slug === aaSlug))) || (m.id && m.id.toLowerCase().includes(aaSlug)));
      if (found) matched.push(found);
      else unmatchedAA.push(a);
    }

    if (matched.length) {
      // Render matched models using the same renderer as "Find Models" so cards look identical
      state.models = matched; // set so openModal works
      state.page = 1;
      renderModels(state.models, state.vram);
      resultsCount.textContent = `${matched.length} model${matched.length>1?'s':''} matched for "${escapeHtml(q)}"`;
    } else {
      // Fallback: render compact AA-only list (user can open AA modal)
      modelGrid.innerHTML = list.map((a, idx) => `
        <div class="model-card" data-aa-index="${idx}" onclick="openAAModalFromSearch(${idx})">
          <div class="card-top">
            <div>
              <div class="card-title">${escapeHtml(a.title || a.name || a.model || a.id || 'Untitled')}</div>
              <div class="card-author">Source: ArtificialAnalysis</div>
            </div>
            <div style="display:flex;gap:6px;align-items:flex-start;flex-shrink:0">
              <div class="card-badge badge-gray">AA</div>
            </div>
          </div>
          <div style="margin-top:8px;color:var(--text-muted);font-size:13px">${escapeHtml(a.url || '')}</div>
        </div>`).join('');
      resultsCount.textContent = `${list.length} results for "${escapeHtml(q)}"`;
    }

    // Save AA raw results for modal fallback
    window.__aa_search_results = list;

  } catch (err) {
    console.error(err);
    modelGrid.innerHTML = `<div class="state-box"><div class="state-icon">⚠️</div><div class="state-title">Search failed</div><div class="state-desc">${escapeHtml(err.message)}</div></div>`;
    resultsCount.textContent = 'Search error';
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Find Models →';
  }
}

function openAAModalFromSearch(idx) {
  const list = window.__aa_search_results || [];
  const item = list[idx];
  if (!item) return;
  openAAModal(item);
}

function openAAModal(item) {
  const metrics = item.metrics || {};
  const intel = metrics.intelligence && typeof metrics.intelligence === 'object'
    ? metrics.intelligence
    : (typeof metrics === 'object' && Object.keys(metrics).some(k => typeof metrics[k] === 'number') ? metrics : null);

  const renderIntelRows = () => {
    if (!intel) return '<div style="color:var(--text-muted)">No intelligence metrics available.</div>';
    // Build bench-cell style grid consistent with modal benchmark layout
    const entries = Object.entries(intel);
    if (!entries.length) return '<div style="color:var(--text-muted)">No intelligence metrics available.</div>';
    return `<div style="display:grid;grid-template-columns:1fr;gap:8px">${entries.map(([k,v]) => {
      const key = k.toString();
      const val = (typeof v === 'number') ? v : (parseFloat(v) || 0);
      const lowKey = key.toLowerCase();
      const pct = LOWER_IS_BETTER.has(lowKey) ? Math.max(0, 100 - Math.min(val, 100)) : Math.min(Math.max(val, 0), 100);
      const tier = (LOWER_IS_BETTER.has(lowKey) ? (val <= 5 ? 'high' : val <= 12 ? 'med' : 'low') : (val >= 75 ? 'high' : val >= 55 ? 'med' : 'low'));
      const display = typeof v === 'number' ? `${v}` : escapeHtml(String(v));
      return `
        <div class="bench-cell ${tier}">
          <div class="bench-cell-label" style="font-weight:600">${escapeHtml(key)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
            <div style="font-size:13px;color:var(--text-muted)">${display}</div>
            <div style="width:40%;text-align:right;font-size:12px;color:var(--text-muted)">${LOWER_IS_BETTER.has(lowKey) ? '' : (isNaN(val) ? '' : (Math.round(val) + '%'))}</div>
          </div>
          <div class="bench-cell-bar" style="margin-top:8px"><div class="bench-cell-bar-fill" style="width:${Math.min(Math.max(pct,0),100)}%;background:${tier === 'high' ? '#b8ccbc' : tier === 'med' ? '#eab308' : '#ef4444'}"></div></div>
        </div>`;
    }).join('')}</div>`;
  };

  // Other simple numeric metrics
  const otherMetrics = ['speed','wer','math','input_price','output_price'];
  const otherRows = otherMetrics.map(k => {
    if (metrics[k] == null) return '';
    return `<div style="display:flex;justify-content:space-between;padding:6px 8px;border-top:1px solid var(--border)"><div style="color:var(--text-muted)">${escapeHtml(k)}</div><div style="font-family: 'JetBrains Mono', monospace">${escapeHtml(String(metrics[k]))}</div></div>`;
  }).join('');

  modalBody.innerHTML = `
    <h2 style="margin-bottom:8px">${escapeHtml(item.title || item.name || item.model || item.id || 'Model')}</h2>
    <div style="margin-bottom:10px;color:var(--text-muted)"><a href="${escapeHtml(item.url||'')}" target="_blank" rel="noopener">View on ArtificialAnalysis</a></div>
    <div style="margin-bottom:12px">${escapeHtml(item.description || '')}</div>
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;max-height:420px;overflow:auto">
      ${renderIntelRows()}
      ${otherRows ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">${otherRows}</div>` : ''}
    </div>
  `;
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Typeahead / suggestions for global search
let __suggestions = [];
let __suggestionIndex = -1;
function debounce(fn, wait) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

async function fetchSuggestions(q) {
  if (!q || q.length < 2) { clearSuggestions(); return; }
  try {
    const res = await fetch(`/api/search?name=${encodeURIComponent(q)}`);
    if (!res.ok) return clearSuggestions();
    const data = await res.json();
    const list = (data.results || []).slice(0, 8);
    __suggestions = list;
    renderSuggestions(list);
  } catch (e) {
    console.warn('Suggestion fetch failed', e);
    clearSuggestions();
  }
}

const debouncedFetch = debounce(fetchSuggestions, 220);

function renderSuggestions(list) {
  if (!globalSearchSuggestions) return;
  if (!list || !list.length) { clearSuggestions(); return; }
  globalSearchSuggestions.innerHTML = list.map((a, i) => {
    const title = escapeHtml(a.title || a.name || a.model || a.id || 'Untitled');
    const sub = escapeHtml(a.url ? new URL(a.url).pathname.split('/').pop() : (a.description || 'ArtificialAnalysis'));
    return `<div role="option" tabindex="0" class="search-suggestion-item" data-idx="${i}">
      <div style="flex:1">${title}</div>
      <div class="search-suggestion-sub">${sub}</div>
    </div>`;
  }).join('');
  globalSearchSuggestions.hidden = false;
  __suggestionIndex = -1;

  // attach click handlers
  globalSearchSuggestions.querySelectorAll('.search-suggestion-item').forEach(el => {
    el.addEventListener('mousedown', e => { // use mousedown to fire before blur
      const idx = parseInt(el.dataset.idx);
      selectSuggestion(idx);
      e.preventDefault();
    });
  });
}

function clearSuggestions() {
  if (!globalSearchSuggestions) return;
  globalSearchSuggestions.innerHTML = '';
  globalSearchSuggestions.hidden = true;
  __suggestions = [];
  __suggestionIndex = -1;
}

function highlightSuggestion(i) {
  if (!globalSearchSuggestions) return;
  const items = Array.from(globalSearchSuggestions.querySelectorAll('.search-suggestion-item'));
  items.forEach((it, idx) => it.classList.toggle('active', idx === i));
}

function selectSuggestion(i) {
  const item = __suggestions[i];
  if (!item) return;
  globalSearch.value = (item.title || item.name || item.model || item.id || '');
  clearSuggestions();
  // Try to find a matching processed model and open the HF-style modal.
  const aaUrl = (item.url || '').toString();
  const aaSlug = (() => { try { return new URL(aaUrl).pathname.split('/').filter(Boolean).pop().toLowerCase(); } catch(e){ return (item.id||item.model||item.title||'').toString().toLowerCase(); }})();
  // Try to find in currently loaded models first
  let found = state.models.find(m => (m.artificialAnalysis && (m.artificialAnalysis.url === aaUrl || (m.artificialAnalysis.slug && m.artificialAnalysis.slug === aaSlug))) || (m.id && m.id.toLowerCase().includes(aaSlug)));
  if (found) {
    openModal(found.id);
    return;
  }

  // Otherwise fetch /api/models to search for a matching model (include generous limit)
  (async () => {
    try {
      const params = new URLSearchParams({ vram: state.vram, usecase: state.usecase, limit: '150' });
      const res = await fetch(`/api/models?${params.toString()}`);
      if (!res.ok) throw new Error('models fetch failed');
      const json = await res.json();
      const all = json.models || [];
      found = all.find(m => (m.artificialAnalysis && (m.artificialAnalysis.url === aaUrl || (m.artificialAnalysis.slug && m.artificialAnalysis.slug === aaSlug))) || (m.id && m.id.toLowerCase().includes(aaSlug)));
      if (found) {
        // ensure state.models includes it so modal helpers work
        state.models = [found];
        renderModels(state.models, state.vram);
        openModal(found.id);
        return;
      }
    } catch (e) {
      console.warn('Failed to resolve suggestion to model:', e.message);
    }
    // Fallback: show raw AA modal
    openAAModal(item);
  })();
}

// Input & keyboard handling
if (globalSearch) {
  globalSearch.addEventListener('input', e => {
    const v = (e.target.value || '').trim();
    debouncedFetch(v);
  });

  globalSearch.addEventListener('keydown', e => {
    if (!__suggestions.length) {
      if (e.key === 'Enter') return doGlobalSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      __suggestionIndex = Math.min(__suggestions.length - 1, __suggestionIndex + 1);
      highlightSuggestion(__suggestionIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      __suggestionIndex = Math.max(0, __suggestionIndex - 1);
      highlightSuggestion(__suggestionIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (__suggestionIndex >= 0) selectSuggestion(__suggestionIndex);
      else doGlobalSearch();
    } else if (e.key === 'Escape') {
      clearSuggestions();
    }
  });

  // hide suggestions on blur (allow click via mousedown handler)
  globalSearch.addEventListener('blur', () => setTimeout(clearSuggestions, 150));
}

if (globalSearchBtn) globalSearchBtn.addEventListener('click', doGlobalSearch);
