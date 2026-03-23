import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';

interface AliasRow {
  id: string;
  profile_id: string;
  alias: string;
}
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function TeamMemberRegistry() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Fetch team members with their aliases
  const { data: members, isLoading } = useQuery({
    queryKey: ['team-member-registry'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles!inner(id, first_name, last_name, email)')
        .in('role', ['owner', 'admin', 'moderator']);

      const { data: aliases } = await untypedFrom('team_member_aliases').select('*');

      const aliasMap = new Map<string, { id: string; alias: string }[]>();
      for (const a of (aliases || []) as unknown as AliasRow[]) {
        const existing = aliasMap.get(a.profile_id) || [];
        existing.push({ id: a.id, alias: a.alias });
        aliasMap.set(a.profile_id, existing);
      }

      return (
        (roles || []) as unknown as Array<{
          user_id: string;
          role: string;
          profiles: {
            id: string;
            first_name: string | null;
            last_name: string | null;
            email: string;
          };
        }>
      ).map((r) => ({
        // Use user_id directly from user_roles (matches auth.uid()) to ensure
        // consistent IDs with the assignee_id filter in useDailyTasks.
        id: r.user_id,
        name: `${r.profiles.first_name || ''} ${r.profiles.last_name || ''}`.trim(),
        email: r.profiles.email,
        role: r.role,
        aliases: aliasMap.get(r.user_id) || [],
      }));
    },
    staleTime: 60_000,
  });

  // Add alias mutation
  const addAlias = useMutation({
    mutationFn: async ({ profileId, alias }: { profileId: string; alias: string }) => {
      const { error } = await untypedFrom('team_member_aliases').insert({
        profile_id: profileId,
        alias: alias.trim(),
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-member-registry'] });
      toast({ title: 'Alias added' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to add alias', description: err.message, variant: 'destructive' });
    },
  });

  // Remove alias mutation
  const removeAlias = useMutation({
    mutationFn: async (aliasId: string) => {
      const { error } = await untypedFrom('team_member_aliases').delete().eq('id', aliasId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-member-registry'] });
      toast({ title: 'Alias removed' });
    },
  });

  const [newAliases, setNewAliases] = useState<Record<string, string>>({});

  const handleAddAlias = (profileId: string) => {
    const alias = newAliases[profileId]?.trim();
    if (!alias) return;
    addAlias.mutate({ profileId, alias });
    setNewAliases((prev) => ({ ...prev, [profileId]: '' }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Team Member Name Mapping
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Map Fireflies speaker names to team members. Add aliases for nicknames or transcription
          variants.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(members || []).map((member) => (
          <div key={member.id} className="space-y-2 p-3 rounded-lg border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{member.name || member.email}</p>
                <p className="text-[11px] text-muted-foreground">{member.email}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {member.role}
              </Badge>
            </div>

            {/* Existing aliases */}
            <div className="flex flex-wrap gap-1.5">
              {member.aliases.map((a: { id: string; alias: string }) => (
                <Badge key={a.id} variant="secondary" className="text-xs gap-1 pr-1">
                  {a.alias}
                  <button
                    onClick={() => removeAlias.mutate(a.id)}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {member.aliases.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">
                  No aliases — first name will be used for matching
                </span>
              )}
            </div>

            {/* Add new alias */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add alias (e.g., Tom, Tommy)"
                value={newAliases[member.id] || ''}
                onChange={(e) =>
                  setNewAliases((prev) => ({ ...prev, [member.id]: e.target.value }))
                }
                onKeyDown={(e) => e.key === 'Enter' && handleAddAlias(member.id)}
                className="h-7 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => handleAddAlias(member.id)}
                disabled={!newAliases[member.id]?.trim() || addAlias.isPending}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
