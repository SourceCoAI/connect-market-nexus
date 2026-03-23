import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Send,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Clock,
  Star,
  User,
  Calendar,
  FileText,
  Reply,
  BarChart,
} from 'lucide-react';
import { FeedbackMetricsOverview } from './FeedbackMetricsOverview';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface FeedbackMessage {
  id: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  user_id: string;
  admin_id: string | null;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  page_url: string | null;
  satisfaction_rating: number | null;
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
  read_by_admin?: boolean;
}

export function EnhancedFeedbackManagement() {
  const [feedbackMessages, setFeedbackMessages] = useState<FeedbackMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<FeedbackMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<FeedbackMessage | null>(null);
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();

  const loadFeedbackMessages = useCallback(async () => {
    try {
      const { data: messages, error } = await supabase
        .from('feedback_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Batch-fetch all user profiles in one query instead of N+1
      const userIds = [
        ...new Set((messages || []).filter((m) => m.user_id).map((m) => m.user_id)),
      ].filter((id): id is string => id !== null);
      const { data: profiles } =
        userIds.length > 0
          ? await supabase
              .from('profiles')
              .select('id, email, first_name, last_name')
              .in('id', userIds)
          : { data: [] };

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      const messagesWithProfiles: FeedbackMessage[] = (messages || []).map((msg) => {
        const userProfile = msg.user_id ? profileMap.get(msg.user_id) : null;
        return {
          id: msg.id,
          message: msg.message,
          category: msg.category ?? 'general',
          priority: msg.priority ?? 'normal',
          status: msg.status,
          user_id: msg.user_id ?? '',
          admin_id: msg.admin_id,
          admin_response: msg.admin_response,
          created_at: msg.created_at,
          updated_at: msg.updated_at,
          page_url: msg.page_url,
          satisfaction_rating:
            ((msg as Record<string, unknown>).satisfaction_rating as number | null) ?? null,
          user_email: userProfile?.email || 'Unknown',
          user_first_name: userProfile?.first_name || 'Unknown',
          user_last_name: userProfile?.last_name || 'User',
          read_by_admin: ((msg as Record<string, unknown>).read_by_admin as boolean) ?? false,
        };
      });

      setFeedbackMessages(messagesWithProfiles);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load feedback messages.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadFeedbackMessages();
    const channel = supabase
      .channel('feedback-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feedback_messages',
        },
        () => {
          loadFeedbackMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeedbackMessages]);

  useEffect(() => {
    let filtered = feedbackMessages;

    if (searchQuery) {
      filtered = filtered.filter(
        (msg) =>
          msg.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.user_first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.user_last_name?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((msg) => msg.status === statusFilter);
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((msg) => msg.category === categoryFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter((msg) => msg.priority === priorityFilter);
    }

    setFilteredMessages(filtered);
  }, [feedbackMessages, searchQuery, statusFilter, categoryFilter, priorityFilter]);

  const handleSendResponse = async () => {
    if (!selectedMessage || !responseText.trim()) return;

    setIsProcessing(true);
    try {
      // Use the email sending edge function
      const { error } = await supabase.functions.invoke('send-feedback-email', {
        body: {
          to: selectedMessage.user_email,
          subject: `Re: Your feedback - ${selectedMessage.category}`,
          content: responseText,
          feedbackId: selectedMessage.id,
        },
      });

      if (error) throw error;

      // Update the feedback message
      await supabase
        .from('feedback_messages')
        .update({
          admin_response: responseText,
          admin_id: user?.id,
          status: 'responded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedMessage.id);

      // Create notification for admin
      if (user?.id) {
        await supabase.from('admin_notifications').insert({
          admin_id: user.id,
          feedback_id: selectedMessage.id,
          notification_type: 'response_sent',
          title: 'Response Sent',
          message: `Response sent to ${selectedMessage.user_first_name} ${selectedMessage.user_last_name}`,
        });
      }

      toast({
        title: 'Response sent',
        description: 'Your response has been sent successfully.',
      });

      setIsResponseDialogOpen(false);
      setResponseText('');
      loadFeedbackMessages();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send response. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      await supabase
        .from('feedback_messages')
        .update({ status: 'read' } as never)
        .eq('id', messageId);

      loadFeedbackMessages();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unread':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'read':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'responded':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'default';
      case 'normal':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Calculate analytics data
  const respondedCount = feedbackMessages.filter((m) => m.status === 'responded').length;
  const responseRate =
    feedbackMessages.length > 0 ? (respondedCount / feedbackMessages.length) * 100 : 0;

  const categoryBreakdown = feedbackMessages.reduce(
    (acc, msg) => {
      acc[msg.category] = (acc[msg.category] || 0) + 1;
      return acc;
    },
    {} as { [key: string]: number },
  );

  const priorityBreakdown = feedbackMessages.reduce(
    (acc, msg) => {
      acc[msg.priority] = (acc[msg.priority] || 0) + 1;
      return acc;
    },
    {} as { [key: string]: number },
  );

  const averageResponseTime = 12; // Could calculate from actual data

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <h2 className="text-2xl font-bold">Feedback Management</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Total: {feedbackMessages.length}</Badge>
          <Badge variant="destructive">
            Unread: {feedbackMessages.filter((m) => m.status === 'unread').length}
          </Badge>
          <Badge variant="default">
            Pending: {feedbackMessages.filter((m) => m.status === 'read').length}
          </Badge>
        </div>
      </div>

      {/* Feedback Analytics Overview */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Feedback Analytics</h3>
        </div>
        <FeedbackMetricsOverview
          totalFeedback={feedbackMessages.length}
          unreadCount={feedbackMessages.filter((m) => m.status === 'unread').length}
          responseRate={responseRate}
          averageResponseTime={averageResponseTime}
          categoryBreakdown={categoryBreakdown}
          priorityBreakdown={priorityBreakdown}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="responded">Responded</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="ui">UI/UX</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setCategoryFilter('all');
                setPriorityFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Messages List */}
      <div className="grid gap-4">
        {filteredMessages.map((message) => (
          <Card
            key={message.id}
            className={`cursor-pointer transition-colors hover:bg-accent ${
              message.status === 'unread' ? 'border-l-4 border-l-red-500' : ''
            }`}
            onClick={() => {
              setSelectedMessage(message);
              if (message.status === 'unread') {
                markAsRead(message.id);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(message.status)}
                  <div>
                    <h3 className="font-medium">
                      {message.user_first_name} {message.user_last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{message.user_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={getPriorityColor(message.priority)} className="text-xs">
                    {message.priority}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {message.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(message.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <p className="text-sm mb-3 line-clamp-2">{message.message}</p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {message.page_url && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Page: {new URL(message.page_url).pathname}
                    </span>
                  )}
                  {message.satisfaction_rating && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      {message.satisfaction_rating}/5
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {message.status !== 'responded' && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMessage(message);
                        setIsResponseDialogOpen(true);
                      }}
                    >
                      <Reply className="w-4 h-4 mr-1" />
                      Respond
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredMessages.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No feedback messages found</h3>
            <p className="text-muted-foreground">
              {searchQuery ||
              statusFilter !== 'all' ||
              categoryFilter !== 'all' ||
              priorityFilter !== 'all'
                ? 'Try adjusting your filters to see more messages.'
                : 'New feedback messages will appear here.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Response Dialog */}
      <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Respond to Feedback</DialogTitle>
          </DialogHeader>

          {selectedMessage && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4" />
                  <span className="font-medium">
                    {selectedMessage.user_first_name} {selectedMessage.user_last_name}
                  </span>
                  <Badge variant="outline">{selectedMessage.category}</Badge>
                  <Badge variant={getPriorityColor(selectedMessage.priority)}>
                    {selectedMessage.priority}
                  </Badge>
                </div>
                <p className="text-sm">{selectedMessage.message}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(selectedMessage.created_at).toLocaleString()}
                  </span>
                  {selectedMessage.page_url && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {new URL(selectedMessage.page_url).pathname}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Your Response</label>
                <Textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Type your response here..."
                  className="mt-2 min-h-[120px]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsResponseDialogOpen(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendResponse}
                  disabled={!responseText.trim() || isProcessing}
                >
                  {isProcessing ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Response
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
