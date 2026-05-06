# RepairMCP

Open infrastructure connecting AI tools to authoritative shop-side data in the vehicle repair industry.

## Why this exists

The collision and broader vehicle repair industry has rich, authoritative data — DEG inquiries, I-CAR procedures, OEM service bulletins, position statements, and decades of resolved technical questions — but it's scattered across dozens of websites and PDFs, mostly invisible to the AI tools shop owners and estimators are starting to use every day.

Meanwhile, insurer- and information-provider-aligned data is centralized, well-funded, and increasingly AI-ready. The shop side is at risk of being left out of the AI estimating future entirely.

RepairMCP is an open-source effort to fix that. We build [Model Context Protocol](https://modelcontextprotocol.io) servers that expose authoritative shop-side data sources directly into Claude, ChatGPT, and any AI tool that supports MCP — with proper citations, source attribution, and zero proprietary lock-in.

## What we're building

A vertical-agnostic core, with thin adapters per data source. One protocol, many sources, citation-grade outputs.

**First vertical (in development):**
- **DEG** — Database Enhancement Gateway inquiry search and citation

**On the roadmap:**
- I-CAR Repairability Technical Support
- NHTSA recalls and vehicle data
- OEM service bulletins and position statements
- Cross-vertical search and semantic match

## Why this matters

**For shops and estimators**: real industry citations directly inside the AI tool you're already using to write supplements. No tab-switching, no guessing, no hallucinated inquiry numbers.

**For AI tool builders**: a clean, open, citation-grade source of vehicle repair data you can plug into your product without licensing negotiations.

**For industry organizations**: a way to make your authoritative data visible in the AI surfaces your members are already using — without becoming a tech company.

## Principles

- **Open source** — Apache 2.0 licensed, governed in the open
- **Citation-grade** — every output includes source, ID, date, and URL
- **Vertical-agnostic** — one protocol, many domains
- **Shop-aligned** — built for the shop side of the industry first
- **No vendor lock-in** — works with any MCP-compatible AI tool

## Status

Pre-release. First MCP server (DEG) in development. Public launch coming.

## Get involved

This is being built collaboratively with industry leaders. If you represent a shop-side data source, run an industry organization, or want to contribute, open an issue or discussion in the [main repository](https://github.com/Repairmcp/repairmcp).
