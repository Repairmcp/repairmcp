import { useState, useEffect } from 'react';
import { Database, Server, FileText, Cloud, MapPin, ArrowRight, Plug, Globe, FileSearch, Building2, Truck, Package, ChevronRight, Sparkles } from 'lucide-react';

export default function RepairMCPExplainer() {
  const [activeSection, setActiveSection] = useState('intro');
  const [flowStep, setFlowStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  // Color palette — industrial editorial
  const colors = {
    ink: '#1a1f2e',
    paper: '#f5f0e8',
    cream: '#faf6ee',
    rust: '#b85c38',
    amber: '#d4a04c',
    sage: '#5a7d6c',
    steel: '#6b7989',
    line: '#d4cdb9',
  };

  // Auto-advance flow when playing
  useEffect(() => {
    if (!autoPlay) return;
    if (flowStep >= 5) {
      setAutoPlay(false);
      return;
    }
    const t = setTimeout(() => setFlowStep(s => s + 1), 1800);
    return () => clearTimeout(t);
  }, [autoPlay, flowStep]);

  const sections = [
    { id: 'intro', label: 'The Problem' },
    { id: 'apis', label: 'APIs' },
    { id: 'no-api', label: 'No API' },
    { id: 'mcp', label: 'What is MCP' },
    { id: 'cloud', label: 'Where Data Lives' },
    { id: 'flow', label: 'The Full Flow' },
    { id: 'why', label: 'Why It Matters' },
  ];

  return (
    <div
      style={{
        backgroundColor: colors.cream,
        color: colors.ink,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        minHeight: '100vh',
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700;9..144,900&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <header
        style={{
          borderBottom: `1px solid ${colors.line}`,
          backgroundColor: colors.cream,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-baseline gap-3">
            <div
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: '1.5rem',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                color: colors.ink,
              }}
            >
              RepairMCP
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.steel,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              / a primer on MCP, APIs &amp; cloud
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  fontSize: '0.8rem',
                  padding: '0.4rem 0.7rem',
                  borderRadius: '0.25rem',
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  backgroundColor: activeSection === s.id ? colors.ink : 'transparent',
                  color: activeSection === s.id ? colors.cream : colors.steel,
                  transition: 'all 0.15s',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">

        {/* INTRO */}
        {activeSection === 'intro' && (
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.rust,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              § 01 / The Problem
            </div>
            <h1
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 'clamp(2rem, 5vw, 4rem)',
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                marginBottom: '2rem',
              }}
            >
              The collision industry has{' '}
              <em style={{ fontStyle: 'italic', color: colors.rust }}>incredible</em> authoritative data.
              <br />
              The AI tools your shops use can find it &mdash; but can't reliably <em style={{ fontStyle: 'italic' }}>cite</em> it.
            </h1>

            <div className="grid md:grid-cols-2 gap-12 mt-16">
              <div>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: colors.ink, marginBottom: '1rem' }}>
                  DEG inquiries. I-CAR repair procedures. OEM service bulletins. SCRS position statements.
                  Decades of resolved technical questions.
                </p>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: colors.ink, marginBottom: '1rem' }}>
                  All of it scattered across dozens of websites and PDFs. AI tools <em>can</em> search the
                  open web and find references &mdash; but they can't reliably query specific records, cite
                  them by inquiry number, or pull them into a workflow a shop can actually use.
                </p>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: colors.ink }}>
                  Meanwhile, insurer- and information-provider-aligned data is centralized,
                  well-funded, and increasingly AI-ready. The shop side risks being{' '}
                  <span style={{ borderBottom: `2px solid ${colors.rust}`, paddingBottom: 1 }}>
                    bypassed by the AI estimating wave entirely.
                  </span>
                </p>
              </div>

              <div
                style={{
                  backgroundColor: colors.paper,
                  border: `1px solid ${colors.line}`,
                  padding: '2rem',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.7rem',
                    color: colors.steel,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: '1rem',
                  }}
                >
                  The fragmentation
                </div>
                <div className="space-y-3">
                  {['DEG', 'I-CAR RTS', 'NHTSA', 'OEM bulletins', 'SCRS', 'CIC', 'AASP', 'State assoc.'].map((src, i) => (
                    <div
                      key={src}
                      className="flex items-center gap-3"
                      style={{
                        padding: '0.6rem 0.8rem',
                        backgroundColor: colors.cream,
                        border: `1px solid ${colors.line}`,
                        fontSize: '0.9rem',
                      }}
                    >
                      <Database size={14} style={{ color: colors.steel }} />
                      <span style={{ flex: 1 }}>{src}</span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '0.7rem',
                          color: colors.rust,
                        }}
                      >
                        not citable by AI
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-20 flex items-center gap-4">
              <button
                onClick={() => setActiveSection('apis')}
                style={{
                  backgroundColor: colors.ink,
                  color: colors.cream,
                  padding: '0.8rem 1.5rem',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.95rem',
                }}
              >
                Continue: how AI gets data <ChevronRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* APIs */}
        {activeSection === 'apis' && (
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.rust,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              § 02 / The Easy Path
            </div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                marginBottom: '2rem',
              }}
            >
              When the data source has an{' '}
              <em style={{ fontStyle: 'italic', color: colors.rust }}>API</em>,
              we walk in the front door.
            </h2>

            <div className="grid md:grid-cols-2 gap-12 mt-12">
              <div>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                  An <strong>API</strong> &mdash; Application Programming Interface &mdash; is a structured
                  storefront a website opens up to other software.
                </p>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                  Instead of you visiting their website with your eyeballs and clicking around, your software
                  asks their software directly: <em>&ldquo;please give me record #14732.&rdquo;</em> Their software
                  responds with the data, instantly.
                </p>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7 }}>
                  When this exists, life is easy. Our MCP server just calls their API live whenever Claude asks.
                  No storage, no sync, no scraping &mdash; the data comes straight from the source.
                </p>
              </div>

              <div
                style={{
                  backgroundColor: colors.paper,
                  border: `1px solid ${colors.line}`,
                  padding: '2rem',
                }}
              >
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.7rem',
                    color: colors.steel,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: '1.5rem',
                  }}
                >
                  Storefront analogy
                </div>

                <div className="space-y-4">
                  <AnalogyRow
                    icon={<Building2 size={18} />}
                    label="The website's API"
                    text="A storefront with shelves of items"
                    colors={colors}
                  />
                  <AnalogyRow
                    icon={<Package size={18} />}
                    label="The data records"
                    text="Items on the shelves, labeled clearly"
                    colors={colors}
                  />
                  <AnalogyRow
                    icon={<FileSearch size={18} />}
                    label="Our request"
                    text="&ldquo;I'd like item #14732, please.&rdquo;"
                    colors={colors}
                  />
                  <AnalogyRow
                    icon={<Truck size={18} />}
                    label="The response"
                    text="Item delivered across the counter, immediately"
                    colors={colors}
                    last
                  />
                </div>

                <div
                  style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    backgroundColor: colors.cream,
                    border: `1px dashed ${colors.line}`,
                    fontSize: '0.85rem',
                    color: colors.sage,
                    fontStyle: 'italic',
                    lineHeight: 1.6,
                  }}
                >
                  Example: <strong>NHTSA</strong> (the federal vehicle safety agency) has a free public API.
                  Our future NHTSA MCP will be 90% API client, no scraping needed.
                </div>
              </div>
            </div>

            <NavFooter
              onPrev={() => setActiveSection('intro')}
              onNext={() => setActiveSection('no-api')}
              prevLabel="The Problem"
              nextLabel="When there's no API"
              colors={colors}
            />
          </section>
        )}

        {/* NO API */}
        {activeSection === 'no-api' && (
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.rust,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              § 03 / The Hard Path
            </div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                marginBottom: '2rem',
              }}
            >
              Most shop-side data has{' '}
              <em style={{ fontStyle: 'italic', color: colors.rust }}>no API</em>.
              <br />
              We have to build the bridge ourselves.
            </h2>

            <p style={{ fontSize: '1.1rem', lineHeight: 1.7, maxWidth: '60ch', marginBottom: '3rem' }}>
              DEG, most state associations, OEM bulletins as PDFs, parts of I-CAR &mdash; none of it ships an API.
              When that's the case, we have two choices:
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              <OptionCard
                title="Live scraping"
                tag="Option A"
                colors={colors}
                accent={colors.rust}
                pros={['Always fresh', 'Simple architecture']}
                cons={[
                  '5-15 second response times',
                  'Fragile &mdash; site changes break us',
                  'Hammers source servers',
                  'Source\'s own search may need JavaScript',
                ]}
                summary="Spin up a browser on every tool call. Possible &mdash; but slow and rude."
              />
              <OptionCard
                title="Scrape + cache locally"
                tag="Option B  / what we're doing"
                colors={colors}
                accent={colors.sage}
                highlighted
                pros={[
                  'Sub-second response times',
                  'Resilient to source outages',
                  'One polite scrape per day',
                  'Better search than the source',
                ]}
                cons={['Data up to 24h stale (acceptable)']}
                summary="Build our own warehouse. Restock once a night. Serve every shop instantly."
              />
            </div>

            <div
              style={{
                marginTop: '3rem',
                padding: '2rem',
                backgroundColor: colors.ink,
                color: colors.cream,
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.7rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginBottom: '1rem',
                  color: colors.amber,
                }}
              >
                The Google parallel
              </div>
              <p style={{ fontSize: '1.05rem', lineHeight: 1.7, fontStyle: 'italic', maxWidth: '70ch' }}>
                When you Google something, Google doesn't visit every website live to answer you.
                Google scraped the entire web in advance and built an index. Your query hits Google's index,
                not the source sites. <strong style={{ color: colors.amber, fontStyle: 'normal' }}>That's why search is fast.</strong>
                <br /><br />
                We're doing the same thing, scoped to authoritative shop-side data. Maintain an indexed local
                copy so queries are instant. This is how every major search engine, AI tool, and data product
                works &mdash; not a workaround.
              </p>
            </div>

            <NavFooter
              onPrev={() => setActiveSection('apis')}
              onNext={() => setActiveSection('mcp')}
              prevLabel="APIs"
              nextLabel="What is MCP, then?"
              colors={colors}
            />
          </section>
        )}

        {/* MCP */}
        {activeSection === 'mcp' && (
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.rust,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              § 04 / The Bridge
            </div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                marginBottom: '2rem',
              }}
            >
              <em style={{ fontStyle: 'italic', color: colors.rust }}>MCP</em> is the standardized form
              <br />
              every AI tool uses to ask for data.
            </h2>

            <p style={{ fontSize: '1.1rem', lineHeight: 1.7, maxWidth: '60ch', marginBottom: '3rem' }}>
              <strong>Model Context Protocol</strong> is a specification published by Anthropic in late 2024,
              now adopted by OpenAI, Google, and every major AI tool. It standardizes <em>how</em> AI clients
              ask outside servers for information &mdash; like a universal request form everyone agrees to use.
            </p>

            <div
              style={{
                backgroundColor: colors.paper,
                border: `1px solid ${colors.line}`,
                padding: '2rem',
                marginBottom: '3rem',
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.7rem',
                  color: colors.steel,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '2rem',
                }}
              >
                The County Clerk Analogy
              </div>

              <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                <AnalogyRow icon={<FileSearch size={18} />} label="The citizen at the counter" text="Claude (or ChatGPT, Cursor, Copilot...)" colors={colors} />
                <AnalogyRow icon={<FileText size={18} />} label="The standardized request form" text="The MCP tool — e.g. deg_get_inquiry" colors={colors} accent />
                <AnalogyRow icon={<Server size={18} />} label="The county clerk reading the form" text="Our MCP server (Cloudflare Worker)" colors={colors} />
                <AnalogyRow icon={<Database size={18} />} label="The file cabinets" text="Our database (Cloudflare D1)" colors={colors} />
                <AnalogyRow icon={<Package size={18} />} label="The fast-access front desk" text="Our cache layer (Cloudflare KV)" colors={colors} />
                <AnalogyRow icon={<Truck size={18} />} label="The records themselves" text="Scraped DEG inquiries, fully indexed" colors={colors} last />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <KeyPoint
                heading="Same form, every AI tool"
                text="Build an MCP once. Claude uses it. ChatGPT uses it. Cursor, Copilot, Perplexity &mdash; everyone supports the same protocol. No per-tool integration."
                colors={colors}
              />
              <KeyPoint
                heading="MCP doesn't fetch data itself"
                text="MCP is the form. The form is just paper &mdash; it doesn't go to the warehouse. The clerk does. Our server is the clerk."
                colors={colors}
              />
              <KeyPoint
                heading="One protocol, many sources"
                text="DEG today, I-CAR tomorrow, NHTSA next, OEM bulletins after that. Each source has its own MCP server, but they all speak the same language."
                colors={colors}
              />
            </div>

            <NavFooter
              onPrev={() => setActiveSection('no-api')}
              onNext={() => setActiveSection('cloud')}
              prevLabel="No API"
              nextLabel="Where the data lives"
              colors={colors}
            />
          </section>
        )}

        {/* CLOUD */}
        {activeSection === 'cloud' && (
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.rust,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              § 05 / The Storage Layer
            </div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                marginBottom: '2rem',
              }}
            >
              Our warehouse isn't in one place.
              <br />
              It's <em style={{ fontStyle: 'italic', color: colors.rust }}>everywhere</em>.
            </h2>

            <p style={{ fontSize: '1.1rem', lineHeight: 1.7, maxWidth: '60ch', marginBottom: '3rem' }}>
              "The cloud" is a network of physical buildings &mdash; data centers &mdash; full of computers
              and storage hardware, run by companies like Cloudflare, Amazon, Google, and Microsoft.
              We rent space inside that network. Our code and data live there.
            </p>

            <div
              style={{
                backgroundColor: colors.paper,
                border: `1px solid ${colors.line}`,
                padding: '2.5rem',
                marginBottom: '3rem',
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.7rem',
                  color: colors.steel,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '1.5rem',
                }}
              >
                The Edge Network
              </div>

              <div className="relative" style={{ minHeight: '280px' }}>
                {/* Central source */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '0',
                    transform: 'translateX(-50%)',
                    textAlign: 'center',
                    zIndex: 2,
                  }}
                >
                  <div
                    style={{
                      width: '110px',
                      padding: '0.7rem',
                      backgroundColor: colors.ink,
                      color: colors.cream,
                      border: `2px solid ${colors.amber}`,
                    }}
                  >
                    <Database size={18} className="mx-auto mb-1" style={{ color: colors.amber }} />
                    <div style={{ fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>SOURCE</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>degweb.org</div>
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: colors.steel,
                      marginTop: '0.25rem',
                      fontStyle: 'italic',
                    }}
                  >
                    once-a-day truck →
                  </div>
                </div>

                {/* Edge nodes */}
                <div
                  className="grid grid-cols-2 md:grid-cols-4 gap-4"
                  style={{ marginTop: '160px' }}
                >
                  {['Maine', 'Texas', 'Oregon', 'Florida'].map((loc, i) => (
                    <div key={loc} className="text-center">
                      <div
                        style={{
                          padding: '0.8rem',
                          backgroundColor: colors.cream,
                          border: `1px solid ${colors.line}`,
                          borderTop: `3px solid ${colors.sage}`,
                        }}
                      >
                        <Cloud size={16} className="mx-auto mb-1" style={{ color: colors.sage }} />
                        <div style={{ fontSize: '0.65rem', fontFamily: "'JetBrains Mono', monospace", color: colors.steel, letterSpacing: '0.05em' }}>EDGE</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{loc}</div>
                        <div style={{ fontSize: '0.7rem', color: colors.steel, fontStyle: 'italic' }}>copy of warehouse</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p
                style={{
                  marginTop: '2rem',
                  fontSize: '0.95rem',
                  fontStyle: 'italic',
                  color: colors.sage,
                  textAlign: 'center',
                  maxWidth: '50ch',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  lineHeight: 1.6,
                }}
              >
                Cloudflare has 300+ data centers globally. A shop in Maine hits the Maine warehouse,
                a shop in Texas hits the Texas warehouse. Same data, replicated automatically.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-12">
              <StackPiece
                icon={<Server size={20} />}
                name="Cloudflare Worker"
                role="The county clerk"
                desc="Runs our MCP server code. Reads requests, queries the database, returns results. One per region."
                colors={colors}
              />
              <StackPiece
                icon={<Database size={20} />}
                name="Cloudflare D1"
                role="The file cabinets"
                desc="SQLite database where every scraped DEG inquiry is stored. Fully searchable. Replicated globally."
                colors={colors}
              />
              <StackPiece
                icon={<Package size={20} />}
                name="Cloudflare KV"
                role="The front-desk tray"
                desc="Frequently-requested records pre-pulled for instant access. Faster than digging in the cabinets."
                colors={colors}
              />
            </div>

            <div
              style={{
                padding: '1.5rem',
                backgroundColor: colors.cream,
                border: `1px dashed ${colors.line}`,
                fontSize: '0.9rem',
                color: colors.steel,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: colors.ink }}>Cost at our scale:</strong> approximately $0/month at launch.
              Cloudflare's free tier covers 100K requests/day, 5GB of database, and 25M database reads/day.
              We're nowhere near these limits.
            </div>

            <NavFooter
              onPrev={() => setActiveSection('mcp')}
              onNext={() => setActiveSection('flow')}
              prevLabel="MCP"
              nextLabel="The full flow"
              colors={colors}
            />
          </section>
        )}

        {/* FLOW */}
        {activeSection === 'flow' && (
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.rust,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              § 06 / The Full Flow
            </div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                marginBottom: '2rem',
              }}
            >
              A real shop's question, answered in <em style={{ fontStyle: 'italic', color: colors.rust }}>under a second</em>.
            </h2>

            <p style={{ fontSize: '1.1rem', lineHeight: 1.7, maxWidth: '60ch', marginBottom: '2.5rem' }}>
              Walk through what happens when an estimator in a real shop asks Claude a DEG question.
              Click <strong>Play</strong> to watch each step unfold, or click any step to jump there.
            </p>

            <div className="flex items-center gap-3 mb-8">
              <button
                onClick={() => {
                  if (flowStep >= 5) setFlowStep(0);
                  setAutoPlay(true);
                }}
                style={{
                  backgroundColor: colors.ink,
                  color: colors.cream,
                  padding: '0.6rem 1.2rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Sparkles size={14} /> {autoPlay ? 'Playing…' : flowStep >= 5 ? 'Replay' : 'Play the flow'}
              </button>
              <button
                onClick={() => { setFlowStep(0); setAutoPlay(false); }}
                style={{
                  background: 'transparent',
                  color: colors.steel,
                  padding: '0.6rem 1rem',
                  border: `1px solid ${colors.line}`,
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '0.85rem',
                }}
              >
                Reset
              </button>
            </div>

            <div className="space-y-3">
              {[
                {
                  num: '01',
                  actor: 'Estimator',
                  text: 'Insurer denied my time for blending a two-tone refinish. What DEG inquiries support my position?',
                  detail: 'A real estimator in their shop, asking Claude in plain English. No technical knowledge required.',
                },
                {
                  num: '02',
                  actor: 'Claude',
                  text: 'Selects the right MCP tool: deg_find_supporting',
                  detail: 'Claude reads the tool description ("USE THIS WHEN: writing a supplement and need DEG citations…") and routes the request automatically.',
                },
                {
                  num: '03',
                  actor: 'MCP request',
                  text: 'Form sent to deg.repairmcp.org',
                  detail: 'The standardized MCP request lands at our HTTPS endpoint, hosted on the nearest Cloudflare data center to the estimator\'s location.',
                },
                {
                  num: '04',
                  actor: 'Worker',
                  text: 'Reads form, queries database',
                  detail: 'Our Cloudflare Worker (the county clerk) reads the request, runs a full-text + bigram search across all DEG inquiries, ranks results by relevance + IP match + vehicle context.',
                },
                {
                  num: '05',
                  actor: 'Database',
                  text: 'Returns top inquiries with citations',
                  detail: 'D1 returns DEG #40990 as the bullseye match: 2023 Ford F-150, two-tone blend, CCC, resolved 4/8/2026. Plus supporting matches.',
                },
                {
                  num: '06',
                  actor: 'Claude',
                  text: 'Writes supplement language with verbatim citations',
                  detail: 'Claude composes ready-to-paste supplement narrative with DEG #40990 (4/8/2026) cited inline, the IP\'s exact response quoted, and the source URL linked. Total elapsed time: under one second.',
                },
              ].map((step, i) => (
                <FlowStep
                  key={i}
                  num={step.num}
                  actor={step.actor}
                  text={step.text}
                  detail={step.detail}
                  active={flowStep >= i}
                  current={flowStep === i}
                  onClick={() => { setFlowStep(i); setAutoPlay(false); }}
                  colors={colors}
                />
              ))}
            </div>

            <div
              style={{
                marginTop: '3rem',
                padding: '2rem',
                backgroundColor: colors.ink,
                color: colors.cream,
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.7rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginBottom: '1rem',
                  color: colors.amber,
                }}
              >
                What just happened
              </div>
              <p style={{ fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '70ch' }}>
                An estimator who never opened a browser tab, never visited DEG, never knew what an inquiry
                number is &mdash; just got a real DEG citation pasted into their supplement narrative,
                with the IP's verbatim response, in less time than it takes to refill coffee.
                <br /><br />
                <strong style={{ color: colors.amber }}>That's the entire pitch in one tool call.</strong>
              </p>
            </div>

            <NavFooter
              onPrev={() => setActiveSection('cloud')}
              onNext={() => setActiveSection('why')}
              prevLabel="Where data lives"
              nextLabel="Why it matters"
              colors={colors}
            />
          </section>
        )}

        {/* WHY */}
        {activeSection === 'why' && (
          <section>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.7rem',
                color: colors.rust,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              § 07 / Why It Matters
            </div>
            <h2
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 'clamp(1.8rem, 4vw, 3rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                marginBottom: '2rem',
              }}
            >
              The shop side gets a <em style={{ fontStyle: 'italic', color: colors.rust }}>seat</em> at
              <br />
              the AI estimating table.
            </h2>

            <div className="grid md:grid-cols-2 gap-12 mt-12">
              <div>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                  AI estimating tools are coming. They're already here, and the pace is accelerating.
                  The question isn't <em>if</em> &mdash; it's <em>whose data trains them</em>.
                </p>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                  Right now, insurer- and IP-aligned data is centralized, well-funded, and increasingly
                  AI-ready. Shop-aligned data &mdash; DEG, I-CAR, OEM, SCRS &mdash; is fragmented,
                  underfunded, and largely invisible to AI.
                </p>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.7 }}>
                  RepairMCP closes that gap. Open infrastructure, citation-grade, governed in the open.
                  The shop side stops being a passenger in the AI estimating wave and becomes a participant.
                </p>
              </div>

              <div className="space-y-4">
                <BulletPoint
                  num="01"
                  heading="Authoritative citations on demand"
                  text="DEG, I-CAR, OEM bulletins, position statements &mdash; all queryable from inside Claude, ChatGPT, or any MCP-compatible AI tool the shop already uses."
                  colors={colors}
                />
                <BulletPoint
                  num="02"
                  heading="Vertical-agnostic core"
                  text="One protocol, many sources. The same architecture that handles DEG today extends to NHTSA, I-CAR, OEM bulletins tomorrow."
                  colors={colors}
                />
                <BulletPoint
                  num="03"
                  heading="Open source, foundation-governed"
                  text="No proprietary lock-in. No vendor extraction. Apache 2.0 licensed. Built collaboratively with industry leaders."
                  colors={colors}
                />
                <BulletPoint
                  num="04"
                  heading="Junior estimator → senior estimator"
                  text="A green estimator with the right MCP-equipped AI tool can pull the same domain expertise a 25-year veteran carries in their head. Industry-wide accuracy lift."
                  colors={colors}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: '4rem',
                padding: '2.5rem',
                backgroundColor: colors.paper,
                border: `1px solid ${colors.line}`,
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.7rem',
                  color: colors.rust,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  marginBottom: '1.5rem',
                }}
              >
                Roadmap
              </div>
              <div className="grid md:grid-cols-4 gap-4">
                <RoadmapItem v="01" label="DEG" status="In development" current colors={colors} />
                <RoadmapItem v="02" label="I-CAR RTS" status="Next vertical" colors={colors} />
                <RoadmapItem v="03" label="NHTSA" status="API-based" colors={colors} />
                <RoadmapItem v="04" label="OEM Bulletins" status="Per-OEM review" colors={colors} />
              </div>
            </div>

            <NavFooter
              onPrev={() => setActiveSection('flow')}
              onNext={() => setActiveSection('intro')}
              prevLabel="The flow"
              nextLabel="Back to start"
              colors={colors}
            />
          </section>
        )}
      </main>

      <footer
        style={{
          borderTop: `1px solid ${colors.line}`,
          marginTop: '4rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.7rem',
          color: colors.steel,
          letterSpacing: '0.1em',
        }}
      >
        REPAIRMCP &middot; OPEN INFRASTRUCTURE &middot; APACHE 2.0 &middot; BUILT FOR THE SHOP SIDE
      </footer>
    </div>
  );
}

