---
paths:
  - "**/ai/**"
  - "**/llm/**"
  - "**/prompts/**"
  - "**/*prompt*"
  - "**/*agent*"
---

# AI features

Learned the expensive way: one inflated prompt degrades as it grows, and nobody can tell
which sentence broke it.

- **A pipeline of stages, not a bigger prompt.** Collect → typed brief → generate →
  validate. Each stage produces **structured, typed output** the next stage consumes;
  when quality drops, you can point at the stage that dropped it.
- **A validator stage is cheaper than a smarter generator.** A small model checking the
  output against explicit criteria catches more than another paragraph of instructions
  in the writer's prompt.
- **Ground generated text in concrete input.** The generator sees the actual data — the
  diff, the records, the facts — and every claim in its output must trace to them.
  Specificity beats adjectives; stock phrases and marketing clichés are defects, not
  style.
- **Prompts are code.** They live in the repository, change through reviewed diffs with
  reasons, and model identifiers are centralised in one module — not scattered as string
  literals.
- **The cheapest model that passes the validator wins.** Upgrading the model is a
  measured decision against the validator's pass rate, not a reflex.
