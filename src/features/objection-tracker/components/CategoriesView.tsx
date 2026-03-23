import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Check, X, Plus, Sparkles, Loader2 } from 'lucide-react';
import { useAllCategories } from '../hooks/useObjectionCategories';
import { useObjectionMutations } from '../hooks/useObjectionMutations';

const ICON_OPTIONS = [
  'clock',
  'x-circle',
  'dollar-sign',
  'git-branch',
  'shield',
  'package',
  'minimize',
  'mail',
  'alert-circle',
  'help-circle',
  'trending-up',
  'phone',
  'user',
  'flag',
  'zap',
];

export function CategoriesView() {
  const { data: categories, isLoading } = useAllCategories();
  const { toggleCategory, approveCategory, dismissCategory, addCategory } =
    useObjectionMutations();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIcon, setNewIcon] = useState('help-circle');

  // Separate AI-suggested from regular
  const aiSuggested = (categories || []).filter(
    (c) => c.ai_suggested && !c.approved_by,
  );
  const regularCategories = (categories || []).filter(
    (c) => !c.ai_suggested || c.approved_by,
  );

  const handleAdd = () => {
    if (!newName.trim()) return;
    addCategory.mutate(
      { name: newName, description: newDescription, icon: newIcon },
      {
        onSuccess: () => {
          setAddOpen(false);
          setNewName('');
          setNewDescription('');
          setNewIcon('help-circle');
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Objection Categories</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Category
        </Button>
      </div>

      {/* AI-Suggested Categories */}
      {aiSuggested.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">AI Suggestions</h4>
          {aiSuggested.map((cat) => (
            <Card key={cat.id} className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">{cat.name}</span>
                  <Badge
                    variant="outline"
                    className="text-xs text-amber-600 border-amber-300"
                  >
                    Suggested by AI
                  </Badge>
                  {cat.description && (
                    <span className="text-sm text-muted-foreground hidden md:inline">
                      — {cat.description}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-green-600"
                    onClick={() => approveCategory.mutate(cat.id)}
                    disabled={approveCategory.isPending}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-red-600"
                    onClick={() => dismissCategory.mutate(cat.id)}
                    disabled={dismissCategory.isPending}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Categories Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Icon</TableHead>
              <TableHead className="text-right">Instances</TableHead>
              <TableHead className="text-right">Overcome Rate</TableHead>
              <TableHead>Playbook</TableHead>
              <TableHead className="text-right">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regularCategories.map((cat) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.name}</TableCell>
                <TableCell className="text-muted-foreground">{cat.icon || '—'}</TableCell>
                <TableCell className="text-right">{cat.instance_count}</TableCell>
                <TableCell className="text-right">
                  {cat.instance_count > 0 ? `${cat.overcome_rate}%` : '—'}
                </TableCell>
                <TableCell>
                  <PlaybookStatusBadge status={cat.playbook_status} />
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={cat.is_active}
                    onCheckedChange={(checked) =>
                      toggleCategory.mutate({ id: cat.id, is_active: checked })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add Category Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Industry Mismatch"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this category covers..."
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Icon</label>
              <Select value={newIcon} onValueChange={setNewIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_OPTIONS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      {icon}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!newName.trim() || addCategory.isPending}
            >
              {addCategory.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlaybookStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'published':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          Published
        </Badge>
      );
    case 'pending_review':
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Pending Review
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          None
        </Badge>
      );
  }
}