// ──────────── Subcomponents ────────────

function AnalogyRow({ icon, label, text, colors, last, accent }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.8rem',
        paddingBottom: last ? 0 : '0.8rem',
        borderBottom: last ? 'none' : `1px solid ${colors.line}`,
      }}
    >
      <div style={{ color: accent ? colors.rust : colors.steel, paddingTop: '2px' }}>{icon}</div>
      <div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            color: colors.steel,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '0.2rem',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: '0.9rem', color: colors.ink }} dangerouslySetInnerHTML={{ __html: text }} />
      </div>
    </div>
  );
}

function NavFooter({ onPrev, onNext, prevLabel, nextLabel, colors }) {
  return (
    <div
      className="flex items-center justify-between mt-16 pt-6"
      style={{ borderTop: `1px solid ${colors.line}` }}
    >
      <button
        onClick={onPrev}
        style={{
          background: 'transparent',
          border: 'none',
          color: colors.steel,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.85rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        ← {prevLabel}
      </button>
      <button
        onClick={onNext}
        style={{
          backgroundColor: colors.ink,
          color: colors.cream,
          padding: '0.7rem 1.3rem',
          border: 'none',
          cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '0.9rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        {nextLabel} <ChevronRight size={14} />
      </button>
    </div>
  );
}

function OptionCard({ title, tag, summary, pros, cons, colors, accent, highlighted }) {
  return (
    <div
      style={{
        backgroundColor: highlighted ? colors.paper : colors.cream,
        border: highlighted ? `2px solid ${accent}` : `1px solid ${colors.line}`,
        padding: '1.8rem',
        position: 'relative',
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          color: accent,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '0.8rem',
        }}
      >
        {tag}
      </div>
      <h3
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: '1.6rem',
          fontWeight: 700,
          marginBottom: '0.8rem',
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: colors.ink, marginBottom: '1.5rem', fontStyle: 'italic' }}>
        {summary}
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            color: colors.sage,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
          }}
        >
          + Pros
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {pros.map((p, i) => (
            <li key={i} style={{ fontSize: '0.85rem', lineHeight: 1.6, color: colors.ink, paddingLeft: '0.8rem', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: colors.sage }}>·</span>
              <span dangerouslySetInnerHTML={{ __html: p }} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            color: colors.rust,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
          }}
        >
          − Cons
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {cons.map((c, i) => (
            <li key={i} style={{ fontSize: '0.85rem', lineHeight: 1.6, color: colors.ink, paddingLeft: '0.8rem', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: colors.rust }}>·</span>
              <span dangerouslySetInnerHTML={{ __html: c }} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function KeyPoint({ heading, text, colors }) {
  return (
    <div style={{ padding: '1.5rem', backgroundColor: colors.paper, border: `1px solid ${colors.line}` }}>
      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: '1.1rem',
          fontWeight: 700,
          marginBottom: '0.6rem',
          color: colors.ink,
          lineHeight: 1.3,
        }}
      >
        {heading}
      </div>
      <p style={{ fontSize: '0.88rem', color: colors.ink, lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

function StackPiece({ icon, name, role, desc, colors }) {
  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: colors.cream,
        border: `1px solid ${colors.line}`,
        borderTop: `3px solid ${colors.amber}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: colors.ink, marginBottom: '0.8rem' }}>
        {icon}
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: '1.1rem', fontWeight: 700 }}>{name}</div>
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          color: colors.rust,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: '0.6rem',
        }}
      >
        {role}
      </div>
      <p style={{ fontSize: '0.85rem', color: colors.ink, lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}

function FlowStep({ num, actor, text, detail, active, current, onClick, colors }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        backgroundColor: current ? colors.ink : active ? colors.paper : colors.cream,
        color: current ? colors.cream : colors.ink,
        border: current ? 'none' : `1px solid ${colors.line}`,
        padding: '1.2rem',
        cursor: 'pointer',
        opacity: active ? 1 : 0.45,
        transition: 'all 0.4s ease',
        fontFamily: "'DM Sans', sans-serif",
        display: 'block',
      }}
    >
      <div className="flex items-baseline gap-3 mb-1">
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.8rem',
            color: current ? colors.amber : colors.rust,
            fontWeight: 500,
            letterSpacing: '0.1em',
          }}
        >
          {num}
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: current ? colors.amber : colors.steel,
          }}
        >
          {actor}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: '1.15rem',
          fontWeight: 500,
          lineHeight: 1.4,
          marginBottom: current ? '0.7rem' : 0,
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </div>
      {current && (
        <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: colors.cream, opacity: 0.85, paddingTop: '0.5rem', borderTop: `1px solid ${colors.steel}` }}>
          {detail}
        </div>
      )}
    </button>
  );
}

function BulletPoint({ num, heading, text, colors }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', padding: '1rem', backgroundColor: colors.paper, border: `1px solid ${colors.line}` }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.85rem',
          color: colors.rust,
          fontWeight: 500,
          letterSpacing: '0.05em',
          paddingTop: '2px',
        }}
      >
        {num}
      </div>
      <div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem' }}>
          {heading}
        </div>
        <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: colors.ink }}>{text}</p>
      </div>
    </div>
  );
}

function RoadmapItem({ v, label, status, current, colors }) {
  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: current ? colors.ink : colors.cream,
        color: current ? colors.cream : colors.ink,
        borderLeft: `3px solid ${current ? colors.amber : colors.steel}`,
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          color: current ? colors.amber : colors.steel,
          letterSpacing: '0.1em',
          marginBottom: '0.4rem',
        }}
      >
        / {v}
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.3rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.75rem', fontStyle: 'italic', opacity: 0.8 }}>{status}</div>
    </div>
  );
}
