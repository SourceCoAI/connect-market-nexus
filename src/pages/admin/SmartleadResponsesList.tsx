import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  RefreshCw,
  Search,
  ExternalLink,
  User,
  Download,
  Inbox,
  CheckSquare,
  Archive,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  useSmartleadInbox,
  useSmartleadInboxRealtime,
  useUpdateInboxStatus,
  type InboxFilter,
  type SmartleadInboxItem,
} from '@/hooks/smartlead/use-smartlead-inbox';

const CATEGORY_CONFIG: Record<string, { emoji: string; label: string }> = {
  meeting_request: { emoji: '📅', label: 'Meeting' },
  interested: { emoji: '✨', label: 'Interested' },
  question: { emoji: '❓', label: 'Question' },
  referral: { emoji: '👤', label: 'Referral' },
  not_now: { emoji: '⏰', label: 'Not Now' },
  not_interested: { emoji: '👎', label: 'Not Interested' },
  unsubscribe: { emoji: '🚫', label: 'Unsubscribe' },
  out_of_office: { emoji: '🏖️', label: 'OOO' },
  negative_hostile: { emoji: '⚠️', label: 'Hostile' },
  neutral: { emoji: '➖', label: 'Neutral' },
};

function getSentimentColor(sentiment: string | null) {
  if (sentiment === 'positive') return 'bg-green-500/10 text-green-700 dark:text-green-400';
  if (sentiment === 'negative') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function SmartleadResponsesList() {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const { items, stats, isLoading, refetch } = useSmartleadInbox(filter, search);
  useSmartleadInboxRealtime();
  const updateStatus = useUpdateInboxStatus();

  const filterCards: {
    key: InboxFilter;
    label: string;
    count: number;
    icon: React.ReactNode;
    color: string;
  }[] = [
    { key: 'all', label: 'Total', count: stats.total, icon: <Mail className="h-4 w-4" />, color: '' },
    { key: 'meeting_request', label: 'Meetings', count: stats.meetings, icon: <Calendar className="h-4 w-4" />, color: 'text-blue-600' },
    { key: 'interested', label: 'Interested', count: stats.interested, icon: <Sparkles className="h-4 w-4" />, color: 'text-green-600' },
    { key: 'positive', label: 'Positive', count: stats.positive, icon: <ThumbsUp className="h-4 w-4" />, color: 'text-green-600' },
    { key: 'negative', label: 'Negative', count: stats.negative, icon: <ThumbsDown className="h-4 w-4" />, color: 'text-destructive' },
    { key: 'neutral', label: 'Neutral', count: stats.neutral, icon: <MinusCircle className="h-4 w-4" />, color: 'text-muted-foreground' },
  ];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const handleBulkAction = (status: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    updateStatus.mutate(
      { ids, status },
      {
        onSuccess: () => {
          toast.success(`Marked ${ids.length} items as ${status}`);
          setSelected(new Set());
        },
      },
    );
  };

  const handleExport = () => {
    if (items.length === 0) return;
    const headers = ['Name', 'Email', 'Campaign', 'Category', 'Sentiment', 'Subject', 'Preview', 'Replied At'];
    const rows = items.map((i) => [
      i.to_name || '',
      i.to_email || i.sl_lead_email || '',
      i.campaign_name || '',
      i.manual_category || i.ai_category || '',
      i.manual_sentiment || i.ai_sentiment || '',
      i.subject || '',
      (i.preview_text || '').replace(/"/g, '""'),
      i.time_replied || i.created_at,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartlead-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Smartlead Responses</h2>
          <p className="text-sm text-muted-foreground">AI-classified email replies from outreach campaigns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {filterCards.map((fc) => (
          <Card
            key={fc.key}
            className={`cursor-pointer transition-all hover:shadow-md ${
              filter === fc.key ? 'ring-2 ring-primary shadow-md' : ''
            }`}
            onClick={() => setFilter(fc.key)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <div className={fc.color}>{fc.icon}</div>
              <div>
                <p className="text-2xl font-bold">{fc.count}</p>
                <p className="text-xs text-muted-foreground">{fc.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Bulk actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search replies, emails, campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('reviewed')}>
              <CheckSquare className="h-3 w-3 mr-1" /> Reviewed
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('archived')}>
              <Archive className="h-3 w-3 mr-1" /> Archive
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('needs_followup')}>
              <Clock className="h-3 w-3 mr-1" /> Follow-up
            </Button>
          </div>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Inbox className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">No replies yet</p>
          <p className="text-sm text-muted-foreground">
            Replies from your SmartLead campaigns will appear here automatically.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-2 pr-4">
            {items.length > 0 && (
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  checked={selected.size === items.length && items.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
            )}
            {items.map((item) => (
              <InboxCard
                key={item.id}
                item={item}
                isSelected={selected.has(item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
                onClick={() => navigate(`/admin/marketplace/messages/smartlead/${item.id}`)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function InboxCard({
  item,
  isSelected,
  onToggleSelect,
  onClick,
}: {
  item: SmartleadInboxItem;
  isSelected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
}) {
  const category = item.manual_category || item.ai_category || 'neutral';
  const sentiment = item.manual_sentiment || item.ai_sentiment;
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.neutral;
  const preview = item.preview_text
    ? item.preview_text.substring(0, 150)
    : item.reply_body
      ? stripHtml(item.reply_body).substring(0, 150)
      : '';

  const timeAgo = item.time_replied
    ? formatDistanceToNow(new Date(item.time_replied), { addSuffix: true })
    : item.created_at
      ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
      : '';

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-sm ${
        item.status === 'new' ? 'border-l-4 border-l-primary' : ''
      }`}
    >
      <CardContent className="p-3 flex gap-3">
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
        </div>
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-center gap-2 mb-1">
            <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-sm truncate">
              {item.to_name || item.to_email || item.sl_lead_email || 'Unknown'}
            </span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getSentimentColor(sentiment)}`}>
              {sentiment || 'neutral'}
            </Badge>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {config.emoji} {config.label}
            </Badge>
            {item.status && item.status !== 'new' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                {item.status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            {item.campaign_name && <span className="truncate">{item.campaign_name}</span>}
            {item.sequence_number && <span>• Step {item.sequence_number}</span>}
            {item.subject && <span className="truncate">• {item.subject}</span>}
          </div>
          {preview && (
            <p className="text-xs text-muted-foreground line-clamp-2">{preview}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
          {item.ui_master_inbox_link && (
            <a
              href={item.ui_master_inbox_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
