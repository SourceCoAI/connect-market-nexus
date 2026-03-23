import { useMemo } from 'react';
import type { LandingPageDeal } from '@/hooks/useDealLandingPage';
import { stripIdentifyingInfo, buildLandingPageDealData } from '@/lib/deal-to-listing-anonymizer';
import { RichTextDisplay } from '@/components/ui/rich-text-display';

interface ContentSectionsProps {
  deal: LandingPageDeal;
}

function parseDescriptionSections(html: string): Array<{ title: string; html: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const sections: Array<{ title: string; html: string }> = [];
  let current: { title: string; html: string } | null = null;

  doc.body.childNodes.forEach((node) => {
    if (node.nodeName === 'H2') {
      if (current) sections.push(current);
      current = { title: node.textContent || '', html: '' };
    } else if (current) {
      current.html += (node as Element).outerHTML || node.textContent || '';
    }
  });
  if (current) sections.push(current);
  return sections;
}

const sectionCardStyle: React.CSSProperties = {
  background: '#FDFCFA',
  border: '1px solid #DDD8D0',
  borderRadius: 10,
  padding: 24,
  transition: 'box-shadow 0.15s',
  fontFamily: "'DM Sans', sans-serif",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '10.5px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#6B6560',
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: '1px solid #DDD8D0',
};

const sectionBodyStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#3D3830',
  lineHeight: 1.7,
  fontWeight: 300,
};

export default function ContentSections({ deal }: ContentSectionsProps) {
  const dealData = useMemo(() => buildLandingPageDealData(deal), [deal]);

  const anon = (text: string | null | undefined): string => {
    if (!text) return '';
    return stripIdentifyingInfo(text, dealData);
  };

  // Parse description_html into sections by H2 tags
  const parsedSections = useMemo(() => {
    if (deal.description_html) {
      return parseDescriptionSections(anon(deal.description_html));
    }
    return [];
  }, [deal.description_html, dealData]);

  // Prefer custom_sections (structured from memo) over description_html to avoid
  // rendering duplicate content — both are synced from the same teaser source.
  const customSections = deal.custom_sections ?? [];
  const hasCustomSections = customSections.length > 0;

  // Identify an "Owner Objectives" section for the exit card
  const ownerObjectivesSection = customSections.find(
    (s) => s.title.toLowerCase().includes('owner') || s.title.toLowerCase().includes('exit') || s.title.toLowerCase().includes('succession')
  );

  const categories = deal.categories || [];
  const services = deal.services || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Parsed H2 sections from description_html — only if no custom_sections to avoid duplicates */}
      {!hasCustomSections && parsedSections.length > 0 ? (
        parsedSections.map((section, i) => (
          <div key={`parsed-${i}`} style={sectionCardStyle} className="hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
            <div style={sectionTitleStyle}>{section.title}</div>
            <div style={sectionBodyStyle}>
              <RichTextDisplay content={section.html} />
            </div>
          </div>
        ))
      ) : !hasCustomSections && deal.description_html ? (
        // Fallback: single card with full description (only when no structured sections)
        <div style={sectionCardStyle} className="hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
          <div style={sectionTitleStyle}>Business Overview</div>
          <div style={sectionBodyStyle}>
            <RichTextDisplay content={anon(deal.description_html)} />
          </div>
        </div>
      ) : !hasCustomSections && deal.description ? (
        <div style={sectionCardStyle} className="hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
          <div style={sectionTitleStyle}>Business Overview</div>
          <div style={sectionBodyStyle}>
            <p>{anon(deal.description)}</p>
          </div>
        </div>
      ) : null}

      {/* Custom Sections */}
      {customSections.map((section, i) => (
        <div key={`custom-${i}`} style={sectionCardStyle} className="hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
          <div style={sectionTitleStyle}>{anon(section.title)}</div>
          <div style={sectionBodyStyle}>
            <RichTextDisplay content={anon(section.description)} />
          </div>
        </div>
      ))}

      {/* Tags Card */}
      {(categories.length > 0 || services.length > 0) && (
        <div style={sectionCardStyle} className="hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)]">
          <div
            style={{
              display: 'grid',
              gap: 12,
            }}
            className="grid-cols-1 sm:grid-cols-2"
          >
            {services.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#6B6560',
                    marginBottom: 10,
                  }}
                >
                  Service Capabilities
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {services.map((s, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#EDE9E2',
                        color: '#3D3830',
                        borderRadius: 5,
                        padding: '5px 11px',
                        fontSize: '12.5px',
                        fontWeight: 400,
                        border: '1px solid #DDD8D0',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {categories.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#6B6560',
                    marginBottom: 10,
                  }}
                >
                  Industry Categories
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {categories.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#EDE9E2',
                        color: '#3D3830',
                        borderRadius: 5,
                        padding: '5px 11px',
                        fontSize: '12.5px',
                        fontWeight: 400,
                        border: '1px solid #DDD8D0',
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exit Strategy Card */}
      {ownerObjectivesSection && (
        <div
          style={{
            background: '#1A1714',
            color: '#fff',
            borderRadius: 10,
            padding: 28,
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -30,
              right: -30,
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: 'rgba(184,147,58,0.12)',
            }}
          />
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
              marginBottom: 14,
            }}
          >
            Succession & Exit Strategy
          </div>
          <div
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 20,
              lineHeight: 1.3,
              marginBottom: 16,
              color: '#fff',
              maxWidth: 320,
            }}
          >
            {anon(ownerObjectivesSection.title)}
          </div>
          <div
            style={{
              fontSize: '13.5px',
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.55,
              fontWeight: 300,
            }}
          >
            <RichTextDisplay content={anon(ownerObjectivesSection.description)} />
          </div>
        </div>
      )}
    </div>
  );
}
