<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# LLM Wiki Knowledge Base

For project context, use the `llm-wiki` MCP tools to search the knowledge base:
- `llm_wiki_status` — check if LLM Wiki is running
- `llm_wiki_search` — search wiki pages with query
- `llm_wiki_files` — list wiki files
- `llm_wiki_read_file` — read specific wiki pages
- `llm_wiki_graph` — explore knowledge graph connections

The wiki lives at `/home/xxx/llm-wiki-projects/dance4ever/` and contains:
- Obsidian vault notes (colores, comandos, programa, terreno)
- Project instructions and architecture docs
- Auto-generated summaries, entities, and concepts

Before starting any task, search the wiki for relevant context to avoid redundant processing.
