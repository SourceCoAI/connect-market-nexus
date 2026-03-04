import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Hr,
  Row,
  Column,
} from '@react-email/components';
import * as React from 'react';

interface DealReassignmentEmailProps {
  previousOwnerName: string;
  dealTitle: string;
  companyName?: string;
  listingTitle?: string;
  newOwnerName?: string;
  newOwnerEmail?: string;
  dealId: string;
  isUnassignment?: boolean;
}

export const DealReassignmentEmail = ({
  _previousOwnerName,
  dealTitle,
  companyName,
  listingTitle,
  newOwnerName,
  newOwnerEmail,
  dealId,
  isUnassignment = false,
}: DealReassignmentEmailProps) => (
  <Html>
    <Head />
    <Preview>
      {companyName || dealTitle} • Deal{' '}
      {isUnassignment ? 'unassigned' : `reassigned to ${newOwnerName}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Simple Header */}
        <Section style={header}>
          <Text style={logo}>SourceCo</Text>
        </Section>

        {/* Main Message */}
        <Heading style={h1}>Deal {isUnassignment ? 'Unassigned' : 'Reassigned'}</Heading>
        <Text style={introText}>
          {isUnassignment
            ? 'This deal has been unassigned from you.'
            : `This deal has been reassigned to ${newOwnerName}.`}
        </Text>

        {/* Deal Information */}
        <Section style={infoSection}>
          {companyName && (
            <Row style={infoRow}>
              <Column style={infoLabelColumn}>
                <Text style={infoLabel}>Company</Text>
              </Column>
              <Column style={infoValueColumn}>
                <Text style={infoValue}>{companyName}</Text>
              </Column>
            </Row>
          )}

          <Row style={infoRow}>
            <Column style={infoLabelColumn}>
              <Text style={infoLabel}>Contact</Text>
            </Column>
            <Column style={infoValueColumn}>
              <Text style={infoValue}>{dealTitle}</Text>
            </Column>
          </Row>

          {listingTitle && (
            <Row style={infoRow}>
              <Column style={infoLabelColumn}>
                <Text style={infoLabel}>Listing</Text>
              </Column>
              <Column style={infoValueColumn}>
                <Text style={infoValue}>{listingTitle}</Text>
              </Column>
            </Row>
          )}

          {!isUnassignment && newOwnerName && (
            <>
              <Hr style={divider} />
              <Row style={infoRow}>
                <Column style={infoLabelColumn}>
                  <Text style={infoLabel}>New Owner</Text>
                </Column>
                <Column style={infoValueColumn}>
                  <Text style={infoValue}>
                    {newOwnerName}
                    {newOwnerEmail ? ` • ${newOwnerEmail}` : ''}
                  </Text>
                </Column>
              </Row>
            </>
          )}
        </Section>

        {/* CTA Button */}
        <Section style={buttonSection}>
          <Link
            style={button}
            href={`https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}`}
          >
            View Deal
          </Link>
        </Section>

        {/* Footer */}
        <Text style={footer}>SourceCo • Deal ID: {dealId}</Text>
      </Container>
    </Body>
  </Html>
);

export default DealReassignmentEmail;

// Stripe-inspired minimal styles
const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
};

const header = {
  marginBottom: '32px',
};

const logo = {
  fontSize: '18px',
  fontWeight: '600',
  color: '#1a1a1a',
  margin: '0',
  letterSpacing: '-0.01em',
};

const h1 = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.3',
  margin: '0 0 8px 0',
  letterSpacing: '-0.02em',
};

const introText = {
  color: '#666666',
  fontSize: '15px',
  lineHeight: '1.5',
  margin: '0 0 32px 0',
};

const infoSection = {
  background: '#fafafa',
  border: '1px solid #e5e5e5',
  borderRadius: '6px',
  padding: '20px 24px',
  marginBottom: '32px',
};

const infoRow = {
  marginBottom: '12px',
};

const infoLabelColumn = {
  width: '120px',
  verticalAlign: 'top' as const,
};

const infoValueColumn = {
  verticalAlign: 'top' as const,
};

const infoLabel = {
  color: '#999999',
  fontSize: '13px',
  fontWeight: '500',
  margin: '0',
};

const infoValue = {
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: '500',
  margin: '0',
};

const divider = {
  borderColor: '#e5e5e5',
  margin: '16px 0',
};

const buttonSection = {
  textAlign: 'center' as const,
  marginBottom: '40px',
};

const button = {
  backgroundColor: '#d7b65c',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 28px',
  borderRadius: '6px',
  lineHeight: '1',
};

const footer = {
  color: '#999999',
  fontSize: '12px',
  lineHeight: '1.5',
  textAlign: 'center' as const,
  margin: '0',
  borderTop: '1px solid #e5e5e5',
  paddingTop: '24px',
};
