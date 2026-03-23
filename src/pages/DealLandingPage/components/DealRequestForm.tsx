import { useState, type FormEvent } from 'react';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { useDealLandingFormSubmit } from '@/hooks/useDealLandingFormSubmit';

const ROLE_OPTIONS = [
  'Private Equity',
  'Family Office',
  'Independent Sponsor',
  'Corporate',
  'Search Fund',
  'Individual Investor',
  'Consultant / Advisor',
  'Other',
];

interface DealRequestFormProps {
  listingId: string;
  dealTitle: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#F5F2ED',
  border: '1px solid #DDD8D0',
  borderRadius: 7,
  padding: '10px 14px',
  fontSize: '13.5px',
  color: '#1A1714',
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#3D3830',
  marginBottom: 6,
  letterSpacing: '0.03em',
  fontFamily: "'DM Sans', sans-serif",
};

export default function DealRequestForm({ listingId, dealTitle: _dealTitle }: DealRequestFormProps) {
  const { submit, isSubmitting, isSuccess, error } = useDealLandingFormSubmit(listingId);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !phone || !role || !message) return;
    submit({
      name: `${firstName} ${lastName}`.trim(),
      email,
      company,
      phone,
      role,
      message,
    });
  };

  const signupUrl = `/signup?from_deal=${listingId}&utm_source=landing_page&utm_medium=form_success&utm_content=post_submission_nudge`;

  if (isSuccess) {
    return (
      <div
        id="request-form"
        style={{
          background: '#FDFCFA',
          border: '1px solid #DDD8D0',
          borderRadius: 12,
          padding: 32,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <CheckCircle style={{ width: 24, height: 24, color: '#16a34a', flexShrink: 0 }} />
          <h3
            style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 22,
              color: '#1A1714',
            }}
          >
            Request Received
          </h3>
        </div>

        <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#3D3830', marginBottom: 24, fontWeight: 300 }}>
          Your request is being reviewed by our team. We'll be in touch shortly with next steps
          and detailed deal materials.
        </p>

        <div
          style={{
            background: '#F5EDD5',
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h4
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#1A1714',
              marginBottom: 8,
            }}
          >
            While you wait — explore more deals
          </h4>
          <p
            style={{
              fontSize: '12.5px',
              color: '#3D3830',
              lineHeight: 1.6,
              marginBottom: 12,
              fontWeight: 300,
            }}
          >
            Join our marketplace to browse 50+ vetted, founder-led businesses with $2M-50M revenue.
          </p>
          <a
            href={signupUrl}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              background: '#B8933A',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              padding: '12px 16px',
              borderRadius: 7,
              textDecoration: 'none',
              transition: 'background 0.15s',
            }}
          >
            <ArrowRight style={{ width: 16, height: 16 }} />
            Join the Marketplace — Free
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      id="request-form"
      style={{
        background: '#FDFCFA',
        border: '1px solid #DDD8D0',
        borderRadius: 12,
        padding: 32,
        marginTop: 16,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22,
          color: '#1A1714',
          marginBottom: 6,
        }}
      >
        Request Full Deal Details
      </div>
      <div
        style={{
          fontSize: '13.5px',
          color: '#6B6560',
          lineHeight: 1.5,
          marginBottom: 24,
          fontWeight: 300,
        }}
      >
        Get access to detailed financials, the CIM, and direct contact with the SourceCo deal team.
      </div>

      <form onSubmit={handleSubmit}>
        {/* Row 1: First Name + Last Name */}
        <div
          style={{ display: 'grid', gap: 14, marginBottom: 14 }}
          className="grid-cols-1 sm:grid-cols-2"
        >
          <div>
            <label style={labelStyle}>First Name *</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Alex"
              required
              style={inputStyle}
              className="focus:!border-[#1A1714] focus:!bg-[#FDFCFA]"
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Johnson"
              required
              style={inputStyle}
              className="focus:!border-[#1A1714] focus:!bg-[#FDFCFA]"
            />
          </div>
        </div>

        {/* Row 2: Email + Phone */}
        <div
          style={{ display: 'grid', gap: 14, marginBottom: 14 }}
          className="grid-cols-1 sm:grid-cols-2"
        >
          <div>
            <label style={labelStyle}>Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@firm.com"
              required
              style={inputStyle}
              className="focus:!border-[#1A1714] focus:!bg-[#FDFCFA]"
            />
          </div>
          <div>
            <label style={labelStyle}>Phone Number *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              required
              style={inputStyle}
              className="focus:!border-[#1A1714] focus:!bg-[#FDFCFA]"
            />
          </div>
        </div>

        {/* Company Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Company Name</label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Firm or company name"
            style={inputStyle}
            className="focus:!border-[#1A1714] focus:!bg-[#FDFCFA]"
          />
        </div>

        {/* Role Dropdown */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>What best describes you? *</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            style={{ ...inputStyle, appearance: 'none' as const }}
            className="focus:!border-[#1A1714] focus:!bg-[#FDFCFA]"
          >
            <option value="">Select your role</option>
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Mandate Textarea */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Your Interest or Mandate *</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Briefly describe your acquisition criteria or interest in this deal..."
            required
            style={{
              ...inputStyle,
              resize: 'vertical' as const,
              minHeight: 90,
            }}
            className="focus:!border-[#1A1714] focus:!bg-[#FDFCFA]"
          />
        </div>

        {error && (
          <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 8 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            background: '#1A1714',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: 14,
            fontSize: 15,
            fontWeight: 600,
            cursor: isSubmitting ? 'default' : 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            marginTop: 8,
            transition: 'background 0.15s',
            letterSpacing: '0.01em',
            opacity: isSubmitting ? 0.6 : 1,
          }}
          className="hover:!bg-[#333]"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Request for Full Details'}
        </button>

        <p
          style={{
            fontSize: '11.5px',
            color: '#6B6560',
            textAlign: 'center',
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          Your information is kept strictly confidential and shared only with the SourceCo deal
          team.
        </p>
      </form>
    </div>
  );
}
