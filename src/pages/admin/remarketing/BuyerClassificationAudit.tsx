import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Wrench,
  ExternalLink,
  ShieldCheck,
  Info,
} from 'lucide-react';
import {
  useBuyerAudit,
  type AuditViolation,
  type AuditSampleBuyer,
} from '@/hooks/admin/use-buyer-audit';

const SEVERITY_CONFIG: Record<string, { color: string; icon: typeof AlertTriangle; label: string }> = {
  critical: { color: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle, label: 'Critical' },
  high: { color: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertTriangle, label: 'High' },
  medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Info, label: 'Medium' },
  low: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Info, label: 'Low' },
  info: { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: Info, label: 'Info' },
};

function ViolationCard({ violation }: { violation: AuditViolation }) {
  const config = SEVERITY_CONFIG[violation.severity] || SEVERITY_CONFIG.info;
  const Icon = config.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border p-4 ${config.color}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <Icon className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-sm">
              {violation.code}: {violation.name}
            </div>
            <div className="text-xs mt-0.5 opacity-80">{violation.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-lg font-bold px-3">
            {violation.count}
          </Badge>
          {violation.count > 0 && violation.buyers.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs"
            >
              {expanded ? 'Hide' : 'Show'}
            </Button>
          )}
        </div>
      </div>
      {expanded && violation.buyers.length > 0 && (
        <div className="mt-3 space-y-1">
          {violation.buyers.slice(0, 20).map((b, i) => (
            <div key={i} className="text-xs bg-white/50 rounded px-2 py-1 flex items-center gap-2">
              <Link
                to={`/admin/buyers/${b.id}`}
                className="font-medium text-blue-700 hover:underline"
              >
                {String(b.company_name || 'Unknown')}
              </Link>
              {b.buyer_type && (
                <span className="opacity-60">type: {String(b.buyer_type)}</span>
              )}
              {b.pe_firm_name && (
                <span className="opacity-60">PE: {String(b.pe_firm_name)}</span>
              )}
            </div>
          ))}
          {violation.buyers.length > 20 && (
            <div className="text-xs opacity-60">
              ...and {violation.buyers.length - 20} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SampleRow({ buyer }: { buyer: AuditSampleBuyer }) {
  const isOk = buyer.classification_notes === 'OK';
  const isViolation = buyer.classification_notes.startsWith('VIOLATION');

  return (
    <tr className={isViolation ? 'bg-red-50' : isOk ? '' : 'bg-yellow-50'}>
      <td className="px-3 py-2 text-sm">
        <Link
          to={`/admin/buyers/${buyer.id}`}
          className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
        >
          {buyer.company_name}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </td>
      <td className="px-3 py-2 text-sm">
        <Badge variant="outline" className="text-xs">
          {buyer.buyer_type || 'NULL'}
        </Badge>
      </td>
      <td className="px-3 py-2 text-sm text-center">
        {buyer.is_pe_backed ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
        ) : (
          <span className="text-gray-300">-</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600">
        {buyer.pe_firm_name || '-'}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600">
        {buyer.industry_vertical || '-'}
      </td>
      <td className="px-3 py-2 text-sm text-gray-500">
        {buyer.buyer_type_source || '-'}
      </td>
      <td className="px-3 py-2 text-sm">
        {isOk ? (
          <span className="text-green-600 font-medium">OK</span>
        ) : (
          <span className={isViolation ? 'text-red-600 font-medium' : 'text-yellow-600'}>
            {buyer.classification_notes}
          </span>
        )}
      </td>
    </tr>
  );
}

const BuyerClassificationAudit = () => {
  const { audit, isLoading, runAudit, applyFixes, isFixing, fixResult } = useBuyerAudit();
  const [confirmFix, setConfirmFix] = useState(false);

  const totalViolations = audit
    ? Object.values(audit.violations).reduce((sum, v) => sum + (v.count || 0), 0)
    : 0;

  const sampleViolations = audit
    ? audit.random_sample.filter((b) => b.classification_notes !== 'OK').length
    : 0;

  return (
    <div className="p-6 space-y-6 bg-gray-50/50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Buyer Classification Audit
          </h1>
          <p className="text-sm text-muted-foreground">
            Deep audit of buyer type classifications across the platform
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => runAudit()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {audit ? 'Re-run Audit' : 'Run Audit'}
          </Button>
          {audit && totalViolations > 0 && (
            <>
              {!confirmFix ? (
                <Button variant="destructive" onClick={() => setConfirmFix(true)}>
                  <Wrench className="h-4 w-4 mr-2" />
                  Auto-Fix Violations
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      applyFixes();
                      setConfirmFix(false);
                    }}
                    disabled={isFixing}
                  >
                    {isFixing ? 'Fixing...' : 'Confirm Fix'}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmFix(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Fix Result Banner */}
      {fixResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          <div>
            <div className="font-semibold text-green-800">
              {fixResult.total_fixed} violations fixed
            </div>
            <div className="text-xs text-green-600">
              {Object.entries(fixResult.fixes_applied)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' | ')}
            </div>
          </div>
        </div>
      )}

      {!audit && !isLoading && (
        <div className="text-center py-20 text-muted-foreground">
          Click "Run Audit" to check buyer classifications
        </div>
      )}

      {audit && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Total Buyers</div>
              <div className="text-2xl font-bold">{audit.summary.total_active}</div>
              <div className="text-xs text-muted-foreground">
                {audit.summary.total_archived} archived
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">By Type</div>
              <div className="space-y-0.5 mt-1">
                {Object.entries(audit.summary.by_buyer_type)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex justify-between text-xs">
                      <span>{type === '_null' ? 'unclassified' : type}</span>
                      <span className="font-mono font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">PE-Backed by Type</div>
              <div className="space-y-0.5 mt-1">
                {Object.keys(audit.summary.pe_backed_by_type).length === 0 ? (
                  <div className="text-xs text-gray-400">None</div>
                ) : (
                  Object.entries(audit.summary.pe_backed_by_type).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-xs">
                      <span>{type}</span>
                      <span className="font-mono font-medium">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Violations</div>
              <div className={`text-2xl font-bold ${totalViolations === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalViolations}
              </div>
              <div className="text-xs text-muted-foreground">
                across {Object.values(audit.violations).filter((v) => v.count > 0).length} categories
              </div>
            </div>
          </div>

          {/* Violation Details */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Violation Checks</h2>
            <div className="space-y-2">
              {Object.values(audit.violations)
                .sort((a, b) => {
                  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                  const oa = order[a.severity as keyof typeof order] ?? 5;
                  const ob = order[b.severity as keyof typeof order] ?? 5;
                  return oa - ob || b.count - a.count;
                })
                .map((v) => (
                  <ViolationCard key={v.code} violation={v} />
                ))}
            </div>
          </div>

          {/* 50-Buyer Random Sample */}
          <div>
            <h2 className="text-lg font-semibold mb-1">
              Random Sample (50 buyers)
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              {sampleViolations === 0 ? (
                <span className="text-green-600 font-medium">
                  All 50 sampled buyers are correctly classified
                </span>
              ) : (
                <span className="text-red-600 font-medium">
                  {sampleViolations} of 50 sampled buyers have issues
                </span>
              )}
            </p>
            <div className="bg-white rounded-lg border overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-3 py-2 text-xs font-medium text-gray-500">Company</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500">Type</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 text-center">PE-Backed</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500">PE Firm</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500">Industry</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500">Source</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {audit.random_sample.map((buyer) => (
                    <SampleRow key={buyer.id} buyer={buyer} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Timestamp */}
          <div className="text-xs text-muted-foreground text-right">
            Audit run at: {new Date(audit.audit_timestamp).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
};

export default BuyerClassificationAudit;
