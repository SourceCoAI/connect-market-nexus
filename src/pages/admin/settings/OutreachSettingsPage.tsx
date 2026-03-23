import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Save, RotateCcw, Mail } from 'lucide-react';

const DEFAULT_OUTREACH_TEMPLATE = `Hi {{first_name}},
We have an off-market {{deal_descriptor}} {{geography}} generating {{ebitda}} that could be a fit for {{buyer_ref}}.
Would you be interested in learning more?
Best,
[Sender Name]
SourceCo`;

const TEMPLATE_VARIABLES = [
  { variable: '{{first_name}}', description: "Buyer contact's first name" },
  { variable: '{{deal_descriptor}}', description: 'Deal descriptor from outreach profile (e.g. "residential and commercial roof repair company")' },
  { variable: '{{geography}}', description: 'Geography from outreach profile (e.g. "midwest")' },
  { variable: '{{ebitda}}', description: 'Formatted EBITDA from outreach profile (e.g. "$2,000,000")' },
  { variable: '{{buyer_ref}}', description: 'Derived per buyer type (e.g. "your Acme Corp platform" for PE, "your portfolio" for PE without platform, "your deal pipeline" for independent sponsors)' },
];

export default function OutreachSettingsPage() {
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState(DEFAULT_OUTREACH_TEMPLATE);

  const { data: savedTemplate, isLoading } = useQuery({
    queryKey: ['outreach-message-template'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'outreach_message_template')
        .maybeSingle();
      if (error) throw error;
      return data?.value || DEFAULT_OUTREACH_TEMPLATE;
    },
  });

  useEffect(() => {
    if (savedTemplate) {
      setTemplate(savedTemplate);
    }
  }, [savedTemplate]);

  const saveMutation = useMutation({
    mutationFn: async (value: string) => {
      const { data: existing } = await supabase
        .from('app_settings')
        .select('key')
        .eq('key', 'outreach_message_template')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('app_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', 'outreach_message_template');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('app_settings')
          .insert({ key: 'outreach_message_template', value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-message-template'] });
      toast({ title: 'Outreach template saved' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to save template',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(template.trim());
  };

  const handleReset = () => {
    setTemplate(DEFAULT_OUTREACH_TEMPLATE);
  };

  // Live preview with sample data
  const previewMessage = template
    .replace(/\{\{first_name\}\}/g, 'John')
    .replace(/\{\{deal_descriptor\}\}/g, 'residential and commercial roof repair company')
    .replace(/\{\{geography\}\}/g, 'midwest')
    .replace(/\{\{ebitda\}\}/g, '$2,000,000')
    .replace(/\{\{buyer_ref\}\}/g, 'your Greenrise Technologies platform');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Outreach Settings</h1>
        <p className="text-muted-foreground">
          Configure the email message template used for buyer outreach campaigns.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template Editor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Message Template
            </CardTitle>
            <CardDescription>
              This template is used when launching email outreach to buyers. Variables are replaced with actual deal and buyer data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template">Message Template</Label>
              <Textarea
                id="template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={10}
                className="font-mono text-sm"
                placeholder="Enter your outreach message template..."
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Available Variables</Label>
              <div className="grid grid-cols-1 gap-1">
                {TEMPLATE_VARIABLES.map(v => (
                  <div key={v.variable} className="flex items-start gap-2 text-xs">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-mono shrink-0">
                      {v.variable}
                    </code>
                    <span className="text-muted-foreground">{v.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="gap-1"
              >
                <Save className="h-3 w-3" />
                {saveMutation.isPending ? 'Saving...' : 'Save Template'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                className="gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Reset to Default
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>
              Sample message using example deal and buyer data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/30 p-4">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {previewMessage}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Sample for a PE buyer named "John" at "Greenrise Technologies" on a deal described as "residential and commercial roof repair company" in "midwest" generating "$2,000,000" EBITDA. The buyer_ref variable adapts per buyer type.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
